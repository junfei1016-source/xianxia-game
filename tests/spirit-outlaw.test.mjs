// 黑户在灵界的日子：灭尘丹、两色雷劫、天渊卫盘查、身份牌。
// 原文：第 1315/1316 章（没服灭尘丹洗去异界气息，三百年一次的小天劫会变成必死的两色雷劫；
//       天渊城每年给在册飞升修士发一粒；天渊卫可自由穿梭各地）、
//       第 1583 章（外来修士要办身份牌，还得有本地有头脸的人担保）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  settleOutlaw,
  policeCheck,
  canGetSpiritPass,
  getSpiritPass,
  ensureOutlaw,
  isOutlaw,
  TWO_COLOR_MONTHS,
  SPIRIT_PASS_COST,
} from '../public/game.js';

const setup = (opts = {}) => {
  const player = newPlayerState();
  player.realm = opts.realm || '炼虚初期';
  player.hp = 100;
  player.maxHp = 100;
  player.lifespan = 500;
  player.spiritStones = opts.stones || 0;
  const world = newWorldState();
  world.eraType = '乱世';
  world.geo = { regionId: opts.region || 'fengyuan', sinceTurn: 0, migrated: false };
  world.date = { year: 100, month: 1, day: 1 };
  world.turn = 50;
  if (opts.outlaw !== false) world.flags.spiritOutlaw = true;
  if (opts.pills) world.inventory = [{ name: '灭尘丹', kind: '丹药', qty: opts.pills }];
  ensureOutlaw(world);
  return { player, world };
};

const fixed = (v) => () => v;

test('黑户身份判定与字段迁移幂等', () => {
  const { world } = setup();
  assert.equal(isOutlaw(world), true);
  const first = ensureOutlaw(world);
  assert.equal(first.unsuppressedMonths, 0);
  const snap = JSON.stringify(world.outlaw);
  ensureOutlaw(world);
  assert.equal(JSON.stringify(world.outlaw), snap);
  const clean = setup({ outlaw: false }).world;
  assert.equal(isOutlaw(clean), false);
});

test('有灭尘丹：每年自动服一粒，劫气压住', () => {
  const { player, world } = setup({ pills: 3 });
  const events = settleOutlaw(world, player, 12);
  assert.equal(world.outlaw.unsuppressedMonths, 0, '按时服药，不该累积');
  assert.equal(world.inventory[0].qty, 2, '吃掉一粒');
  assert.ok(events.join('').includes('灭尘丹'));
});

test('没灭尘丹：劫气一年年累积，提示还剩多少年', () => {
  const { player, world } = setup();
  settleOutlaw(world, player, 24);
  assert.equal(world.outlaw.unsuppressedMonths, 24);
  const note = settleOutlaw(world, player, 12).join('');
  assert.match(note, /灭尘丹/);
  assert.match(note, /还压得住约 \d+ 年/);
});

test('三百年不压：两色雷劫必死（第 1316 章）', () => {
  const { player, world } = setup();
  world.outlaw.unsuppressedMonths = TWO_COLOR_MONTHS - 12;
  const events = settleOutlaw(world, player, 12);
  assert.equal(player.hp, 0);
  assert.equal(world.flags.deathByRisk, true);
  assert.match(events.join(''), /两色雷劫/);
});

test('丹药吃完就断供：不会凭空续命', () => {
  const { player, world } = setup({ pills: 1 });
  settleOutlaw(world, player, 12);
  assert.equal(world.inventory.length, 0, '唯一一粒吃完了');
  settleOutlaw(world, player, 12);
  assert.equal(world.outlaw.unsuppressedMonths, 12, '第二年开始累积');
});

test('天渊卫盘查：黑户被搜灵石并上通缉册', () => {
  const { player, world } = setup({ stones: 500 });
  const note = policeCheck(world, player, fixed(0.01));
  assert.ok(note && note.includes('天渊卫'));
  assert.equal(player.spiritStones, 400, '抽两成');
  assert.equal(world.flags.spiritWanted, true);
  assert.equal(policeCheck(world, player, fixed(0.9)), null, '不是每年都遇上');
});

test('有仙籍的人不受盘查', () => {
  const { player, world } = setup({ outlaw: false, stones: 500 });
  assert.equal(policeCheck(world, player, fixed(0.01)), null);
  assert.equal(player.spiritStones, 500);
});

test('身份牌：没结盟势力或有灵石不足都办不成', () => {
  const poor = setup({ stones: 100 });
  const r1 = canGetSpiritPass(poor.world, poor.player);
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /担保/);

  const rich = setup({ stones: SPIRIT_PASS_COST + 50 });
  assert.equal(canGetSpiritPass(rich.world, rich.player).ok, false, '还是没担保');

  rich.world.factions = [{ name: '风元城守', relation: '结盟', desc: '灵界人族大城的守将' }];
  const r2 = canGetSpiritPass(rich.world, rich.player);
  assert.equal(r2.ok, true);
});

test('身份牌洗白：扣灵石、摘掉黑户、劫气清零', () => {
  const { player, world } = setup({ stones: SPIRIT_PASS_COST + 200 });
  world.factions = [{ name: '风元城守', relation: '结盟', desc: '灵界人族大城的守将' }];
  world.outlaw.unsuppressedMonths = 120;
  const res = getSpiritPass(world, player);
  assert.equal(res.ok, true);
  assert.equal(player.spiritStones, 200);
  assert.equal(isOutlaw(world), false);
  assert.equal(world.flags.spiritRegistered, true);
  assert.equal(world.outlaw.unsuppressedMonths, 0);
  assert.match(res.note, /身份牌/);
});

test('走时间会触发：advanceTime 后事件留在 lastOutlawEvents', () => {
  const { player, world } = setup();
  advanceTime(world, player, 12);
  assert.ok(Array.isArray(world.lastOutlawEvents));
  assert.ok(world.lastOutlawEvents.length > 0, '一年过去至少该有劫气提示');
  assert.ok(world.lastOutlawEvents.join('').includes('灭尘丹'));
});

test('应用层入口：requestPass 字段走洗白；条件不足则回执说明', () => {
  const { player, world } = setup({ stones: 0 });
  const note = applyStateUpdates(player, world, { requestPass: { faction: '风元城守' } });
  assert.match(note, /办不成/);
  assert.equal(isOutlaw(world), true);
});
