// 宗门体系：入门 → 外门/内门/亲传/执事 → 贡献 → 藏经阁 → 离门或叛门。
// 原文：第 1 章（七玄门分外门内门，五年一次招收内门弟子）、第 8 章（亲传弟子）、
//       第 668 章（御灵宗藏经阁）、第 106 章（升仙大会与筑基丹）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  joinSect,
  canJoinSect,
  sectOf,
  sectRankUp,
  sectCatalog,
  sectRedeem,
  leaveSect,
  addSectContribution,
  sectBountyOf,
  sectIntercept,
  amendSect,
} from '../public/game.js';
import { startingFactions, SECT_RANKS } from '../public/world.js';

const setup = (realm = '筑基初期') => {
  const player = newPlayerState();
  player.realm = realm;
  player.cultivation = 30;
  const world = newWorldState();
  world.eraType = '盛世';
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 20, month: 4, day: 1 };
  world.turn = 50;
  world.factions = startingFactions('qingwu', () => 0.2).map((f, i) => ({ ...f, id: f.id || `fac${i}`, favor: 0, relation: '中立' }));
  return { player, world };
};

test('入门：须本地门派、非敌对、炼气以上', () => {
  const out = setup();
  const name = out.world.factions[0].name;
  assert.match(canJoinSect(out.world, out.player, '不存在派').reason, /没有这家门派/);

  const low = setup('凡人');
  assert.match(canJoinSect(low.world, low.player, low.world.factions[0].name).reason, /凡人之身/);

  const res = joinSect(out.world, out.player, name);
  assert.equal(res.ok, true);
  assert.match(res.note, /外门弟子/);
  assert.equal(sectOf(out.world).rank, '外门弟子');
  assert.equal(canJoinSect(out.world, out.player, name).ok, false, '已有门派不能再入');
});

test('敌对门派不收你', () => {
  const { player, world } = setup();
  world.factions[0].relation = '敌对';
  const r = joinSect(world, player, world.factions[0].name);
  assert.equal(r.ok, false);
  assert.match(r.reason, /有仇/);
});

test('贡献够了+境界够了才升辈分', () => {
  const { player, world } = setup('炼气初期');
  joinSect(world, player, world.factions[0].name);
  const need = SECT_RANKS[1].need;
  world.sect.contribution = need - 1;
  assert.equal(sectRankUp(world, player).ok, false, '贡献不够');
  world.sect.contribution = need;
  assert.equal(sectRankUp(world, player).ok, false, '境界不够');
  player.realm = '炼气中期';
  const up = sectRankUp(world, player);
  assert.equal(up.ok, true);
  assert.equal(sectOf(world).rank, '内门弟子');
});

test('外门进不了藏经阁，内门可以', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.sect.contribution = 200;
  assert.match(sectRedeem(world, player, 'pill').reason, /外门弟子进不了藏经阁/);
  world.sect.rank = '内门弟子';
  const r = sectRedeem(world, player, 'pill');
  assert.equal(r.ok, true);
  assert.ok(world.sect.contribution < 200);
  assert.ok(world.sect.bought.includes('pill'));
});

test('贡献不够换不了', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.sect.rank = '内门弟子';
  world.sect.contribution = 1;
  const r = sectRedeem(world, player, 'recipe');
  assert.equal(r.ok, false);
  assert.match(r.reason, /贡献不够/);
});

test('藏经阁按门派立场给货', () => {
  const { player, world } = setup();
  world.factions[0].alignment = '魔道';
  joinSect(world, player, world.factions[0].name);
  const names = sectCatalog(world).map((x) => x.name).join('/');
  assert.ok(/血煞丹|禁术|魔门/.test(names), names);
});

test('离门：好聚好散，贡献清零', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.sect.contribution = 80;
  const r = leaveSect(world, player, false);
  assert.equal(r.ok, true);
  assert.equal(sectOf(world), null);
  assert.equal(world.sect.contribution, 0);
});

test('叛门：带着抄来的东西走，全宗追杀', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.sect.rank = '内门弟子';
  world.sect.contribution = 100;
  sectRedeem(world, player, 'tech');
  const r = leaveSect(world, player, true);
  assert.equal(r.ok, true);
  assert.match(r.note, /叛门/);
  assert.equal(world.flags.sectTraitor, true);
  assert.equal(world.factions[0].relation, '敌对');
});

test('做本门任务会涨贡献（别的门派的活不算）', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  const id = world.sect.id;
  addSectContribution(world, id, 7);
  assert.equal(world.sect.contribution, 7);
  addSectContribution(world, 'someone-else', 100);
  assert.equal(world.sect.contribution, 7, '别家的功勋不该算贡献');
});


test('正常退出：秘传要交还，不会通缉', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.sect.rank = '内门弟子';
  world.sect.contribution = 100;
  sectRedeem(world, player, 'tech');
  assert.ok(world.inventory.some((it) => /本门功法|魔门功法|杂学功法/.test(it.name)), '换到了功法');
  const r = leaveSect(world, player, {});
  assert.equal(r.ok, true);
  assert.match(r.note, /交还/);
  assert.ok(!world.flags.sectTraitor, '正常退出不算叛徒');
  assert.equal(world.flags.sectBounty || 0, 0, '没有赏格');
  assert.ok(!world.inventory.some((it) => /本门功法|魔门功法|杂学功法/.test(it.name)), '秘传已交还');
});

test('正常退出却把秘传带走：按盗经处理，挂赏格', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.sect.rank = '内门弟子';
  world.sect.contribution = 100;
  sectRedeem(world, player, 'tech');
  const r = leaveSect(world, player, { takeSecrets: true });
  assert.match(r.note, /盗经/);
  assert.equal(world.flags.sectTraitor, true);
  assert.ok(world.flags.sectBounty > 0);
  assert.ok(world.inventory.some((it) => /功法/.test(it.name)), '东西还在身上');
});

test('叛门赏格按贡献折算，门人会来寻仇', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  world.merit = 10;
  leaveSect(world, player, { betray: true });
  const bounty = sectBountyOf(world);
  assert.ok(bounty >= 200);
  const hit = sectIntercept(world, player, () => 0.01);
  assert.ok(hit && hit.includes('门人寻仇'));
  assert.ok(player.spiritStones <= 100);
});

test('没有的账不会来寻仇', () => {
  const { player, world } = setup();
  assert.equal(sectIntercept(world, player, () => 0.01), null);
  assert.equal(sectBountyOf(world), 0);
});

test('销案：赔钱交东西，赏格撤了', () => {
  const { player, world } = setup();
  joinSect(world, player, world.factions[0].name);
  leaveSect(world, player, { betray: true });
  player.spiritStones = 9999;
  const r = amendSect(world, player);
  assert.equal(r.ok, true);
  assert.equal(world.flags.sectTraitor, false);
  assert.equal(sectBountyOf(world), 0);
});

test('应用层入口：joinSect 字段能入门', () => {
  const { player, world } = setup();
  const name = world.factions[0].name;
  const note = applyStateUpdates(player, world, { joinSect: { faction: name } });
  assert.match(note, /入门/);
  assert.equal(sectOf(world).faction.name, name);
});
