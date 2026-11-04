// 宗门大比 / 拜师 / 藏经阁真功法 / 宗门战事
// 原文：第 16 章（门内比试）、第 1550 章（大比场面）、第 8 章（亲传与传功）、
//       第 668 章（藏经阁秘术）、第 934 章（"再次挑起正魔大战"）、第 680 章（古修战场遗宝）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  joinSect,
  sectCatalog,
  sectRedeem,
  runSectTournament,
  takeMaster,
  canTakeMaster,
  maybeStartWar,
  settleWar,
  warLoot,
  ensureTournament,
  TOURNAMENT_MONTHS,
} from '../public/game.js';
import { startingFactions } from '../public/world.js';
import { TECHNIQUES as TECHS } from '../public/techniques.js';

const setup = (realm = '筑基初期') => {
  const player = newPlayerState();
  player.realm = realm;
  player.cultivation = 50;
  player.reputation = 10;
  player.spiritStones = 0;
  const world = newWorldState();
  world.eraType = '乱世';
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 30, month: 1, day: 1 };
  world.turn = 30;
  world.factions = startingFactions('qingwu', () => 0.2).map((f, i) => ({ ...f, id: f.id || `fac${i}`, favor: 0, relation: '中立' }));
  joinSect(world, player, world.factions[0].name);
  world.sect.rank = '内门弟子';
  world.sect.contribution = 200;
  return { player, world };
};

test('藏经阁给的是真功法，换完真进修习列表', () => {
  const { player, world } = setup();
  const catalog = sectCatalog(world);
  const techItem = catalog.find((x) => x.technique);
  assert.ok(techItem, '藏经阁里要有真功法项');
  const inList = TECHS.some((t) => t.name === techItem.technique);
  assert.ok(inList, `${techItem.technique} 必须来自 techniques.js`);
  const before = player.techniques.length;
  const r = sectRedeem(world, player, techItem.id);
  assert.equal(r.ok, true);
  assert.equal(player.techniques.length, before + 1);
  assert.equal(player.techniques[0].name, techItem.technique);
  assert.ok(player.techniques[0].name, '功法条目有名有姓');
});

test('辈分越高，藏经阁给的功法越上乘', () => {
  const { player, world } = setup();
  world.sect.rank = '内门弟子';
  const mid = sectCatalog(world).find((x) => x.technique);
  world.sect.rank = '执事';
  const high = sectCatalog(world).find((x) => x.technique);
  assert.notEqual(mid.technique, high.technique, '中阶与高阶不是同一门');
  const g = TECHS.find((t) => t.name === high.technique).grade;
  assert.equal(g, '高阶功法');
});

test('大比十年一场，到期才开', () => {
  const { player, world } = setup();
  ensureTournament(world);
  const next = world.sect.nextTournament;
  assert.ok(next > 0);
  assert.equal(runSectTournament(world, player), null, '没到日子不开');
  world.date = { year: 40, month: 1, day: 1 };
  const res = runSectTournament(world, player);
  assert.ok(res && res.ok);
  assert.ok(['first', 'third', 'lost'].includes(res.place));
  assert.ok(world.sect.nextTournament > next, '下一场要往后推十年');
});

function monthOf(world) {
  return (world.date.year - 1) * 12 + world.date.month;
}

test('大比夺魁：贡献与灵石都到手，可能直接升辈分', () => {
  const { player, world } = setup('筑基初期');
  player.techniques = [{ name: '烈火诀', layer: 9 }, { name: '象甲功', layer: 9 }];
  ensureTournament(world);
  world.date = { year: 40, month: 1, day: 1 };
  const before = world.sect.contribution;
  const res = runSectTournament(world, player, () => 0.99); // 自己分高、对手分低
  assert.equal(res.place, 'first');
  assert.ok(world.sect.contribution > before);
  assert.ok(player.spiritStones >= 800);
});

test('大比落败：声望小掉，不掉贡献', () => {
  const { player, world } = setup('炼气初期');
  ensureTournament(world);
  world.date = { year: 40, month: 1, day: 1 };
  const before = world.sect.contribution;
  const res = runSectTournament(world, player, () => 0.01);
  assert.equal(res.place, 'lost');
  assert.equal(world.sect.contribution, before);
  assert.ok(player.reputation <= 10);
});

test('拜师：外门不够、贡献不够都不行', () => {
  const { player, world } = setup();
  world.sect.rank = '外门弟子';
  assert.match(canTakeMaster(world, player).reason, /外门/);
  world.sect.rank = '内门弟子';
  world.sect.contribution = 10;
  assert.match(canTakeMaster(world, player).reason, /60/);
  world.sect.contribution = 80;
  assert.equal(canTakeMaster(world, player).ok, true);
});

test('拜师成功：师父记在门内，还传一门中阶功法', () => {
  const { player, world } = setup();
  const r = takeMaster(world, player, '青玄长老');
  assert.equal(r.ok, true);
  assert.equal(world.sect.master, '青玄长老');
  const learned = player.techniques[0];
  assert.ok(learned, '师父要传东西');
  const def = TECHS.find((t) => t.name === learned.name);
  assert.ok(def, '传的必须是真功法');
});

test('战事：乱世里可能打起来，战时才有遗宝', () => {
  const { player, world } = setup();
  world.war = null;
  const started = maybeStartWar(world, () => 0.01);
  assert.match(started, /战事/);
  assert.equal(world.war.active, true);
  const loot = warLoot(world, () => 0.01);
  assert.match(loot, /战场遗宝/);
});

test('战事：盛世里不容易打，打完会停', () => {
  const { player, world } = setup();
  world.war = null;
  world.eraType = '盛世';
  assert.equal(maybeStartWar(world, () => 0.99), null);
  world.war = { active: true, side: '正道', monthsLeft: 12 };
  assert.equal(settleWar(world, player, 6), null, '还没打完');
  const end = settleWar(world, player, 12);
  assert.match(end, /停了手/);
  assert.equal(world.war.active, false);
  assert.equal(warLoot(world, () => 0.01), null, '停战就没有遗宝了');
});
