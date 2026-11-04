import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  seclusionGuardians,
  guardianReady,
} from '../public/game.js';

const setup = (npcs = []) => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  world.realmSince = { year: 1, month: 1, day: 1 };
  world.npcs = npcs;
  player.realm = '筑基初期';
  return { player, world };
};

const mate = () => ({ name: '苏瑶', relation: '道侣', bond: { debt: 0, grudge: 0, trust: 80, need: 70 } });

test('被打断且有护法：护法负伤，三个月内不能再来', () => {
  const { player, world } = setup([mate()]);
  world.pendingInterrupt = { by: '血刀寨', afterYears: 2, turn: 3 };
  world.guardiansThisTurn = ['苏瑶'];
  const note = applyStateUpdates(player, world, { timeMonths: 120, flags: { closedDoor: true } });
  assert.ok(note.includes('苏瑶负伤'));
  assert.ok(world.npcs[0].condition, '应留下伤情');
  assert.equal(world.npcs[0].condition.state, '负伤');
  assert.equal(guardianReady(world.npcs[0], world), false, '伤没好不能护法');
  assert.equal(seclusionGuardians(world, '闭关').length, 0);
});

test('心魔打断伤的是神，不是身', () => {
  const { player, world } = setup([mate()]);
  world.pendingInterrupt = { by: '心魔', afterYears: 1, turn: 3 };
  world.guardiansThisTurn = ['苏瑶'];
  const note = applyStateUpdates(player, world, { timeMonths: 12, flags: { closedDoor: true } });
  assert.ok(note.includes('心神受损'));
  assert.equal(world.npcs[0].condition.state, '心神受损');
});

test('养伤三个月：到期自动痊愈，可以再来护法', () => {
  const { player, world } = setup([mate()]);
  world.pendingInterrupt = { by: '血刀寨', afterYears: 1, turn: 1 };
  world.guardiansThisTurn = ['苏瑶'];
  applyStateUpdates(player, world, { timeMonths: 12, flags: { closedDoor: true } });
  assert.equal(guardianReady(world.npcs[0], world), false);

  advanceTime(world, player, 3); // 到第 4 月（伤满三个月）
  assert.equal(guardianReady(world.npcs[0], world), true, '三个月后伤愈');
  assert.equal(seclusionGuardians(world, '闭关').length, 1);
});

test('没被打断：护法不出事，也不会留下伤情', () => {
  const { player, world } = setup([mate()]);
  world.guardiansThisTurn = ['苏瑶'];
  applyStateUpdates(player, world, { timeMonths: 120, flags: { closedDoor: true } });
  assert.equal(world.npcs[0].condition, undefined);
  assert.equal(world.npcs[0].bond.trust, 80, '安然出关不加信任');
});

test('护法本身仍会因护主而更被信任', () => {
  const { player, world } = setup([mate()]);
  world.pendingInterrupt = { by: '血刀寨', afterYears: 1, turn: 1 };
  world.guardiansThisTurn = ['苏瑶'];
  applyStateUpdates(player, world, { timeMonths: 12, flags: { closedDoor: true } });
  assert.equal(world.npcs[0].bond.trust, 85);
});

test('旧伤在身的人，点名也请不动', () => {
  const { world } = setup([mate()]);
  world.npcs[0].condition = { state: '负伤', untilMonth: 12 + 3 }; // 第 1 年 3 月
  assert.equal(seclusionGuardians(world, '请苏瑶护法').length, 0);
});
