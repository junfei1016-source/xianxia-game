import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  itemPrice,
  tradeItem,
} from '../public/game.js';

const setup = (patch = {}) => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  player.reputation = 50; // 基准：声望中庸，不折不让
  player.spiritStones = 1000;
  Object.assign(world, patch);
  return { player, world };
};

test('定价看区域：同一个坊市价，黑市翻倍', () => {
  const { player, world } = setup();
  assert.equal(itemPrice(world, player, '回春丹'), 15);
  world.geo = { regionId: 'chisha', sinceTurn: 0, migrated: false };
  assert.equal(itemPrice(world, player, '回春丹'), 30);
});

test('定价看声望：高声望让利，低声望抬价', () => {
  const { player, world } = setup();
  player.reputation = 90;
  assert.ok(itemPrice(world, player, '回春丹') < 15);
  player.reputation = 10;
  assert.ok(itemPrice(world, player, '回春丹') > 15);
});

test('买入：扣灵石、进背包', () => {
  const { player, world } = setup();
  const res = tradeItem(world, player, { action: 'buy', item: '回春丹', qty: 2 });
  assert.equal(res.ok, true);
  assert.equal(player.spiritStones, 1000 - 30);
  assert.ok(world.inventory.some((it) => it.name === '回春丹' && it.qty === 2));
});

test('灵石不够：拒绝，钱货两不动', () => {
  const { player, world } = setup();
  player.spiritStones = 10;
  const before = JSON.stringify(world.inventory);
  const res = tradeItem(world, player, { action: 'buy', item: '回春丹' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('灵石不够'));
  assert.equal(player.spiritStones, 10);
  assert.equal(JSON.stringify(world.inventory), before);
});

test('卖出：按五五折回收，货减少、钱增加', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { itemChanges: [{ name: '回春丹', delta: 2, kind: '丹药' }] });
  const res = tradeItem(world, player, { action: 'sell', item: '回春丹', qty: 1 });
  assert.equal(res.ok, true);
  assert.equal(player.spiritStones, 1000 + Math.round(15 * 0.55));
  assert.equal(world.inventory.find((it) => it.name === '回春丹').qty, 1);
});

test('卖自己没有的货：拒绝并说明', () => {
  const { player, world } = setup();
  const res = tradeItem(world, player, { action: 'sell', item: '大还丹' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('货不够'));
});

test('买丹方：登记进已知丹方，钱照扣', () => {
  const { player, world } = setup();
  const price = itemPrice(world, player, '回春丹方');
  const res = tradeItem(world, player, { action: 'buy', item: '回春丹方' });
  assert.equal(res.ok, true);
  assert.equal(player.spiritStones, 1000 - price);
  assert.ok(world.recipes.some((r) => r.name === '回春丹方'));
});

test('已会的丹方不能重复买', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newRecipes: [{ name: '回春丹方', pill: '回春丹' }] });
  const res = tradeItem(world, player, { action: 'buy', item: '回春丹方' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('已经有一份'));
});

test('不认识的货不估价：不接这单', () => {
  const { player, world } = setup();
  const res = tradeItem(world, player, { action: 'buy', item: '路边捡的石子' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('不是市面上'));
});

test('回合内通过 trades 结算，并给出回执', () => {
  const { player, world } = setup();
  const note = applyStateUpdates(player, world, {
    trades: [{ action: 'buy', item: '回春丹', qty: 1 }, { action: 'buy', item: '聚气丹', qty: 1 }],
  });
  assert.ok(note.includes('【交易】'));
  assert.equal(player.spiritStones, 1000 - 15 - 18);
});

test('校验层接受 trades，坏条目被丢弃', () => {
  const { out } = validateStateOutput({
    trades: [{ action: 'buy', item: '回春丹' }, { item: '缺 action' }],
  });
  assert.equal(out.trades.length, 1);
  assert.equal(out.trades[0].action, 'buy');
});
