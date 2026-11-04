// 界面天花板：人界只到化神后期，炼虚以上须飞升灵界；飞升仙界才算真的飞升。
// 原文：第 962 章《化神传闻》——韩立问"化神期修士怎还会滞留这一界，不是说进阶化神期后
//       就有能力飞升灵界了吗"；第 642 章"最终得以飞升灵界，再成为仙界仙人"。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  evaluateEndings,
  interfaceOf,
  realmCapFor,
  canAscendToSpirit,
  MORTAL_CAP,
} from '../public/game.js';

const setup = (region = 'qingwu', realm = '化神后期', cultivation = 100) => {
  const player = newPlayerState();
  player.realm = realm;
  player.cultivation = cultivation;
  const world = newWorldState();
  world.eraType = '盛世';
  world.geo = { regionId: region, sinceTurn: 0, migrated: false };
  world.date = { year: 3000, month: 6, day: 1 }; // 年份给足，排除"最少在境年限"的干扰
  world.realmSince = { year: 1, month: 1, day: 1 };
  world.turn = 40;
  return { player, world };
};

test('界面判定：凡界九处都是人界，灵界五处算灵界', () => {
  assert.equal(interfaceOf(setup('qingwu').world), '人界');
  assert.equal(interfaceOf(setup('chisha').world), '人界');
  assert.equal(interfaceOf(setup('dajin').world), '人界');
  assert.equal(interfaceOf(setup('taiqing').world), '灵界');
  assert.equal(interfaceOf(setup('feiling').world), '灵界');
  assert.equal(realmCapFor(setup('qingwu').world), MORTAL_CAP);
  assert.equal(realmCapFor(setup('taiqing').world), null, '灵界无上限');
});

test('人界：化神中期升化神后期可以', () => {
  const { player, world } = setup('qingwu', '化神中期', 100);
  const report = {};
  applyStateUpdates(player, world, { realmChange: '化神后期' }, report);
  assert.equal(player.realm, '化神后期');
});

test('人界：化神后期想炼虚，被界力挡住', () => {
  const { player, world } = setup('qingwu', '化神后期', 100);
  const report = {};
  applyStateUpdates(player, world, { realmChange: '炼虚初期' }, report);
  assert.equal(player.realm, '化神后期', '境界不该动');
  const codes = (report.issues || []).map((i) => i.code);
  assert.ok(codes.includes('interface_cap'), `应有 interface_cap，实际 ${codes.join(',')}`);
  const logged = JSON.stringify(world.validationLog || []);
  assert.match(logged, /interface_cap/);
});

test('灵界：炼虚→合体→大乘→渡劫都能升', () => {
  for (const [from, to] of [['化神后期', '炼虚初期'], ['炼虚后期', '合体初期'], ['合体后期', '大乘初期'], ['大乘后期', '渡劫初期']]) {
    const { player, world } = setup('taiqing', from, 100);
    const report = {};
    applyStateUpdates(player, world, { realmChange: to }, report);
    assert.equal(player.realm, to, `${from} → ${to} 应放行`);
    assert.equal(report.issues.filter((i) => i.code === 'interface_cap').length, 0);
  }
});

test('灵界：渡劫后期飞升，才算通关（飞升仙界）', () => {
  const { player, world } = setup('taiqing', '渡劫后期', 100);
  const report = {};
  applyStateUpdates(player, world, { realmChange: '飞升' }, report);
  assert.equal(player.realm, '飞升');
  const ending = evaluateEndings(player, world);
  assert.equal(ending && ending.id, 'ascend');
  assert.equal(ending.win, true);
  assert.match(ending.text, /仙|霞|登仙/);
});

test('破界：化神后期且修为圆满，才飞得去灵界', () => {
  const ready = setup('qingwu', '化神后期', 100);
  assert.equal(canAscendToSpirit(ready.player, ready.world), true);
  const notReady = setup('qingwu', '化神中期', 100);
  assert.equal(canAscendToSpirit(notReady.player, notReady.world), false);
  const notFull = setup('qingwu', '化神后期', 60);
  assert.equal(canAscendToSpirit(notFull.player, notFull.world), false);
});

test('破界成功：落在飞灵台，且立刻算灵界', () => {
  const { player, world } = setup('qingwu', '化神后期', 100);
  const note = applyStateUpdates(player, world, { travelTo: '灵界·天渊城' });
  assert.equal(world.geo.regionId, 'feiling', '破界后落在飞灵台');
  assert.match(note, /破界/);
  assert.equal(interfaceOf(world), '灵界');
  assert.equal(realmCapFor(world), null, '到了灵界就没有上限了');
});

test('破界失败：修为不够就被界力挡回来，人还在人界', () => {
  const { player, world } = setup('qingwu', '元婴后期', 100);
  const note = applyStateUpdates(player, world, { travelTo: '灵界·天渊城' });
  assert.equal(world.geo.regionId, 'qingwu');
  assert.match(note, /界力|化神后期/);
});

test('灵界里可以互相走动，但回不了人界', () => {
  const { player, world } = setup('feiling', '炼虚初期', 10);
  applyStateUpdates(player, world, { travelTo: '灵界·风元大陆' });
  assert.equal(world.geo.regionId, 'fengyuan');
  const back = applyStateUpdates(player, world, { travelTo: '越国·建州' });
  assert.equal(world.geo.regionId, 'fengyuan', '回不去');
  assert.match(back, /界力/, '回执要说清是界力隔着');
});
