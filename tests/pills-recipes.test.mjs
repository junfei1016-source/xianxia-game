import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  brewPill,
} from '../public/game.js';
import { PILLS, TIERS, recipeOf, brewChance, pillByName } from '../public/pills.js';

const setup = (items = []) => {
  const player = newPlayerState();
  const world = newWorldState();
  world.date = { year: 1, month: 1, day: 1 };
  world.inventory = items.map((i) => ({ ...i }));
  return { player, world };
};

const give = (world, name, qty) => applyStateUpdates(newPlayerState(), world, {
  itemChanges: [{ name, delta: qty, kind: '材料' }],
});

test('丹库够用：三十味上下，四类来源都有人', () => {
  assert.ok(PILLS.length >= 28, `实际 ${PILLS.length}`);
  for (const tier of Object.keys(TIERS)) {
    assert.ok(PILLS.some((p) => p.tier === tier), `${tier} 类没有丹药`);
  }
  assert.ok(PILLS.some((p) => p.kind === '疗伤'));
  assert.ok(PILLS.some((p) => p.kind === '破境'));
});

test('丹方折算：上古更难更贵，残缺要三张残页', () => {
  const ancient = recipeOf(pillByName('大还丹'));
  const common = recipeOf(pillByName('回春丹'));
  assert.ok(ancient.chance < common.chance);
  assert.ok(ancient.price > common.price);
  const fragment = recipeOf(pillByName('玄阴丹'));
  assert.equal(fragment.pieces, 3);
});

test('火源影响成丹率：地火比真火高，残缺未拼齐则为零', () => {
  const pill = pillByName('回春丹');
  assert.ok(brewChance(pill, { fire: '地火' }) > brewChance(pill, { fire: '真火' }));
  assert.equal(brewChance(pill, { intact: false }), 0);
});

test('得到丹方：登记进 world.recipes，带来源与成丹率', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newRecipes: [{ name: '回春丹方', pill: '回春丹', source: '坊市买来的' }] });
  const rec = world.recipes.find((r) => r.name === '回春丹方');
  assert.ok(rec);
  assert.equal(rec.tier, '常见');
  assert.ok(rec.chance > 0);
  assert.equal(rec.source, '坊市买来的');
});

test('残缺丹方：残页不齐不能开炉，凑齐才能炼', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newRecipes: [{ name: '玄阴丹方', pill: '玄阴丹' }] });
  const rec = world.recipes.find((r) => r.name === '玄阴丹方');
  assert.equal(rec.have, 0);

  const early = brewPill(world, player, { recipe: '玄阴丹方' }, () => 0);
  assert.equal(early.ok, false);
  assert.ok(early.reason.includes('残缺'));

  applyStateUpdates(player, world, { recipePieces: [{ name: '玄阴丹方', delta: 3 }] });
  assert.equal(world.recipes.find((r) => r.name === '玄阴丹方').have, 3);
});

test('开炉成功：扣材料、出丹药', () => {
  const { player, world } = setup();
  give(world, '回春草', 3);
  give(world, '灵泉水', 1);
  applyStateUpdates(player, world, { newRecipes: [{ name: '回春丹方', pill: '回春丹' }] });

  const res = brewPill(world, player, { recipe: '回春丹方', fire: '地火' }, () => 0);
  assert.equal(res.success, true);
  assert.ok(res.note.includes('成了'));
  assert.ok(world.inventory.some((it) => it.name === '回春丹' && it.qty === 1));
  const grass = world.inventory.find((it) => it.name === '回春草');
  assert.ok(!grass || grass.qty === 0, '材料应被扣掉');
});

test('材料不足：拒绝开炉，一根草都不动', () => {
  const { player, world } = setup();
  give(world, '回春草', 1); // 需要 3
  applyStateUpdates(player, world, { newRecipes: [{ name: '回春丹方', pill: '回春丹' }] });
  const before = JSON.stringify(world.inventory);
  const res = brewPill(world, player, { recipe: '回春丹方' }, () => 0);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('材料不足'));
  assert.equal(JSON.stringify(world.inventory), before);
});

test('炼丹失败：照样扣料，只出一颗废丹', () => {
  const { player, world } = setup();
  give(world, '回春草', 3);
  give(world, '灵泉水', 1);
  applyStateUpdates(player, world, { newRecipes: [{ name: '回春丹方', pill: '回春丹' }] });
  const res = brewPill(world, player, { recipe: '回春丹方' }, () => 0.99);
  assert.equal(res.success, false);
  assert.ok(world.inventory.some((it) => it.name === '废丹' && it.qty === 1));
  assert.ok(!world.inventory.some((it) => it.name === '回春丹'));
});

test('没丹方不能炼：连炉都不开', () => {
  const { player, world } = setup();
  const res = brewPill(world, player, { recipe: '不存在的丹方' }, () => 0);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('未得'));
});

test('校验层接受 newRecipes / recipePieces / brewPills', () => {
  const { out } = validateStateOutput({
    newRecipes: [{ name: '回春丹方', pill: '回春丹' }],
    recipePieces: [{ name: '玄阴丹方', delta: 1 }],
    brewPills: [{ recipe: '回春丹方', fire: '地火' }],
  });
  assert.equal(out.newRecipes.length, 1);
  assert.equal(out.recipePieces.length, 1);
  assert.equal(out.brewPills[0].fire, '地火');
});

test('上古丹方也能拿到，但成丹率明显更低', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newRecipes: [{ name: '大还丹方', pill: '大还丹' }] });
  const ancient = world.recipes.find((r) => r.name === '大还丹方');
  assert.equal(ancient.tier, '上古');
  assert.ok(ancient.chance <= 0.4);
});
