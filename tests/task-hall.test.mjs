// 任务殿：引擎发榜、引擎记账、引擎结算——不靠叙事自报完成。
// 原文：第 1356-1358 章（长老会发榜，"耗时较长、功勋极重"，危险大、多要多人联手）；
//       第 273 章（坊市悬赏猎杀魔修，赏额可观）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  takeTask,
  dropTask,
  advanceTask,
  settleTasks,
  redeemMerit,
  ensureTasks,
  refreshTaskBoard,
} from '../public/game.js';
import { TASK_TIERS, MERIT_SHOP } from '../public/world.js';

const setup = (region = 'qingwu', realm = '金丹初期') => {
  const player = newPlayerState();
  player.realm = realm;
  player.cultivation = 30;
  const world = newWorldState();
  world.eraType = '盛世';
  world.geo = { regionId: region, sinceTurn: 0, migrated: false };
  world.date = { year: 40, month: 5, day: 1 };
  world.turn = 90;
  ensureTasks(world);
  refreshTaskBoard(world);
  return { player, world };
};

test('发榜：三档各一条，编号/目标/奖励都齐', () => {
  const { world } = setup();
  const list = world.taskBoard.list;
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((t) => t.tier), ['低阶', '高阶', '长老会']);
  for (const t of list) {
    assert.ok(t.id && t.title && t.kind && t.need > 0 && t.days > 0);
    assert.ok(t.reward.stones > 0 && t.reward.merit > 0);
    assert.equal(t.minRealm, TASK_TIERS[t.tier].minRealm);
  }
});

test('同区同期牌面固定，换期才换', () => {
  const a = setup();
  const b = setup();
  assert.deepEqual(a.world.taskBoard.list.map((t) => t.id + t.title), b.world.taskBoard.list.map((t) => t.id + t.title));
  a.world.taskBoard.index += 1;
  refreshTaskBoard(a.world);
  assert.notDeepEqual(a.world.taskBoard.list.map((t) => t.title), b.world.taskBoard.list.map((t) => t.title));
});

test('接榜：境界不够不给接，接满三件不给接', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  const high = world.taskBoard.list.find((t) => t.tier === '长老会');
  const r = takeTask(world, player, high.id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /化神初期/);

  const low = world.taskBoard.list.filter((t) => t.tier === '低阶')[0];
  assert.equal(takeTask(world, player, low.id).ok, true);
  assert.equal(world.taskBoard.list.some((t) => t.id === low.id), false, '接走后牌面就没了');
  assert.equal(world.liveTasks.length, 1);
});

test('接满三件后不再接', () => {
  const { player, world } = setup('qingwu', '化神初期');
  const all = world.taskBoard.list.slice();
  for (const t of all) takeTask(world, player, t.id);
  assert.equal(world.liveTasks.length, 3);
  world.taskBoard.list = [{ ...all[0], id: 'x-new' }];
  const r = takeTask(world, player, 'x-new');
  assert.equal(r.ok, false);
  assert.match(r.reason, /三件/);
});

test('进度只认引擎信号：采集/猎妖/行路 各推一格', () => {
  const { player, world } = setup('qingwu', '化神初期');
  world.liveTasks = [];
  const mk = (kind, need, target = '') => ({ id: 'k' + kind, tier: '低阶', kind, title: '试', need, target, progress: 0, days: 30, reward: { stones: 100, merit: 2 }, minRealm: '筑基初期', dueDate: { year: 40, month: 6, day: 1 } });
  world.liveTasks = [mk('采集', 2), mk('猎妖', 1), mk('行路', 1, '元武国')];

  let notes = advanceTask(world, player, '采集');
  assert.match(notes.join(''), /1\/2/);
  notes = advanceTask(world, player, '采集');
  assert.match(notes.join(''), /【交差】/);

  notes = advanceTask(world, player, '猎妖');
  assert.match(notes.join(''), /【交差】/);

  notes = advanceTask(world, player, '行路', '天罗国');
  assert.equal(notes.length, 0, '去的不是任务要的地方，不算');
  notes = advanceTask(world, player, '行路', '元武国');
  assert.match(notes.join(''), /【交差】/);

  assert.equal(world.merit, 6, '三件各 2 功');
  assert.equal(player.spiritStones, 300);
});

test('超期：差事砸了，功勋扣一', () => {
  const { player, world } = setup();
  world.liveTasks = [{ id: 'k1', kind: '采集', title: '拖不得的活', need: 3, progress: 0, reward: { stones: 50, merit: 2 }, dueDate: { year: 40, month: 4, day: 1 } }];
  world.merit = 2;
  const notes = settleTasks(world, player);
  assert.match(notes.join(''), /砸了/);
  assert.equal(world.liveTasks.length, 0);
  assert.equal(world.merit, 1);
});

test('功勋兑换：够就扣，不够就说明', () => {
  const { player, world } = setup();
  world.merit = 5;
  const poor = redeemMerit(world, player, 'dust');
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /功勋不够/);

  const heal = MERIT_SHOP.find((x) => x.id === 'heal');
  const ok = redeemMerit(world, player, 'heal');
  assert.equal(ok.ok, true);
  assert.equal(world.merit, 5 - heal.merit);
  assert.ok(world.inventory.some((it) => it.name === heal.name));
});

test('应用层入口：takeTask / redeem 都能走通，且不会把任务写进状态', () => {
  const { player, world } = setup('qingwu', '化神初期');
  const t = world.taskBoard.list[0];
  const note = applyStateUpdates(player, world, { takeTask: { id: t.id } });
  assert.match(note, /接榜/);
  assert.equal(world.liveTasks.length, 1);

  world.merit = 10;
  const note2 = applyStateUpdates(player, world, { redeem: { id: 'stones' } });
  assert.match(note2, /功勋/);
  assert.equal(world.merit, 0);
});
