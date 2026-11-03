import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  gatherMaterials,
  plantPlot,
  tendPlot,
  harvestPlot,
  PLOT_LIMIT,
} from '../public/game.js';

const setup = (regionId = 'xingyun', realm = '元婴初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  player.spiritStones = 10000;
  return { player, world };
};

const guardNode = (rank = 3) => ({
  id: 'xingyun_矿脉_0', region: 'xingyun', kind: '矿脉',
  material: '陨铁', rarity: '仙品', respawnMonths: 2400, harvestedMonth: null,
  guard: { name: '护脉石傀', rank, hp: 6 + rank, maxHp: 6 + rank, defeated: false, aggroUntil: null },
});

test('守护是场短斗：低境界打不过，受伤撤退并记仇', () => {
  const { player, world } = setup('xingyun', '金丹初期');
  world.nodes = [guardNode(3)];
  const hp0 = player.hp;
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.5);
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('斗了'), res.note);
  assert.ok(res.hpLoss > 0);
  assert.ok(player.hp < hp0);
  const g = world.nodes[0].guard;
  assert.equal(g.defeated, false);
  assert.ok(g.hp < g.maxHp, '守护应被打掉一些耐久');
  assert.ok(g.aggroUntil > 0, '应记仇');
});

test('记仇期间再靠近：绕开，不再交手', () => {
  const { player, world } = setup('xingyun', '金丹初期');
  world.nodes = [guardNode(3)];
  gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.5);
  const hp1 = player.hp;
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.5);
  assert.ok(res.note.includes('气头上'), res.note);
  assert.equal(player.hp, hp1, '绕开不该再受伤');
});

test('高境界带攻击法宝：几合之内打倒守护', () => {
  const { player, world } = setup('xingyun', '元婴初期');
  world.nodes = [guardNode(3)];
  applyStateUpdates(player, world, { itemChanges: [{ name: '青竹蜂云剑', delta: 1 }] });
  applyStateUpdates(player, world, { equipChanges: [{ name: '青竹蜂云剑', equipped: true }] });
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.1);
  assert.ok(res.note.includes('击退'), res.note);
  assert.equal(world.nodes[0].guard.defeated, true);
  assert.ok(Object.values(res.items).reduce((a, b) => a + b, 0) >= 1);
});

test('灵田：种下要一份作种，未熟不能收', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  applyStateUpdates(player, world, { itemChanges: [{ name: '灵草', delta: 2 }] });
  const res = plantPlot(world, player, { material: '灵草' });
  assert.equal(res.ok, true);
  assert.equal(world.plots.length, 1);
  assert.equal(world.inventory.find((it) => it.name === '灵草').qty, 1);

  const early = harvestPlot(world, player, { id: 'plot_1' });
  assert.equal(early.ok, false);
  assert.ok(early.reason.includes('尚未成熟'));
});

test('成熟后收成：凡品两年，一次两份', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  applyStateUpdates(player, world, { itemChanges: [{ name: '灵草', delta: 1 }] });
  plantPlot(world, player, { material: '灵草' });
  world.date = { year: 4, month: 1, day: 1 }; // 三年后
  const res = harvestPlot(world, player, { id: 'plot_1' });
  assert.equal(res.ok, true);
  assert.equal(world.inventory.find((it) => it.name === '灵草').qty, 2);
  assert.equal(world.plots.length, 0, '收完即归田');
});

test('照料缩短成熟：耗灵石，约提前两成', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  applyStateUpdates(player, world, { itemChanges: [{ name: '灵草', delta: 1 }] });
  plantPlot(world, player, { material: '灵草' });
  const before = world.plots[0].matureMonth;
  const stones = player.spiritStones;
  const res = tendPlot(world, player, { id: 'plot_1' });
  assert.equal(res.ok, true);
  assert.ok(world.plots[0].matureMonth < before);
  assert.ok(player.spiritStones < stones);
});

test('最多三处灵田，且要当地养得活', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  applyStateUpdates(player, world, { itemChanges: [{ name: '灵草', delta: 5 }] });
  assert.equal(plantPlot(world, player, { material: '灵草' }).ok, true);
  assert.equal(plantPlot(world, player, { material: '灵草' }).ok, true);
  assert.equal(plantPlot(world, player, { material: '灵草' }).ok, true);
  const fourth = plantPlot(world, player, { material: '灵草' });
  assert.equal(fourth.ok, false);
  assert.ok(fourth.reason.includes(String(PLOT_LIMIT)));

  const wrong = setup('qingwu', '筑基初期');
  applyStateUpdates(wrong.player, wrong.world, { itemChanges: [{ name: '陨铁', delta: 1 }] });
  const bad = plantPlot(wrong.world, wrong.player, { material: '陨铁' });
  assert.equal(bad.ok, false);
  assert.ok(bad.reason.includes('养不活'));
});

test('回合结算：plant / harvest 走系统并给回执', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  applyStateUpdates(player, world, { itemChanges: [{ name: '灵草', delta: 2 }] });
  const note = applyStateUpdates(player, world, { plant: { material: '灵草' } });
  assert.ok(note.includes('【开垦】'));
  assert.equal(world.plots.length, 1);

  world.date = { year: 4, month: 1, day: 1 };
  const harvest = applyStateUpdates(player, world, { harvestPlot: { id: 'plot_1' } });
  assert.ok(harvest.includes('【收成】'));
});
