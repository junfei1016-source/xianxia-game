// 天渊城服役：有仙籍的正途——每年领一粒灭尘丹，服够三百年自由离开。
// 原文：第 1315/1316 章（飞升者本该在飞灵台现身、去天渊城服役；天渊城每年发一粒灭尘丹；
//       "那灭尘丹只要服够三百年，就可彻底洗去下界气息，就可自由离开天渊城了"）、
//       第 1316/1317 章（这些人被编为青冥卫，初代飞升修士多半不必考核直接任命）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  enlist,
  canEnlist,
  settleDuty,
  ensureDuty,
  isOnDuty,
  DUTY_YEARS,
  TWO_COLOR_MONTHS,
} from '../public/game.js';

const setup = (opts = {}) => {
  const player = newPlayerState();
  player.realm = opts.realm || '炼虚初期';
  player.hp = 100;
  player.maxHp = 100;
  player.lifespan = 1000;
  player.spiritStones = 0;
  const world = newWorldState();
  world.eraType = '乱世';
  world.geo = { regionId: opts.region || 'taiqing', sinceTurn: 0, migrated: false };
  world.date = { year: 100, month: 1, day: 1 };
  world.turn = 60;
  if (opts.outlaw) world.flags.spiritOutlaw = true;
  ensureDuty(world);
  return { player, world };
};

const fixed = (v) => () => v;

test('入伍条件：须在天渊城、有仙籍、未在册', () => {
  const out = setup({ region: 'fengyuan' });
  assert.match(canEnlist(out.world, out.player).reason, /天渊城/);

  const black = setup({ outlaw: true });
  assert.match(canEnlist(black.world, black.player).reason, /身份牌/);

  const good = setup();
  assert.equal(canEnlist(good.world, good.player).ok, true);
  const res = enlist(good.world, good.player);
  assert.equal(res.ok, true);
  assert.equal(good.world.duty.rank, '青冥卫');
  assert.equal(isOnDuty(good.world), true);
  assert.equal(canEnlist(good.world, good.player).ok, false, '不能重复入伍');
});

test('入伍后每年自动领一粒灭尘丹，劫气不再累积', () => {
  const { player, world } = setup();
  enlist(world, player);
  world.flags.spiritOutlaw = true; // 假想他原来是黑户，入伍即洗白
  world.flags.spiritOutlaw = false;
  const events = settleDuty(world, player, 12, fixed(0.5));
  assert.equal(world.duty.years, 1);
  assert.ok(events.join('').includes('灭尘丹'), '每年都发一粒');
  assert.equal(world.outlaw.unsuppressedMonths, 0, '在册的人不会积累劫气');
});

test('一年只结算一次，不会多算', () => {
  const { player, world } = setup();
  enlist(world, player);
  settleDuty(world, player, 12, fixed(0.5));
  assert.equal(world.duty.years, 1);
  settleDuty(world, player, 6, fixed(0.5));
  assert.equal(world.duty.years, 1, '不满一年不算');
});

test('差事四种：巡边、守城、挡袭、截货，都给军功', () => {
  const { player, world } = setup();
  enlist(world, player);
  const a = settleDuty(world, player, 12, fixed(0.1)).join('');
  assert.match(a, /巡边/);
  assert.ok(world.duty.merit >= 1);

  const b = setup();
  enlist(b.world, b.player);
  settleDuty(b.world, b.player, 12, fixed(0.5));
  assert.match(settleDuty(b.world, b.player, 12, fixed(0.5)).join(''), /守城/);

  const c = setup();
  enlist(c.world, c.player);
  settleDuty(c.world, c.player, 12, fixed(0.85));
  assert.ok(c.player.hp < c.player.maxHp, '挡袭会受伤');

  const d = setup();
  enlist(d.world, d.player);
  settleDuty(d.world, d.player, 12, fixed(0.99));
  assert.ok(d.player.spiritStones >= 300, '截货有赏');
});

test('服够三百年：下界气息尽去，可自由离开', () => {
  const { player, world } = setup();
  enlist(world, player);
  world.duty.years = DUTY_YEARS - 1;
  world.duty.clock = (DUTY_YEARS - 1) * 12;
  const events = settleDuty(world, player, 12, fixed(0.5));
  assert.equal(world.duty.years, DUTY_YEARS);
  assert.equal(world.flags.spiritFree, true);
  assert.equal(world.duty.rank, '已退役');
  assert.match(events.join(''), /满役|自由离开/);
  assert.equal(canEnlist(world, player).ok, false);
});

test('走时间会推进服役：advanceTime 之后年份会长', () => {
  const { player, world } = setup();
  enlist(world, player);
  advanceTime(world, player, 12);
  assert.equal(world.duty.years, 1);
  assert.ok(world.lastOutlawEvents.join('').includes('差事'));
});

test('应用层入口：enlist 字段入伍；黑户被拒并说明原因', () => {
  const good = setup();
  const note = applyStateUpdates(good.player, good.world, { enlist: {} });
  assert.match(note, /入伍/);
  assert.equal(isOnDuty(good.world), true);

  const black = setup({ outlaw: true });
  const note2 = applyStateUpdates(black.player, black.world, { enlist: {} });
  assert.match(note2, /身份牌/);
  assert.equal(isOnDuty(black.world), false);
});

test('服役期与两色雷劫是同一把尺：三百年', () => {
  assert.equal(DUTY_YEARS * 12, TWO_COLOR_MONTHS);
});
