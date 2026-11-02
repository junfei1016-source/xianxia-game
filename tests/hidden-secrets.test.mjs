import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  noteInvestigation,
  validateStateOutput,
  buildGMMessages,
} from '../public/game.js';
import { buildSlice, secretOf, factionByName } from '../public/world.js';

const setup = () => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.eraType = '盛世';
  world.factions = [{
    id: 'bailu', name: '白鹿观', type: '宗门', alignment: '中立',
    tier: 3, seat: 'qingwu', seeded: true, relation: '中立',
  }];
  return { player, world };
};

test('底细表存在：白鹿观与青芜王朝各有一条真相与线索', () => {
  assert.ok(secretOf('bailu').truth.includes('血刀寨'));
  assert.ok(secretOf('bailu').trail.length > 0);
  assert.ok(secretOf('qingwu_court').truth.includes('纳贡'));
  assert.equal(secretOf('shiyun'), null);
  assert.equal(factionByName('白鹿观').id, 'bailu');
});

test('开局切片不剧透：白鹿观在名单里，也不会写"表里不一"', () => {
  const { player, world } = setup();
  const slice = buildSlice(player, world);
  assert.ok(slice.includes('白鹿观'));
  assert.ok(!slice.includes('表里不一'));
  assert.ok(!slice.includes('血刀寨'));
});

test('只提名字不算调查：不起疑就不给线索', () => {
  const { player, world } = setup();
  const hits = noteInvestigation(world, '白鹿观最近香火不错');
  assert.deepEqual(hits, []);
  assert.equal(world.knownSecrets.bailu, undefined);
  const prompt = buildGMMessages(player, world, [], '白鹿观最近香火不错').map((m) => m.content).join('\n');
  assert.ok(!prompt.includes('暗线·玩家正在查'));
  assert.ok(!prompt.includes('血刀寨暗桩'));
});

test('玩家一调查，才把真相与线索交给 GM，且要求不能点破', () => {
  const { player, world } = setup();
  const hits = noteInvestigation(world, '去打听一下白鹿观的底细');
  assert.equal(hits.length, 1);
  assert.equal(world.knownSecrets.bailu, 'hinted');

  const prompt = buildGMMessages(player, world, [], '去打听一下白鹿观的底细').map((m) => m.content).join('\n');
  assert.ok(prompt.includes('【暗线·玩家正在查】'));
  assert.ok(prompt.includes('血刀寨暗桩'));
  assert.ok(prompt.includes('不得直接点破'));

  const slice = buildSlice(player, world);
  assert.ok(slice.includes('有蹊跷'), '起疑但未查明，只能显示"有蹊跷"');
  assert.ok(!slice.includes('表里不一'));
});

test('重复调查同一家不会重复记，也不会刷提示词', () => {
  const { world } = setup();
  noteInvestigation(world, '查探白鹿观');
  const again = noteInvestigation(world, '再查探白鹿观');
  assert.deepEqual(again, []);
  assert.equal(world.knownSecrets.bailu, 'hinted');
});

test('查到实证才标记：reveals 之后切片出现"表里不一"与真相', () => {
  const { player, world } = setup();
  noteInvestigation(world, '打听白鹿观');
  const note = applyStateUpdates(player, world, { reveals: [{ faction: '白鹿观' }] });
  assert.ok(note.includes('查出底细'));
  assert.ok(note.includes('血刀寨'));
  assert.equal(world.knownSecrets.bailu, 'revealed');

  const slice = buildSlice(player, world);
  assert.ok(slice.includes('表里不一'));
  assert.ok(slice.includes('【已查明】'));
  assert.ok(slice.includes('血刀寨暗桩'));

  const prompt = buildGMMessages(player, world, [], '继续').map((m) => m.content).join('\n');
  assert.ok(!prompt.includes('【暗线·玩家正在查】'), '已经查明，不该再让他"只给线索"');
});

test('查出底细后，这家势力会进入玩家名单并被记一笔事迹', () => {
  const { player, world } = setup();
  noteInvestigation(world, '查探白鹿观');
  applyStateUpdates(player, world, { reveals: [{ faction: '白鹿观' }] });
  assert.ok(world.factions.some((f) => f.name === '白鹿观'));
  const ev = world.events.find((e) => e.subject === '白鹿观' && e.title === '查出底细');
  assert.ok(ev, '事迹里应有"查出底细"');
});

test('没有底细的势力、或不存在的名字，reveals 一律忽略', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { reveals: [{ faction: '拾云门' }, { faction: '不存在的宗' }] });
  assert.equal(world.knownSecrets.shiyun, undefined);
  assert.equal(Object.keys(world.knownSecrets).length, 0);
});

test('没调查过就报"查明"不算数：必须先起疑', () => {
  const { player, world } = setup();
  const note = applyStateUpdates(player, world, { reveals: [{ faction: '白鹿观' }] });
  assert.equal(world.knownSecrets.bailu, undefined, '没起疑不该直接标记');
  assert.ok(!note || !note.includes('查出底细'));
});

test('校验层接受 reveals，坏的形状被丢弃', () => {
  const { out } = validateStateOutput({ reveals: [{ faction: '白鹿观' }, { name: '没有faction' }] });
  assert.equal(out.reveals.length, 1);
  assert.equal(out.reveals[0].faction, '白鹿观');
});
