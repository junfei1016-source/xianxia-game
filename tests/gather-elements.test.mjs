import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  gatherMaterials,
} from '../public/game.js';
import {
  elementalBrewAdjust,
  gatherPool,
  GATHER_KINDS,
  materialByName,
  materialTier,
} from '../public/materials.js';

const setup = (regionId = 'qingwu', realm = '筑基初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  return { player, world };
};

test('采集分类：采药取草木灵液，挖矿取矿石灵木，猎妖取妖兽', () => {
  assert.deepEqual(GATHER_KINDS.采药, ['灵草', '灵花', '灵果', '灵液']);
  assert.ok(gatherPool('qingwu', '采药').every((m) => ['灵草', '灵花', '灵果', '灵液'].includes(m.kind)));
  assert.ok(gatherPool('xingyun', '挖矿').some((m) => m.name === '星砂'));
  assert.ok(gatherPool('wanyao', '猎妖').some((m) => m.name === '妖丹'));
});

test('青芜采药：出的都是本地草木灵液，不会冒出陨铁', () => {
  const { player, world } = setup('qingwu');
  const res = gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.3);
  assert.equal(res.ok, true);
  const names = Object.keys(res.items);
  assert.ok(names.length >= 1);
  for (const n of names) {
    const m = materialByName(n);
    assert.ok(['灵草', '灵花', '灵果', '灵液'].includes(m.kind), `${n} 不该在采药里`);
  }
  assert.ok(world.inventory.length >= 1, '材料应入包');
});

test('天数决定份数：三日一份，八日两份，上限三十日', () => {
  const three = setup('qingwu');
  const r3 = gatherMaterials(three.world, three.player, { kind: '采药', days: 3 }, () => 0);
  assert.equal(Object.values(r3.items).reduce((a, b) => a + b, 0), 1);

  const eight = setup('qingwu');
  const r8 = gatherMaterials(eight.world, eight.player, { kind: '采药', days: 8 }, () => 0);
  assert.equal(r8.days, 8);
  assert.equal(Object.values(r8.items).reduce((a, b) => a + b, 0), 2);
});

test('境界不够，取不了高阶之物', () => {
  const low = setup('xingyun', '炼气初期'); // 星陨挖矿全是玄品以上
  const res = gatherMaterials(low.world, low.player, { kind: '挖矿', days: 5 }, () => 0.5);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('非你修为'));

  const high = setup('xingyun', '元婴初期');
  const ok = gatherMaterials(high.world, high.player, { kind: '挖矿', days: 5 }, () => 0.5);
  assert.equal(ok.ok, true);
});

test('此地无此物：仙域的灵液不能"挖矿"', () => {
  const { player, world } = setup('taiqing', '化神初期');
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 5 });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('没有可挖矿'));
});

test('野外有风险：险地猎妖可能挨打', () => {
  const { player, world } = setup('wanyao', '金丹初期'); // 慕兰草原危险 5，且有得猎
  const hp0 = player.hp;
  const res = gatherMaterials(world, player, { kind: '猎妖', days: 4 }, () => 0.01);
  assert.equal(res.ok, true);
  assert.ok(res.hpLoss > 0, '应有伤');
  assert.ok(player.hp < hp0);
  assert.ok(res.note.includes('气血 -'));
});

test('回合结算：采集会吃日历，并给回执', () => {
  const { player, world } = setup('qingwu');
  const report = {};
  applyStateUpdates(player, world, { gather: { kind: '采药', days: 12 } }, report);
  assert.equal(report.out.gather, undefined, 'gather 只用于结算');
  assert.ok(report.out.timeMonths > 0.3, `timeMonths 应为 ${report.out.timeMonths}`);
});

test('五行：木助火、水压火、阴寒压火，地火放大', () => {
  const mu = elementalBrewAdjust(['灵草'], '真火');
  assert.ok(mu.delta > 0);
  const muDi = elementalBrewAdjust(['灵草'], '地火');
  assert.ok(muDi.delta > mu.delta, '地火更旺');

  const shui = elementalBrewAdjust(['灵泉水'], '真火');
  assert.ok(shui.delta < 0);
  assert.ok(shui.notes.includes('水压火'));

  const yin = elementalBrewAdjust(['阴煞之气'], '真火');
  assert.ok(yin.delta < 0);
});

test('五行加成有上下限，不会离谱', () => {
  const many = elementalBrewAdjust(['灵草', '灵草', '灵草', '灵草', '灵草', '灵草'], '地火');
  assert.ok(many.delta <= 0.2);
  const bad = elementalBrewAdjust(['灵泉水', '灵泉水', '灵泉水', '灵泉水', '阴煞之气'], '地火');
  assert.ok(bad.delta >= -0.2);
});

test('炼丹配方里能看出五行差：木属主药的成丹率高于水属主药', () => {
  const jueqi = elementalBrewAdjust(['灵草'], '地火'); // 聚气丹：灵草
  const huadu = elementalBrewAdjust(['化毒花', '灵泉水'], '地火'); // 化毒丹：花+水
  assert.ok(jueqi.delta > huadu.delta);
});
