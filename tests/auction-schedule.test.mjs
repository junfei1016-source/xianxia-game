import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  auctionBid,
  auctionWindow,
  buildGMMessages,
  AUCTION_MONTHS,
} from '../public/game.js';

const setup = (month = 3, regionId = 'luoxia') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month, day: 1 };
  player.reputation = 50;
  player.spiritStones = 5000;
  return { player, world };
};

test('会期是每年三月与九月', () => {
  assert.deepEqual(AUCTION_MONTHS, [3, 9]);
  assert.equal(auctionWindow(setup(3).world).open, true);
  assert.equal(auctionWindow(setup(9).world).open, true);
  assert.equal(auctionWindow(setup(4).world).open, false);
});

test('不在会期：拒拍，并说清下一场在哪个月、还有几个月', () => {
  const { player, world } = setup(4);
  const res = auctionBid(world, player, { item: '回春丹', bid: 50 });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('不在会期'));
  assert.ok(res.reason.includes('9 月'));
  assert.ok(res.reason.includes('5 个月'));
});

test('跨年排期：十月之后是次年三月', () => {
  const win = auctionWindow(setup(10).world);
  assert.equal(win.next.year, 2);
  assert.equal(win.next.month, 3);
  assert.equal(win.next.inMonths, 5);
});

test('会期内照常成交', () => {
  const { player, world } = setup(9);
  const res = auctionBid(world, player, { item: '回春丹', bid: 40 }, () => 0);
  assert.equal(res.ok, true);
  assert.ok(res.reason === undefined);
});

test('不在黄枫谷坊市，连会期也没用', () => {
  const { player, world } = setup(3, 'qingwu');
  const res = auctionBid(world, player, { item: '回春丹', bid: 50 });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('黄枫谷坊市'));
});

test('提示词报排期：会期说"本月开拍"，非会期说"还有几个月"', () => {
  const open = setup(3);
  const openText = buildGMMessages(open.player, open.world, [], '去坊市').map((m) => m.content).join('\n');
  assert.ok(openText.includes('【拍卖排期】'));
  assert.ok(openText.includes('本月正是黄枫谷坊市的拍卖会'));

  const closed = setup(4);
  const closedText = buildGMMessages(closed.player, closed.world, [], '去坊市').map((m) => m.content).join('\n');
  assert.ok(closedText.includes('下一场拍卖在'));
});

test('不在黄枫谷坊市时不报拍卖排期', () => {
  const { player, world } = setup(3, 'qingwu');
  const text = buildGMMessages(player, world, [], '走走').map((m) => m.content).join('\n');
  assert.ok(!text.includes('【拍卖排期】'));
});
