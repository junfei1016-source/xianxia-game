import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  validateStateOutput,
} from '../public/game.js';
import { pillByName, pillEffect, pillWorksFor, resistanceFactor } from '../public/pills.js';

const setup = (realm = '筑基初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  player.hp = 10;
  return { player, world };
};

const swallow = (state, name, n = 1) => applyStateUpdates(state.player, state.world, {
  itemChanges: [{ name, delta: -n, kind: '丹药' }],
});

test('丹名解析：全名、带量词、以及"长得像但不是"的名字', () => {
  assert.equal(pillByName('回春丹').id, 'huichun');
  assert.equal(pillByName('一颗回春丹').id, 'huichun');
  assert.equal(pillByName('回春丹（上品）').id, 'huichun');
  assert.equal(pillByName('百转培元丹'), null, '另一种丹不能算作培元丹');
  assert.equal(pillByName('不知名的药'), null);
});

test('抗药性曲线：第一次满效，之后每次 ×0.75，最低 0.15', () => {
  assert.equal(resistanceFactor(0), 1);
  assert.equal(resistanceFactor(1), 0.75);
  assert.ok(Math.abs(resistanceFactor(2) - 0.563) < 1e-9);
  assert.ok(resistanceFactor(20) >= 0.15);
});

test('跨境失效：高出适用境界一个大境界以上就无用', () => {
  const huichun = pillByName('回春丹'); // 适用筑基
  assert.equal(pillWorksFor('筑基后期', huichun), true);
  assert.equal(pillWorksFor('金丹初期', huichun), false, '结丹期服筑基丹药已无用');
  assert.equal(pillWorksFor('炼气初期', huichun), true, '低境界服高阶丹仍有效');
  assert.equal(pillEffect('金丹初期', huichun, 0).works, false);
});

test('服丹：气血按丹方结算，模型写的药效数值被忽略（不重复加）', () => {
  const s = setup();
  const note = applyStateUpdates(s.player, s.world, {
    itemChanges: [{ name: '回春丹', delta: -1, kind: '丹药' }],
    stateUpdates: { hp: { delta: 999 } }, // 模型想自己写药效
  });
  assert.equal(s.player.hp, 45, '10 + 35，且不受模型 +999 影响');
  assert.ok(note.includes('【丹药】'));
  assert.equal(s.player.pillUsage.huichun, 1);
});

test('第二次服同一种丹：抗药性让效果打折', () => {
  const s = setup();
  swallow(s, '回春丹');
  const before = s.player.hp;
  swallow(s, '回春丹');
  const gain = s.player.hp - before;
  assert.ok(gain > 25 && gain < 27, `实际 +${gain}（35×0.75≈26）`);
  assert.equal(s.player.pillUsage.huichun, 2);
});

test('跨境界服丹：不涨数值，只给一句"丹力无用"', () => {
  const s = setup('金丹初期');
  const note = swallow(s, '聚气丹'); // 适用炼气
  assert.equal(s.player.cultivation, 0);
  assert.ok(note.includes('已无用处'));
});

test('以丹养伤：给负伤的护法疗伤，缩短调养时间', () => {
  const s = setup();
  s.world.npcs = [{
    name: '苏瑶', relation: '道侣', bond: { debt: 0, grudge: 0, trust: 80, need: 70 },
    condition: { state: '负伤', untilMonth: 16 },
  }];
  const note = applyStateUpdates(s.player, s.world, {
    treatNpc: [{ name: '苏瑶', pill: '生肌丹' }],
  });
  assert.ok(note.includes('以丹养伤'));
  assert.equal(s.world.npcs[0].condition, undefined, '两个月药力足够痊愈');
});

test('养伤也要看丹方：没有疗伤功效的丹没用', () => {
  const s = setup();
  s.world.npcs = [{
    name: '苏瑶', relation: '道侣', bond: { debt: 0, grudge: 0, trust: 80, need: 70 },
    condition: { state: '负伤', untilMonth: 16 },
  }];
  applyStateUpdates(s.player, s.world, { treatNpc: [{ name: '苏瑶', pill: '聚气丹' }] });
  assert.ok(s.world.npcs[0].condition, '聚气丹不治伤');
});

test('抗药性会随时间消退：半年不服就减一次', () => {
  const s = setup();
  s.player.pillUsage = { huichun: 3 };
  s.player.pillUsageMonth = 13;
  advanceTime(s.world, s.player, 6);
  assert.equal(s.player.pillUsage.huichun, 2);
  assert.equal(s.player.pillUsageMonth, 19);
});

test('校验层接受 treatNpc，坏条目被丢弃', () => {
  const { out } = validateStateOutput({
    treatNpc: [{ name: '苏瑶', pill: '回春丹' }, { pill: '缺名字' }],
  });
  assert.equal(out.treatNpc.length, 1);
  assert.equal(out.treatNpc[0].pill, '回春丹');
});
