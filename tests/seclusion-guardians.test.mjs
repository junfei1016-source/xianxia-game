import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  buildGMMessages,
  seclusionGuardians,
  rollSeclusionInterrupt,
} from '../public/game.js';

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

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

const npc = (name, relation, bond) => ({ name, relation, bond });

test('道侣/结义信得过，就会来护法', () => {
  const mate = npc('苏瑶', '道侣', { debt: 0, grudge: 0, trust: 80, need: 70 });
  const sworn = npc('关二', '结义', { debt: 0, grudge: 0, trust: 65, need: 30 });
  const { world } = setup([mate, sworn]);
  const guards = seclusionGuardians(world, '闭关十年');
  assert.equal(guards.length, 2);
  assert.deepEqual(guards.map((g) => g.name), ['苏瑶', '关二']);
});

test('有仇的不护法：哪怕名分是道侣', () => {
  const enemyMate = npc('柳氏', '道侣', { debt: 0, grudge: 70, trust: 85, need: 60 });
  const { world } = setup([enemyMate]);
  assert.equal(seclusionGuardians(world, '闭关').length, 0);
});

test('点名相请也算：信 ≥50 才请得动', () => {
  const friend = npc('顾长歌', '挚友', { debt: 0, grudge: 0, trust: 55, need: 20 });
  const stranger = npc('路人甲', '相识', { debt: 0, grudge: 0, trust: 40, need: 10 });
  const { world } = setup([friend, stranger]);
  assert.deepEqual(seclusionGuardians(world, '请顾长歌为我护法').map((g) => g.name), ['顾长歌']);
  assert.equal(seclusionGuardians(world, '请路人甲护法').length, 0);
});

test('护法最多两位，多了也不叠加', () => {
  const many = ['甲', '乙', '丙'].map((n) => npc(n, '结义', { debt: 0, grudge: 0, trust: 90, need: 30 }));
  const { world } = setup(many);
  assert.equal(seclusionGuardians(world, '闭关').length, 2);
});

test('护法把被打断的概率压下去：同一掷点，无护法中、有护法不中', () => {
  const { player, world } = setup();
  // 无护法：基础 0.08 + 危险 0.02 = 0.10，掷 0.08 命中
  const hit = rollSeclusionInterrupt(world, player, '闭关十年', seq(0.08, 0.5));
  assert.ok(hit);

  const guarded = setup([npc('苏瑶', '道侣', { debt: 0, grudge: 0, trust: 80, need: 70 })]);
  // 有 1 位护法：0.10 × 0.55 = 0.055，同样的 0.08 就掷不中
  const miss = rollSeclusionInterrupt(guarded.world, guarded.player, '闭关十年', seq(0.08, 0.5));
  assert.equal(miss, null);
  assert.deepEqual(guarded.world.guardiansThisTurn, ['苏瑶']);
});

test('提示词会写"护法在侧"，并交代叙事要点', () => {
  const { player, world } = setup([npc('苏瑶', '道侣', { debt: 0, grudge: 0, trust: 80, need: 70 })]);
  rollSeclusionInterrupt(world, player, '闭关十年', () => 0.99); // 不打断
  const text = buildGMMessages(player, world, [], '闭关十年').map((m) => m.content).join('\n');
  assert.ok(text.includes('【护法在侧】'));
  assert.ok(text.includes('苏瑶'));
  assert.ok(text.includes('守候'));
});

test('被打断时：提示词写明护法挡下第一波，护法信任 +5', () => {
  const mate = npc('苏瑶', '道侣', { debt: 0, grudge: 0, trust: 80, need: 70 });
  const { player, world } = setup([mate]);
  world.pendingInterrupt = { by: '血刀寨', afterYears: 2, turn: 3 };
  world.guardiansThisTurn = ['苏瑶'];

  const text = buildGMMessages(player, world, [], '闭关十年').map((m) => m.content).join('\n');
  assert.ok(text.includes('挡下第一波'));

  const note = applyStateUpdates(player, world, {
    timeMonths: 120,
    flags: { closedDoor: true },
    stateUpdates: { cultivation: { delta: 10 } },
  });
  assert.ok(note.includes('挡下第一波'));
  assert.equal(world.npcs[0].bond.trust, 85, '护主之后更被信任');
});

test('护法只作用于当回合：结算后清空', () => {
  const { player, world } = setup([npc('苏瑶', '道侣', { debt: 0, grudge: 0, trust: 80, need: 70 })]);
  rollSeclusionInterrupt(world, player, '闭关', () => 0.99);
  assert.deepEqual(world.guardiansThisTurn, ['苏瑶']);
  applyStateUpdates(player, world, { timeMonths: 60, flags: { closedDoor: true } });
  assert.equal(world.guardiansThisTurn, null);
});
