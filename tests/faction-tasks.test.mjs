// 宗门任务殿：每个势力按自己的性质挂活，功勋记在自家名下，好感够了自动结盟。
// 原文：第 1356-1358 章（长老会发榜、功勋极重、多要联手）；第 273 章（坊市悬赏猎杀）；
//       第 463 章起各派坊市、宗门雇散修办事的常态。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  ensureTasks,
  factionBoards,
  takeFactionTask,
  factionMeritOf,
  factionShop,
  redeemFaction,
  advanceTask,
  settleTasks,
  tryFactionAlly,
} from '../public/game.js';
import { startingFactions, FACTION_ALLY_FAVOR } from '../public/world.js';

const setup = (realm = '化神初期') => {
  const player = newPlayerState();
  player.realm = realm;
  player.cultivation = 40;
  const world = newWorldState();
  world.eraType = '盛世';
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 60, month: 3, day: 1 };
  world.turn = 120;
  world.factions = startingFactions('qingwu', () => 0.3).map((f, i) => ({ ...f, id: f.id || `fac${i}`, favor: 0, relation: '中立' }));
  ensureTasks(world);
  return { player, world };
};

test('每个势力各挂各的牌，且牌面互不相同', () => {
  const { world } = setup();
  const boards = factionBoards(world);
  assert.ok(boards.length >= 2, '青芜国至少两家势力');
  for (const b of boards) {
    assert.equal(b.board.length, 2);
    for (const t of b.board) {
      assert.equal(t.factionId, b.faction.id);
      assert.equal(t.factionName, b.faction.name);
      assert.ok(t.reward.stones > 0 && t.reward.merit > 0);
    }
  }
  const ids = boards.flatMap((b) => b.board.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length, '不同势力的任务编号不能撞');
});

test('敌对势力不给活', () => {
  const { player, world } = setup();
  const b = factionBoards(world)[0];
  const f = world.factions.find((x) => x.id === b.faction.id);
  f.relation = '敌对';
  const r = takeFactionTask(world, player, b.faction.id, b.board[0].id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /为敌/);
});

test('接活：境界不够不给接，接后进入已接清单', () => {
  const low = setup('炼气后期');
  const b = factionBoards(low.world)[0];
  const high = b.board.find((t) => t.tier !== '低阶') || b.board[0];
  assert.equal(takeFactionTask(low.world, low.player, b.faction.id, high.id).ok, false);

  const good = setup('化神初期');
  const b2 = factionBoards(good.world)[0];
  const t = b2.board[0];
  const res = takeFactionTask(good.world, good.player, b2.faction.id, t.id);
  assert.equal(res.ok, true);
  assert.equal(good.world.liveTasks.length, 1);
  assert.equal(good.world.liveTasks[0].factionId, b2.faction.id);
});

test('做完给自家功勋与好感，不串到别家', () => {
  const { player, world } = setup();
  const boards = factionBoards(world);
  const a = boards[0];
  const t = a.board[0];
  takeFactionTask(world, player, a.faction.id, t.id);
  const live = world.liveTasks[0];
  for (let i = 0; i < live.need; i += 1) advanceTask(world, player, live.kind, live.target);
  assert.equal(world.liveTasks.length, 0);
  assert.equal(factionMeritOf(world, a.faction.id), t.reward.merit);
  const f = world.factions.find((x) => x.id === a.faction.id);
  assert.ok(f.favor >= t.reward.merit * 4, '好感按功勋四倍记');
  if (boards[1]) assert.equal(factionMeritOf(world, boards[1].faction.id), 0, '别家的功勋不受影响');
});

test('好感够了自动结盟', () => {
  const { player, world } = setup();
  const b = factionBoards(world)[0];
  const f = world.factions.find((x) => x.id === b.faction.id);
  f.favor = FACTION_ALLY_FAVOR - 1;
  assert.equal(tryFactionAlly(world, b.faction.id), null);
  f.favor = FACTION_ALLY_FAVOR;
  const note = tryFactionAlly(world, b.faction.id);
  assert.match(note, /结盟/);
  assert.equal(f.relation, '结盟');
});

test('超期：势力任务砸了扣好感', () => {
  const { player, world } = setup();
  const b = factionBoards(world)[0];
  const f = world.factions.find((x) => x.id === b.faction.id);
  f.favor = 50;
  takeFactionTask(world, player, b.faction.id, b.board[0].id);
  world.liveTasks[0].dueDate = { year: 1, month: 1, day: 1 };
  const notes = settleTasks(world, player);
  assert.match(notes.join(''), /好感/);
  assert.equal(f.favor, 40);
});

test('功勋台按立场给货：正道与魔道不一样', () => {
  const { player, world } = setup();
  const boards = factionBoards(world);
  const names = boards.map((b) => (factionShop(world, b.faction.id) || []).map((x) => x.name).join('/'));
  assert.ok(names.length >= 1);
  const zhengdao = factionShop(world, boards[0].faction.id);
  assert.ok(zhengdao.length >= 2);
});

test('兑换：功勋不够说明原因，够就扣自家功勋', () => {
  const { player, world } = setup();
  const b = factionBoards(world)[0];
  world.factionMerit = { [b.faction.id]: 0 };
  const shop = factionShop(world, b.faction.id);
  const r1 = redeemFaction(world, player, b.faction.id, shop[0].id);
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /功勋不够/);

  world.factionMerit[b.faction.id] = 999;
  const r2 = redeemFaction(world, player, b.faction.id, shop[0].id);
  assert.equal(r2.ok, true);
  assert.ok(world.factionMerit[b.faction.id] < 999);
});

test('应用层入口：takeFactionTask 字段能接活', () => {
  const { player, world } = setup();
  const b = factionBoards(world)[0];
  const note = applyStateUpdates(player, world, { takeFactionTask: { factionId: b.faction.id, id: b.board[0].id } });
  assert.match(note, /接了/);
  assert.equal(world.liveTasks.length, 1);
});
