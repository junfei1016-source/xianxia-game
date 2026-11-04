import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  tradeItem,
  auctionBid,
  isBlackMarket,
  isForbiddenGood,
} from '../public/game.js';

const setup = (regionId = 'chisha') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 3, day: 1 }; // 三月为拍卖会期
  player.reputation = 50;
  player.spiritStones = 5000;
  return { player, world };
};

test('黑市判断与禁制识别', () => {
  assert.equal(isBlackMarket(setup('chisha').world), true);
  assert.equal(isBlackMarket(setup('qingwu').world), false);
  assert.equal(isForbiddenGood('蚀骨丹'), true);
  assert.equal(isForbiddenGood('蚀骨丹方'), true);
  assert.equal(isForbiddenGood('回春丹'), false);
});

test('黑市能买禁制丹，代价是正邪', () => {
  const { player, world } = setup('chisha');
  const res = tradeItem(world, player, { action: 'buy', item: '蚀骨丹' });
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('正邪 −3'));
  assert.equal(player.morality, -3);
  assert.ok(world.inventory.some((it) => it.name === '蚀骨丹'));
});

test('正经坊市不卖禁制之物', () => {
  const { player, world } = setup('qingwu');
  const res = tradeItem(world, player, { action: 'buy', item: '蚀骨丹' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('黑市'));
  assert.equal(player.spiritStones, 5000);
});

test('黑市也能买到禁制丹方', () => {
  const { player, world } = setup('chisha');
  player.spiritStones = 60000; // 禁制丹方在黑市不便宜（基价×来源×3×黑市2倍）
  const res = tradeItem(world, player, { action: 'buy', item: '血煞丹方' });
  assert.equal(res.ok, true);
  assert.ok(world.recipes.some((r) => r.name === '血煞丹方'));
});

test('拍卖：出价压过对手就落槌，扣钱入库', () => {
  const { player, world } = setup('luoxia');
  const before = player.spiritStones;
  const res = auctionBid(world, player, { item: '回春丹', bid: 25 }, () => 0); // 对手约 18
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('落槌'));
  assert.equal(player.spiritStones, before - 25);
  assert.ok(world.inventory.some((it) => it.name === '回春丹'));
});

test('拍卖：出价不够高就没拍到，灵石一分不动', () => {
  const { player, world } = setup('luoxia');
  const before = player.spiritStones;
  const res = auctionBid(world, player, { item: '回春丹', bid: 25 }, () => 1); // 对手约 28
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('压过'));
  assert.equal(player.spiritStones, before);
});

test('拍卖：低于起拍价直接拒', () => {
  const { player, world } = setup('luoxia');
  const res = auctionBid(world, player, { item: '回春丹', bid: 5 }, () => 0);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('起拍价'));
});

test('拍卖只有黄枫谷坊市有', () => {
  const { player, world } = setup('qingwu');
  const res = auctionBid(world, player, { item: '回春丹', bid: 100 }, () => 0);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('黄枫谷坊市'));
});

test('拍卖丹方：拍下后进已知丹方', () => {
  const { player, world } = setup('luoxia');
  const res = auctionBid(world, player, { item: '回春丹方', bid: 80 }, () => 0);
  assert.equal(res.ok, true);
  assert.ok(world.recipes.some((r) => r.name === '回春丹方'));
});

test('回合内拍卖结算并给回执；校验层接受 auctionBids', () => {
  const { player, world } = setup('luoxia');
  const note = applyStateUpdates(player, world, { auctionBids: [{ item: '回春丹', bid: 40 }] });
  assert.ok(note.includes('【拍卖】'));

  const { out } = validateStateOutput({
    auctionBids: [{ item: '回春丹', bid: 30 }, { item: '缺出价' }],
  });
  assert.equal(out.auctionBids.length, 1);
});
