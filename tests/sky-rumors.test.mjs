// 天时与传闻：世道不报名，只露征兆；人说人话，真假参半。
// 原文依据：全书没有"天下大势：某世"这种分类给玩家（韩立只知道米价、溃兵、封山、灵气变薄，
// 见第 172 章禁地圈封、第 220 章灵气分布）。所以内部五种底子只在机制层存在，对外只出征兆。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  buildWorldContext,
  skyOf,
  perceptionTier,
  ensureRumors,
  spawnRumor,
  resolveRumors,
  rumorsFor,
  tickRumors,
  regionNodeCap,
  ERA_LEVELS,
} from '../public/game.js';
import { priceMultiplier } from '../public/world.js';

const ERAS = ['盛世', '乱世', '末法时代', '秘境将启', '正魔大战'];
const BANNED = /盛世|乱世|末法时代|秘境将启|正魔大战/;

const setup = (era = '乱世', realm = '凡人') => {
  const player = newPlayerState();
  player.realm = realm;
  const world = newWorldState();
  world.eraType = era;
  world.era = '近年灵气渐薄，路上不太平';
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.turn = 6;
  return { player, world };
};

test('感知分三档：凡人只说"不对劲"，筑基说清两样，元婴三样齐全', () => {
  assert.equal(perceptionTier({ realm: '凡人' }), 0);
  assert.equal(perceptionTier({ realm: '炼气后期' }), 0);
  assert.equal(perceptionTier({ realm: '筑基初期' }), 1);
  assert.equal(perceptionTier({ realm: '金丹后期' }), 1);
  assert.equal(perceptionTier({ realm: '元婴初期' }), 2);
  assert.equal(perceptionTier({ realm: '化神后期' }), 2);

  const mortal = setup('乱世', '炼气中期');
  const s0 = skyOf(mortal.player, mortal.world);
  assert.equal(s0.tier, 0);
  assert.equal(s0.lines.length, 1);
  assert.ok(s0.lines[0].length > 4);

  const mid = setup('乱世', '筑基中期');
  const s1 = skyOf(mid.player, mid.world);
  assert.equal(s1.tier, 1);
  assert.equal(s1.lines.length, 2);
  assert.ok(s1.sky && s1.market, '筑基应能看到天时与市面');
  assert.equal(s1.people, '', '还看不到人事');

  const high = setup('乱世', '元婴中期');
  const s2 = skyOf(high.player, high.world);
  assert.equal(s2.tier, 2);
  assert.equal(s2.lines.length, 3);
  assert.ok(s2.people, '元婴能看到人事');
});

test('征兆里永远不出现时代名（全世道 × 全境界档）', () => {
  for (const era of ERAS) {
    for (const realm of ['凡人', '筑基初期', '元婴后期']) {
      const { player, world } = setup(era, realm);
      const sky = skyOf(player, world);
      for (const line of sky.lines) {
        assert.ok(line.trim().length > 0, `${era}/${realm} 出了空征兆`);
        assert.doesNotMatch(line, BANNED, `${era}/${realm} 的征兆漏了时代名：${line}`);
      }
    }
  }
});

test('征兆跟着内部底子走：兵祸的市面涨价，太平的市面价平', () => {
  const war = setup('乱世', '元婴初期');
  const peace = setup('盛世', '元婴初期');
  const warMarket = skyOf(war.player, war.world).market;
  const peaceMarket = skyOf(peace.player, peace.world).market;
  assert.match(warMarket, /涨|抬价|断货|一日一变/);
  assert.match(peaceMarket, /价平|划算|赊账|络绎|常见货/);
  assert.notEqual(warMarket, peaceMarket);
});

test('同一世道同一回合，征兆稳定（渲染多次不会闪）', () => {
  const { player, world } = setup('秘境将启', '元婴中期');
  const a = skyOf(player, world).lines.join('|');
  const b = skyOf(player, world).lines.join('|');
  assert.equal(a, b);
  world.turn += 1; // 换回合才换句子
  const c = skyOf(player, world).lines.join('|');
  assert.notEqual(a, c);
});

test('快照不再把时代标签喂给模型，只喂征兆与传闻', () => {
  const { player, world } = setup('乱世', '筑基中期');
  const ctx = buildWorldContext(world, player);
  assert.equal('eraType' in ctx, false, 'buildWorldContext 不应再带 eraType');
  assert.ok(ctx.sky && Array.isArray(ctx.sky.lines), '应带分层后的征兆');
  const json = JSON.stringify(ctx);
  assert.doesNotMatch(json, BANNED, '快照里漏了时代名');
});

test('传闻：来源有名有姓，真假大抵六四开', () => {
  const { world } = setup('乱世', '凡人');
  let trueCount = 0;
  const N = 200;
  let seed = 1;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < N; i += 1) {
    const r = spawnRumor(world, rand);
    assert.ok(r.source && r.source.length >= 2);
    assert.ok(r.text && r.text.length >= 4);
    assert.doesNotMatch(r.text, BANNED);
    assert.ok(ERAS.includes(r.claim), 'claim 必须是合法的内部底子');
    if (r.truth) trueCount += 1;
  }
  assert.ok(world.rumors.length <= 8, '存档里最多留 8 条');
  const ratio = trueCount / N;
  assert.ok(ratio > 0.45 && ratio < 0.75, `真传闻比例应在六成上下，实际 ${ratio.toFixed(2)}`);
});

test('假传闻多半是拿别个世道的说法冒充（所以能对照现况识破）', () => {
  const { world } = setup('盛世', '凡人');
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let wrongClaim = 0;
  let falseCount = 0;
  for (let i = 0; i < 120; i += 1) {
    const r = spawnRumor(world, rand);
    if (!r.truth) { falseCount += 1; if (r.claim !== '盛世') wrongClaim += 1; }
  }
  assert.ok(falseCount > 0, '总得有几条假的');
  assert.equal(wrongClaim, falseCount, '假话一律来自别个世道');
});

test('传闻三回合水落石出，并写进事迹', () => {
  const { player, world } = setup('乱世', '凡人');
  let seed = 3;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const r = spawnRumor(world, rand);
  r.turn = 0;
  world.turn = 2;
  resolveRumors(world, player);
  assert.equal(r.outcome, null, '不到三回合不揭晓');
  world.turn = 3;
  resolveRumors(world, player);
  assert.equal(r.outcome, r.truth ? 'true' : 'false');
  assert.ok(world.events.some((e) => e.subject === '传闻' && (e.title === '应验' || e.title === '是虚的')));
});

test('元婴能听出假话，低境界听不出（境界带来的实利）', () => {
  const low = setup('乱世', '炼气后期');
  const high = setup('乱世', '元婴中期');
  for (const w of [low.world, high.world]) {
    w.rumors = [{ id: 'rm-x', text: '城里都在说粮价要跌' , source: '行商', claim: '盛世', truth: false, turn: 9, month: 1, outcome: null }];
    w.rumorSeq = 1;
  }
  const lowLine = rumorsFor(low.player, low.world).join('');
  const highLine = rumorsFor(high.player, high.world).join('');
  assert.doesNotMatch(lowLine, /不像实话/);
  assert.match(highLine, /不像实话/);
  for (const line of [lowLine, highLine]) assert.doesNotMatch(line, BANNED);
});

test('传闻推进有节奏：每三回合冒一条，不多不少', () => {
  const { player, world } = setup('乱世', '筑基初期');
  world.rumors = [];
  world.turn = 1;
  let seed = 11;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  tickRumors(world, player, rand);
  assert.equal(world.rumors.length, 0, '第 1 回合不冒');
  world.turn = 3;
  tickRumors(world, player, rand);
  assert.equal(world.rumors.length, 1);
  world.turn = 6;
  tickRumors(world, player, rand);
  assert.equal(world.rumors.length, 2);
});

test('旧档迁移幂等：没有传闻字段能补，非法值被重置', () => {
  const w = newWorldState();
  assert.equal(ensureRumors(w).length, 0);
  const snap = JSON.stringify(w.rumors) + w.rumorSeq;
  ensureRumors(w);
  assert.equal(JSON.stringify(w.rumors) + w.rumorSeq, snap);
  const broken = newWorldState();
  broken.rumors = 'x';
  broken.rumorSeq = -3;
  ensureRumors(broken);
  assert.deepEqual(broken.rumors, []);
  assert.equal(broken.rumorSeq, 0);
});

test('机制不因藏起标签而失效：物价与采集上限仍按内部底子算', () => {
  const { world } = setup('末法时代', '凡人');
  const p1 = priceMultiplier('qingwu', '末法时代', world);
  const p2 = priceMultiplier('qingwu', '盛世', world);
  assert.ok(p1 > p2, '末法末年物价比盛世贵');
  const region = { id: 'qingwu', qi: 4, danger: 4, products: ['灵品', '玄品'] };
  assert.ok(regionNodeCap(region, '秘境将启') > regionNodeCap(region, '末法时代'));
  assert.ok(ERA_LEVELS.length === 5, '内部底子仍是五种');
});
