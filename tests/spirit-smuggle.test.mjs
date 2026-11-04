// 偷渡：不从飞灵台走正途，而是从空间节点硬闯灵界。
// 原文：第 1071 章（人界有"天生薄弱的空间节点"，界力薄、可开登天之路，但空间风暴九死一生）、
//       第 1195 章（化界珠专破空间禁制，"没有化界珠在身根本有去无回"）、
//       第 1238 章（三处节点里两处入口就有空间风暴）、第 1461 章（韩立本人就是偷渡过去的）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  attemptSmuggle,
  smuggleChance,
  interfaceOf,
  SMUGGLE_MIN,
} from '../public/game.js';
import {
  SPACE_NODES,
  nodeInRegion,
  buildSlice,
} from '../public/world.js';

const setup = (region = 'wubian', realm = '化神初期', stones = 0) => {
  const player = newPlayerState();
  player.realm = realm;
  player.cultivation = 60;
  player.spiritStones = stones;
  const world = newWorldState();
  world.eraType = '乱世';
  world.geo = { regionId: region, sinceTurn: 0, migrated: false };
  world.date = { year: 50, month: 3, day: 1 };
  world.turn = 100;
  return { player, world };
};

const fixed = (v) => () => v;

test('节点只在三处界力薄弱之地', () => {
  assert.equal(SPACE_NODES.length, 3);
  assert.equal(nodeInRegion('wubian').name, '无边海·断界崖');
  assert.equal(nodeInRegion('chisha').name, '天罗国·无光谷');
  assert.equal(nodeInRegion('xingyun').name, '奇渊岛·沉星渊');
  assert.equal(nodeInRegion('qingwu'), null, '建州没有节点');
  assert.equal(nodeInRegion('taiqing'), null, '灵界不算');
});

test('切片会提示界力薄弱，别的地方不会', () => {
  const { player, world } = setup('wubian');
  const slice = buildSlice(player, world);
  assert.match(slice, /【异象】/);
  assert.match(slice, /断界崖/);
  const other = setup('qingwu');
  assert.doesNotMatch(buildSlice(other.player, other.world), /【异象】/);
});

test('不在节点处，偷渡无从谈起', () => {
  const { player, world } = setup('qingwu');
  const res = attemptSmuggle(player, world, fixed(0.01));
  assert.equal(res.ok, false);
  assert.match(res.reason, /没有空间节点/);
});

test('修为太低会被空间之力化成乌有：元武国境内的守门也拦', () => {
  const { player, world } = setup('wubian', '炼气后期');
  const res = attemptSmuggle(player, world, fixed(0.01));
  assert.equal(res.ok, false);
  assert.match(res.reason, new RegExp(SMUGGLE_MIN));
});

test('化界珠大幅提高成功率（第 1195 章）', () => {
  const plain = setup('wubian', '化神初期');
  const withOrb = setup('wubian', '化神初期');
  withOrb.world.inventory = [{ name: '化界珠', kind: '法宝', qty: 1 }];
  const node = nodeInRegion('wubian');
  const a = smuggleChance(plain.player, plain.world, node);
  const b = smuggleChance(withOrb.player, withOrb.world, node);
  assert.ok(b > a + 0.2, `带化界珠应明显更高：${a} → ${b}`);
});

test('成功率夹在 3%~90%，不会白送也不会送死', () => {
  const strong = setup('wubian', '化神后期');
  strong.world.inventory = [{ name: '化界珠', qty: 1 }];
  const p = smuggleChance(strong.player, strong.world, nodeInRegion('wubian'));
  assert.ok(p > 0.5 && p <= 0.9);
  assert.ok(p >= 0.03);
});

test('偷渡成功：落在灵界荒野，没有仙籍，随身灵物折在通道里', () => {
  const { player, world } = setup('wubian', '化神后期');
  world.inventory = [
    { name: '化界珠', kind: '法宝', qty: 1 },
    { name: '万年灵液', kind: '灵液', qty: 2 },
    { name: '回春丹', kind: '丹药', qty: 3 },
  ];
  const orig = Math.random;
  Math.random = () => 0; // 必成
  let note;
  try { note = applyStateUpdates(player, world, { smuggle: { node: '断界崖' } }); } finally { Math.random = orig; }
  assert.match(note, /【偷渡】/);
  assert.equal(interfaceOf(world), '灵界', '人已在灵界');
  assert.ok(['fengyuan', 'leihai', 'xuetian'].includes(world.geo.regionId), `落点异常：${world.geo.regionId}`);
  assert.equal(world.flags.spiritOutlaw, true, '没有仙籍');
  assert.ok(!world.inventory.some((it) => /化界珠|万年灵液/.test(it.name)), '化界珠与万年灵液都耗在节点里');
  assert.ok(world.inventory.some((it) => it.name === '回春丹'), '别的丹不该被清掉');
});

test('偷渡失败：多半身死道消，偶有重伤逃回', () => {
  const dead = setup('wubian', '化神初期');
  let dc = 0;
  const deadSeq = () => (dc++ === 0 ? 0.99 : 0.1); // 先判定失败，再掷进 6 成死亡
  const r1 = attemptSmuggle(dead.player, dead.world, deadSeq);
  assert.equal(r1.ok, false);
  assert.equal(r1.death, true);
  assert.equal(dead.player.hp, 0);
  assert.equal(dead.world.flags.deathByRisk, true);

  // 第一次掷 0.99（超过成功率）→ 失败；第二次掷 0.9（不低于 0.6）→ 活下来但重伤
  let calls = 0;
  const seq = () => (calls++ === 0 ? 0.99 : 0.9);
  const hurt = setup('wubian', '化神初期');
  const r2 = attemptSmuggle(hurt.player, hurt.world, seq);
  assert.equal(r2.ok, false);
  assert.ok(!r2.death);
  assert.equal(hurt.player.hp, Math.max(1, Math.round(hurt.player.maxHp * 0.1)));
  assert.ok(hurt.player.lifespan < 100, '寿元折了二十年');
  assert.equal(hurt.world.geo.regionId, 'wubian', '人还在原地');
});

test('走正途与偷渡互不影响：化神后期圆满仍可正常破界飞升', () => {
  const { player, world } = setup('qingwu', '化神后期');
  player.cultivation = 100;
  applyStateUpdates(player, world, { travelTo: '灵界·天渊城' });
  assert.equal(world.geo.regionId, 'feiling', '正途落在飞灵台');
  assert.ok(!world.flags.spiritOutlaw, '正途不算黑户');
});
