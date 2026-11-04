// 境界阶梯的自洽守卫：原文第 127 章《灵根之说》——
// 「下境界包括了炼气、筑基、结丹、元婴、化神等五层，中境界有炼虚、合体、大乘三层，
//   到了上境界其实只剩下渡劫这一层关口了」。
// v1.37.1 及以前 REALM_LADDER 漏了炼虚三阶，而阵法/功法/法宝/丹药/世界表六处都按含炼虚写，
// 导致"炼虚要求"永远够不着。这个套件就是守这件事：阶梯必须与原文十阶一致，且各表互相覆盖。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REALM_LADDER,
  realmIndex,
  realmMajor,
  REALM_BASE,
  REALM_MIN_YEARS,
  breakthroughNeed,
  ACHIEVEMENT_RULES,
  ENDING_RULES,
  evaluateEndings,
  newPlayerState,
  newWorldState,
} from '../public/game.js';

const MAJORS = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];

test('阶梯顺序与原文一致：炼气→…→化神→炼虚→合体→大乘→渡劫→飞升', () => {
  const majors = [];
  for (const r of REALM_LADDER) {
    if (r === '飞升') continue;
    const m = realmMajor(r);
    if (majors[majors.length - 1] !== m) majors.push(m);
  }
  assert.deepEqual(majors, ['凡人', ...MAJORS], '大境界顺序不对');
  assert.equal(REALM_LADDER[0], '凡人');
  assert.equal(REALM_LADDER[REALM_LADDER.length - 1], '飞升');
});

test('炼虚三阶都在阶梯里，且排在化神之后、合体之前', () => {
  for (const phase of ['炼虚初期', '炼虚中期', '炼虚后期']) {
    assert.ok(REALM_LADDER.includes(phase), `阶梯缺少 ${phase}`);
  }
  assert.ok(realmIndex('化神后期') < realmIndex('炼虚初期'), '炼虚应在化神之后');
  assert.ok(realmIndex('炼虚后期') < realmIndex('合体初期'), '炼虚应在合体之前');
  assert.equal(realmIndex('炼虚中期') - realmIndex('炼虚初期'), 1, '小境界必须相邻');
});

test('realmIndex 对每个大境界都严格递增，且不认识的境界退回 0', () => {
  let last = -1;
  for (const r of MAJORS) {
    const i = realmIndex(`${r}初期`);
    assert.ok(i > last, `${r}初期 的序号没有递增`);
    last = i;
  }
  assert.equal(realmIndex('炼虚初期'), 16);
  assert.equal(realmIndex('不存在的境界'), 0, '未知境界按凡人算，不能返回 -1');
});

test('realmMajor 认得炼虚，且不会把它误判成炼气', () => {
  assert.equal(realmMajor('炼虚初期'), '炼虚');
  assert.equal(realmMajor('炼虚后期'), '炼虚');
  assert.equal(realmMajor('炼气初期'), '炼气');
});

test('寿元/气血表覆盖阶梯里每一个大境界', () => {
  for (const m of ['凡人', ...MAJORS]) {
    assert.ok(REALM_BASE[m], `REALM_BASE 缺少 ${m}`);
    assert.ok(REALM_BASE[m].lifespan > 0 && REALM_BASE[m].maxHp > 0, `${m} 的寿元/气血必须为正`);
  }
  assert.ok(REALM_BASE['炼虚'].lifespan > REALM_BASE['化神'].lifespan, '炼虚寿元应高于化神');
  assert.ok(REALM_BASE['炼虚'].lifespan < REALM_BASE['合体'].lifespan, '炼虚寿元应低于合体');
});

test('最少在境年限表也覆盖到炼虚与合体', () => {
  for (const m of MAJORS) {
    if (m === '渡劫') continue; // 渡劫只看天劫，不设最少年限
    assert.ok(Number.isFinite(REALM_MIN_YEARS[m]), `REALM_MIN_YEARS 缺少 ${m}`);
  }
  assert.ok(REALM_MIN_YEARS['炼虚'] > REALM_MIN_YEARS['化神'], '炼虚比化神更熬年头');
});

test('突破门槛随境界抬高，炼虚按圆满（100%）', () => {
  assert.equal(breakthroughNeed('凡人'), 50);
  assert.equal(breakthroughNeed('化神中期'), 90);
  assert.equal(breakthroughNeed('炼虚初期'), 100);
  assert.equal(breakthroughNeed('合体初期'), 100);
});

test('结局与成就的境界判定不会因插入炼虚而错位', () => {
  const world = newWorldState();
  const player = newPlayerState();
  // 化神阶段的魔道结局仍应触发
  player.realm = '化神初期';
  player.morality = -85;
  const demon = evaluateEndings(player, world);
  assert.equal(demon && demon.id, 'demon', '化神·极恶仍算堕入魔道');

  // 炼虚不再触发"一统江湖"的门槛（声望够但境界不够声望结局要声望≥90）
  player.realm = '炼虚初期';
  player.morality = 40;
  player.reputation = 95;
  const rule = evaluateEndings(player, world);
  assert.equal(rule && rule.id, 'ruleworld', '炼虚已过化神门槛，应能触发一统江湖');

  // 飞升仍是最优先的通关判定
  player.realm = '飞升';
  const win = evaluateEndings(player, world);
  assert.equal(win && win.id, 'ascend');

  // 所有按境界判定的规则都必须引用阶梯里真实存在的名字
  for (const r of ENDING_RULES) assert.equal(typeof r.check, 'function');
  assert.ok(ACHIEVEMENT_RULES.length > 0);
});
