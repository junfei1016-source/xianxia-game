import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  bondOf,
  clampBond,
  relationCultMult,
  validateStateOutput,
} from '../public/game.js';

const setup = () => ({ player: newPlayerState(), world: newWorldState() });

const addNpc = (world, patch) => {
  applyStateUpdates(newPlayerState(), world, { newNpcs: [{ name: patch.name, desc: '测试', ...patch }] });
  return world.npcs.find((n) => n.name === patch.name);
};

test('旧档迁移：没有账本时按标签给种子，且反复读不改存档', () => {
  const npc = { name: '苏瑶', relation: '道侣' };
  const before = JSON.stringify(npc);
  const a = bondOf(npc);
  const b = bondOf(npc);
  assert.deepEqual(a, b);
  assert.equal(a.trust, 80);
  assert.equal(a.need, 75);
  assert.equal(JSON.stringify(npc), before, '读账本不应写回');
  assert.equal(bondOf({ relation: '结仇' }).grudge, 75);
  assert.equal(bondOf({ relation: '师徒' }).debt, 65);
  assert.equal(bondOf({}).trust, 30, '无关系时给基础值');
});

test('有账本时原样读取，越界值夹回 0~100', () => {
  const npc = { bond: { debt: -5, grudge: 120, trust: 63.4, need: 'x' } };
  const b = bondOf(npc);
  assert.equal(b.debt, 0);
  assert.equal(b.grudge, 100);
  assert.equal(b.trust, 63);
  assert.equal(b.need, 0);
  assert.equal(clampBond(Infinity), 0);
});

test('修炼加成按"信/需"算，不再按标签：道侣 > 师徒 > 陌生人', () => {
  const mate = relationCultMult([{ name: '甲', relation: '道侣' }]);
  const master = relationCultMult([{ name: '乙', relation: '师徒' }]);
  const stranger = relationCultMult([{ name: '丙', relation: '' }]);
  assert.ok(mate > master, `道侣 ${mate} 应高于师徒 ${master}`);
  assert.ok(master > stranger, `师徒 ${master} 应高于陌生人 ${stranger}`);
  assert.ok(mate <= 1.3 + 1e-9, '加成有上限');
});

test('结仇的人再亲的名分也不加修炼：怨 ≥60 直接不计', () => {
  const npc = { name: '丁', relation: '道侣', bond: { debt: 0, grudge: 80, trust: 90, need: 90 } };
  assert.equal(relationCultMult([npc]), 1);
});

test('新 NPC 自带基础账本，结义立刻有实质', () => {
  const { world } = setup();
  const plain = addNpc(world, { name: '路人甲' });
  assert.equal(plain.bond.trust, 30);
  assert.ok(Number.isFinite(plain.lastTouchMonth));
  const sworn = addNpc(world, { name: '关二', relation: '结义' });
  assert.equal(sworn.bond.trust, 75);
  assert.equal(sworn.bond.need, 35);
});

test('提取器给数值就按数值结算，并夹在 0~100', () => {
  const { player, world } = setup();
  addNpc(world, { name: '柳三娘' });
  applyStateUpdates(player, world, { npcRelations: [{ name: '柳三娘', trust: 20, need: 10 }] });
  let npc = world.npcs.find((n) => n.name === '柳三娘');
  assert.equal(npc.bond.trust, 50);
  assert.equal(npc.bond.need, 30);

  applyStateUpdates(player, world, { npcRelations: [{ name: '柳三娘', trust: 90 }] });
  npc = world.npcs.find((n) => n.name === '柳三娘');
  assert.equal(npc.bond.trust, 100, '不能超过 100');

  applyStateUpdates(player, world, { npcRelations: [{ name: '柳三娘', grudge: 30, trust: -200 }] });
  npc = world.npcs.find((n) => n.name === '柳三娘');
  assert.equal(npc.bond.grudge, 30);
  assert.equal(npc.bond.trust, 0, '不能低于 0');
});

test('只给标签不给数值：按标签给种子，标签换了账本跟着换', () => {
  const { player, world } = setup();
  addNpc(world, { name: '沈青梧', relation: '挚友' });
  applyStateUpdates(player, world, { npcRelations: [{ name: '沈青梧', relation: '道侣' }] });
  const npc = world.npcs.find((n) => n.name === '沈青梧');
  assert.equal(npc.relation, '道侣');
  assert.equal(npc.bond.trust, 80);
  assert.equal(npc.bond.need, 75);
});

test('关系折旧：三个月没往来，信 −2、需 −3，只扣一次', () => {
  const { player, world } = setup();
  const npc = addNpc(world, { name: '旧识', relation: '挚友' });
  npc.lastTouchMonth = 13; // 1 年 1 月
  world.date = { year: 1, month: 3, day: 1 };
  advanceTime(world, player, 1); // 到 4 月：间隔 3 个月，触发一次
  assert.equal(npc.bond.trust, 68);
  assert.equal(npc.bond.need, 32);
  advanceTime(world, player, 0); // 同月再推进不应再扣
  assert.equal(npc.bond.trust, 68);
});

test('两个月内不折旧：短期同行不会掉关系', () => {
  const { player, world } = setup();
  const npc = addNpc(world, { name: '同行者', relation: '挚友' });
  const before = { ...npc.bond };
  npc.lastTouchMonth = 15; // 1 年 3 月（与当前日期同月）
  world.date = { year: 1, month: 3, day: 1 };
  advanceTime(world, player, 1); // 到 4 月，只隔 1 个月
  assert.deepEqual(npc.bond, before);
});

test('校验层接受四维增减量；未知字段仍被忽略', () => {
  const { out, issues } = validateStateOutput({
    npcRelations: [{ name: '甲', trust: 10, grudge: -5, need: 3, debt: 2, foo: 1 }],
  });
  assert.equal(out.npcRelations.length, 1);
  assert.equal(out.npcRelations[0].trust, 10);
  assert.equal(out.npcRelations[0].grudge, -5);
  assert.ok(issues.some((i) => i.code === 'unknown_field'));
});

test('老档里只有标签的 NPC，也能被新的结算逻辑吃到', () => {
  const { player, world } = setup();
  world.npcs.push({ name: '老档道侣', relation: '道侣' });
  const before = relationCultMult(world.npcs);
  assert.ok(before > 1.2, `旧档道侣也该有加成，实际 ${before}`);
  applyStateUpdates(player, world, { npcRelations: [{ name: '老档道侣', trust: -80 }] });
  const after = relationCultMult(world.npcs);
  assert.ok(after < before, '账本变化应立即影响加成');
});
