import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  gatherMaterials,
  forgeTreasure,
} from '../public/game.js';
import { materialByName } from '../public/materials.js';
import { treasureByName, treasurePower } from '../public/treasures.js';

const setup = (regionId = 'qingwu', realm = '金丹初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  player.spiritStones = 100000;
  return { player, world };
};

const give = (world, player, name, n = 1) => applyStateUpdates(player, world, { itemChanges: [{ name, delta: n }] });

test('采集点：第一次采集会发现药圃/矿脉/妖巢', () => {
  const { player, world } = setup('qingwu');
  const res = gatherMaterials(world, player, { kind: '采药', days: 4 }, () => 0.2);
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('药圃'), res.note);
  assert.equal(world.nodes.length, 3);
  for (const n of world.nodes) {
    assert.equal(n.region, 'qingwu');
    assert.ok(materialByName(n.material), `${n.material} 应在材料名录里`);
    assert.equal(n.kind, '药圃');
  }
});

test('采集点会枯竭：把三处都采空后只能碰运气', () => {
  const { player, world } = setup('qingwu');
  for (let i = 0; i < 3; i++) gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.2);
  const res = gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.2);
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('枯竭'), res.note);
  const total = Object.values(res.items).reduce((a, b) => a + b, 0);
  assert.equal(total, 1, '野外只能采一份');
});

test('隔年恢复：三处都采空后，过几年再采又能满份', () => {
  const { player, world } = setup('qingwu');
  for (let i = 0; i < 3; i++) gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.2);
  const dry = gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.2);
  assert.ok(dry.note.includes('枯竭'), '三处应已采空');

  world.date = { year: 4, month: 4, day: 1 }; // 凡品两年一熟，过了三年多
  const res = gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.2);
  assert.ok(!res.note.includes('枯竭'), res.note);
  assert.equal(Object.values(res.items).reduce((a, b) => a + b, 0), 2);
});

test('炼器成功：扣材料、出法宝', () => {
  const { player, world } = setup('金丹初期');
  give(world, player, '灵草', 2);
  give(world, player, '雷击木', 2);
  const res = forgeTreasure(world, player, { name: '青竹蜂云剑', materials: ['灵草', '雷击木'], fire: '真火' }, () => 0);
  assert.equal(res.ok, true);
  assert.equal(res.success, true);
  assert.ok(world.inventory.some((it) => it.name === '青竹蜂云剑' && it.tier === '上品法宝'));
  assert.equal(world.inventory.find((it) => it.name === '灵草').qty, 1);
});

test('炼器失败：材料照扣，只出废器', () => {
  const { player, world } = setup('金丹初期');
  give(world, player, '灵草', 2);
  give(world, player, '雷击木', 2);
  const res = forgeTreasure(world, player, { name: '青竹蜂云剑', materials: ['灵草', '雷击木'] }, () => 0.99);
  assert.equal(res.success, false);
  assert.ok(world.inventory.some((it) => it.name === '废器'));
  assert.ok(!world.inventory.some((it) => it.name === '青竹蜂云剑'));
});

test('材料不够、或名录外，都炼不了', () => {
  const { player, world } = setup('金丹初期');
  give(world, player, '灵草', 1);
  const few = forgeTreasure(world, player, { name: '青竹蜂云剑', materials: ['灵草'] }, () => 0);
  assert.equal(few.ok, false);
  assert.ok(few.reason.includes('两味'));

  const unknown = forgeTreasure(world, player, { name: '不知名的宝', materials: ['灵草', '雷击木'] }, () => 0);
  assert.equal(unknown.ok, false);
  assert.ok(unknown.reason.includes('炼器谱'));
});

test('五行配材：木属助木剑，水属坏事', () => {
  const wood = setup('金丹初期');
  give(wood.world, wood.player, '灵草', 2);
  give(wood.world, wood.player, '雷击木', 2);
  const good = forgeTreasure(wood.world, wood.player, { name: '青竹蜂云剑', materials: ['灵草', '雷击木'] }, () => 0.3);

  const metal = setup('金丹初期');
  give(metal.world, metal.player, '玄铁', 2);
  give(metal.world, metal.player, '赤铜', 2);
  const bad = forgeTreasure(metal.world, metal.player, { name: '青竹蜂云剑', materials: ['玄铁', '赤铜'] }, () => 0.3);

  assert.equal(good.success, true, '木属配材应成');
  assert.equal(bad.success, false, '金属克木，同一掷点应失败');
});

test('法宝五行相冲：火属与金属同时装备，双方威力减半', () => {
  const { player, world } = setup('金丹初期');
  // 多宝环提供第二件法宝槽（不在名录，靠词条生效）
  world.inventory = [
    { name: '纳宝环', kind: '法宝', qty: 1, affix: '多宝', equipped: true },
    { name: '赤焰旗', kind: '法宝', qty: 1, tier: '下品法宝' },
    { name: '玄铁飞剑', kind: '法宝', qty: 1, tier: '中品法宝' },
  ];
  applyStateUpdates(player, world, { equipChanges: [{ name: '赤焰旗', equipped: true }, { name: '玄铁飞剑', equipped: true }] });
  const fire = world.inventory.find((it) => it.name === '赤焰旗');
  const metal = world.inventory.find((it) => it.name === '玄铁飞剑');
  assert.equal(fire.conflict, true);
  assert.equal(metal.conflict, true);
  assert.ok(treasurePower(fire, player.realm) < 1, '相冲后威力打折');
});

test('五行相生不冲：木剑与火旗同装备无碍', () => {
  const { player, world } = setup('金丹初期');
  world.inventory = [
    { name: '纳宝环', kind: '法宝', qty: 1, affix: '多宝', equipped: true },
    { name: '青竹蜂云剑', kind: '法宝', qty: 1, tier: '上品法宝' },
    { name: '赤焰旗', kind: '法宝', qty: 1, tier: '下品法宝' },
  ];
  applyStateUpdates(player, world, { equipChanges: [{ name: '青竹蜂云剑', equipped: true }, { name: '赤焰旗', equipped: true }] });
  assert.equal(world.inventory.find((it) => it.name === '青竹蜂云剑').conflict, false);
});

test('回合结算：forge 走系统并给回执', () => {
  const { player, world } = setup('金丹初期');
  give(world, player, '灵草', 2);
  give(world, player, '雷击木', 2);
  const report = {};
  applyStateUpdates(player, world, { forge: { name: '青竹蜂云剑', materials: ['灵草', '雷击木'] } }, report);
  assert.equal(report.out.forge, undefined);
});
