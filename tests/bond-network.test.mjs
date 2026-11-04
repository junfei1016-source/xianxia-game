// 关系网：人情债真的会动，朋友的仇人也是仇人。
// 原文：第 1583 章（担保人：人情是有价的东西）、第 1356 章（立功换前程）、
//       第 273 章（结仇之后见面就是仇家）。四维账本 debt/grudge/trust/need 本来就有，这轮让它闭环。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  addDebt,
  repayDebt,
  settleDebts,
  propagateBonds,
  debtSummary,
  findCompanion,
  bondOf,
  clampBond,
  betrayalCheck,
  growNpcLinks,
} from '../public/game.js';

const setup = () => {
  const player = newPlayerState();
  player.realm = '金丹初期';
  player.cultivation = 20;
  const world = newWorldState();
  world.eraType = '盛世';
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 30, month: 6, day: 1 };
  world.turn = 70;
  world.npcs = [
    { name: '苏瑶', desc: '道侣', relation: '道侣', bond: { debt: 0, grudge: 0, trust: 40, need: 20 } },
    { name: '田掌柜', desc: '坊市掌柜', relation: '旧识', bond: { debt: 0, grudge: 0, trust: 30, need: 20 } },
  ];
  return { player, world };
};

test('欠人情记在账上，也记进流水', () => {
  const { world } = setup();
  const note = addDebt(world, '苏瑶', 20, '替你挡了一记');
  assert.match(note, /人情/);
  assert.equal(bondOf(world.npcs[0]).debt, 20);
  assert.equal(world.debtLog.length, 1);
  assert.equal(world.debtLog[0].npc, '苏瑶');
});

test('还人情：debt 降、trust 涨、grudge 消', () => {
  const { player, world } = setup();
  addDebt(world, '田掌柜', 40, '借你灵石');
  const before = bondOf(world.npcs[1]);
  const res = repayDebt(world, player, '田掌柜');
  assert.equal(res.ok, true);
  const after = bondOf(world.npcs[1]);
  assert.ok(after.debt < before.debt, '债要减少');
  assert.ok(after.trust > before.trust, '交情要变好');
  assert.equal(repayDebt(world, player, '不存在的人').ok, false);
});

test('不还就催：信任掉、怨气涨，交情深的可宽限', () => {
  const { player, world } = setup();
  addDebt(world, '田掌柜', 30, '帮忙');
  addDebt(world, '苏瑶', 30, '帮忙');
  world.npcs[0].bond.trust = 85; // 苏瑶交情硬，可宽限
  const t0 = bondOf(world.npcs[1]).trust;
  const notes = settleDebts(world, player);
  assert.ok(bondOf(world.npcs[1]).trust < t0, '普通交情会被催');
  assert.equal(bondOf(world.npcs[0]).trust, 85, '交情硬的宽限');
  assert.ok(Array.isArray(notes));
});

test('债太久了会记恨', () => {
  const { player, world } = setup();
  addDebt(world, '田掌柜', 80, '大恩');
  world.npcs[1].bond.trust = 40;
  world.npcs[1].bond.grudge = 48;
  const notes = settleDebts(world, player);
  assert.ok(bondOf(world.npcs[1]).grudge > 48);
  assert.match(notes.join(''), /人情债/);
});

test('关系网传导：甲恨你，乙也跟着冷', () => {
  const { world } = setup();
  world.npcLinks = [{ a: '田掌柜', b: '苏瑶', type: '旧识', note: '' }];
  world.npcs[1].bond = { debt: 0, grudge: 70, trust: 20, need: 20 };
  const before = bondOf(world.npcs[0]).trust;
  propagateBonds(world);
  assert.ok(bondOf(world.npcs[0]).trust < before, '乙的信任下降');
});

test('关系网传导：甲信你，乙也跟着亲近', () => {
  const { world } = setup();
  world.npcLinks = [{ a: '田掌柜', b: '苏瑶', type: '旧识', note: '' }];
  world.npcs[1].bond = { debt: 0, grudge: 0, trust: 80, need: 20 };
  const before = bondOf(world.npcs[0]).trust;
  propagateBonds(world);
  assert.ok(bondOf(world.npcs[0]).trust > before);
});

test('联手：交情深（trust ≥ 60）的人也肯搭手，不只看关系名分', () => {
  const { world } = setup();
  world.npcs[0].relation = '旧识'; // 名分上不亲，但交情深
  world.npcs[0].bond = { debt: 0, grudge: 0, trust: 62, need: 20 };
  assert.equal(findCompanion(world).name, '苏瑶');
});

test('人情债汇总：只列欠着的，按欠多少排', () => {
  const { world } = setup();
  addDebt(world, '苏瑶', 10, 'x');
  addDebt(world, '田掌柜', 50, 'y');
  const list = debtSummary(world);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, '田掌柜', '欠得多的排前面');
  assert.ok(list.every((x) => x.debt > 0));
});

test('走时间会把催债与传导跑起来', () => {
  const { player, world } = setup();
  addDebt(world, '田掌柜', 30, '帮忙');
  world.npcLinks = [{ a: '田掌柜', b: '苏瑶', type: '旧识' }];
  const t0 = bondOf(world.npcs[0]).trust;
  advanceTime(world, player, 12);
  assert.ok(Array.isArray(world.lastOutlawEvents));
});

test('应用层入口：repayDebt 字段能还人情', () => {
  const { player, world } = setup();
  addDebt(world, '田掌柜', 30, '帮忙');
  const note = applyStateUpdates(player, world, { repayDebt: { name: '田掌柜' } });
  assert.match(note, /还情/);
  assert.ok(bondOf(world.npcs[1]).debt < 30);
});


test('硬债有期限：到期不还直接结仇，交情再硬也没用', () => {
  const { player, world } = setup();
  world.npcs[1].bond.trust = 95; // 交情极硬
  addDebt(world, '田掌柜', 40, '救命之恩', 'hard');
  const entry = world.debts.find((d) => d.kind === 'hard');
  assert.ok(Number.isFinite(entry.dueMonth), '硬债要记到期月份');
  world.date = { year: 40, month: 12, day: 1 }; // 拖过期限
  const notes = settleDebts(world, player);
  assert.match(notes.join(''), /赖账/);
  const after = bondOf(world.npcs[1]);
  assert.ok(after.grudge >= 60, '怨气大涨');
  assert.equal(world.npcs[1].relation, '敌对');
});

test('软债看时间：交情硬可以一直宽限，不会结仇', () => {
  const { player, world } = setup();
  world.npcs[1].bond.trust = 95;
  addDebt(world, '田掌柜', 40, '抬了句话', 'soft');
  world.date = { year: 99, month: 1, day: 1 };
  const notes = settleDebts(world, player);
  assert.equal(notes.length, 0, '软债不催交情深的人');
  assert.notEqual(world.npcs[1].relation, '敌对');
});

test('背叛：怨满信空的人会反水', () => {
  const { player, world } = setup();
  world.npcs[0].bond = { debt: 0, grudge: 80, trust: 10, need: 20 };
  let calls = 0;
  const res = betrayalCheck(world, player, 'guard', () => (calls++ === 0 ? 0.1 : 0.1));
  assert.ok(res && res.npc === '苏瑶');
  assert.match(res.note, /反水/);
  assert.equal(world.npcs[0].relation, '敌对');
});

test('背叛：交情深的人不会反水', () => {
  const { world, player } = setup();
  world.npcs[0].bond = { debt: 0, grudge: 20, trust: 80, need: 20 };
  assert.equal(betrayalCheck(world, player, 'guard', () => 0.1), null);
});

test('人脉会长：每季给两个人牵一条线，不重复', () => {
  const { world } = setup();
  world.npcLinks = [];
  let seed = 5;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const grown = growNpcLinks(world, rand);
  assert.ok(grown && grown.a && grown.b);
  assert.equal(world.npcLinks.length, 1);
  // 已经认识的那对不再加
  const again = growNpcLinks(world, () => 0);
  assert.ok(world.npcLinks.length <= 2);
});

test('四维都有上下限，不会被灌爆', () => {
  assert.equal(clampBond(999), 100);
  assert.equal(clampBond(-999), 0, '四维都是 0..100 的绝对值');
  assert.equal(clampBond(Number.NaN), 0);
});
