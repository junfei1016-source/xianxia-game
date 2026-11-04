// 天时与传闻：世道不报名，只露征兆；消息只从人嘴里来（打听 / 初到一地），不按回合机械弹。
// 原文依据：全书没有"天下大势：某世"这种分类给玩家（第 172 章禁地圈封、第 220 章灵气分布），
// 韩立的消息也是问人、听人说、花灵石买来的，不是天上掉的。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  buildWorldContext,
  skyOf,
  perceptionTier,
  ensureRumors,
  askAround,
  settleRumors,
  rumorsFor,
  applyStateUpdates,
  regionNodeCap,
  ERA_LEVELS,
} from '../public/game.js';
import { priceMultiplier } from '../public/world.js';

const ERAS = ['盛世', '乱世', '末法时代', '秘境将启', '正魔大战'];
const BANNED = /盛世|乱世|末法时代|秘境将启|正魔大战/;

const setup = (era = '乱世', realm = '凡人', region = 'qingwu') => {
  const player = newPlayerState();
  player.realm = realm;
  const world = newWorldState();
  world.eraType = era;
  world.era = '近年灵气渐薄，路上不太平';
  world.geo = { regionId: region, sinceTurn: 0, migrated: false };
  world.date = { year: 3, month: 4, day: 1 };
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

  const low = setup('乱世', '炼气中期');
  const s0 = skyOf(low.player, low.world);
  assert.equal(s0.tier, 0);
  assert.equal(s0.lines.length, 1);

  const mid = setup('乱世', '筑基中期');
  const s1 = skyOf(mid.player, mid.world);
  assert.equal(s1.tier, 1);
  assert.equal(s1.lines.length, 2);
  assert.equal(s1.people, '');

  const high = setup('乱世', '元婴中期');
  const s2 = skyOf(high.player, high.world);
  assert.equal(s2.tier, 2);
  assert.equal(s2.lines.length, 3);
  assert.ok(s2.people);
});

test('征兆里永远不出现时代名（全世道 × 全境界档）', () => {
  for (const era of ERAS) {
    for (const realm of ['凡人', '筑基初期', '元婴后期']) {
      const { player, world } = setup(era, realm);
      for (const line of skyOf(player, world).lines) {
        assert.ok(line.trim().length > 0);
        assert.doesNotMatch(line, BANNED, `${era}/${realm}：${line}`);
      }
    }
  }
});

test('征兆跟着内部底子走：兵祸涨价，太平价平', () => {
  const war = setup('乱世', '元婴初期');
  const peace = setup('盛世', '元婴初期');
  assert.match(skyOf(war.player, war.world).market, /涨|抬价|断货|一日一变/);
  assert.match(skyOf(peace.player, peace.world).market, /价平|划算|赊账|络绎|常见货/);
});

test('同一回合征兆稳定，换回合才换句子', () => {
  const { player, world } = setup('秘境将启', '元婴中期');
  const a = skyOf(player, world).lines.join('|');
  assert.equal(a, skyOf(player, world).lines.join('|'));
  world.turn += 1;
  assert.notEqual(a, skyOf(player, world).lines.join('|'));
});

test('快照不喂时代标签，只喂征兆与传闻', () => {
  const { player, world } = setup('乱世', '筑基中期');
  const ctx = buildWorldContext(world, player);
  assert.equal('eraType' in ctx, false);
  assert.ok(Array.isArray(ctx.sky.lines));
  assert.doesNotMatch(JSON.stringify(ctx), BANNED);
});

test('传闻不按回合机械生成：过多少回合都不会自己冒出来', () => {
  const { player, world } = setup('乱世', '筑基初期');
  for (let turn = 1; turn <= 30; turn += 1) {
    world.turn = turn;
    settleRumors(world, player);
  }
  assert.equal(world.rumors.length, 0, '没人问、没挪窝，就不该有传闻');
});

test('去问人才有：打听给一条，来源有名有姓，同地同月不重复', () => {
  const { player, world } = setup('乱世', '筑基初期', 'luoxia');
  const first = askAround(world, player);
  assert.ok(first && first.rumor, '问一次该有一句');
  assert.ok(first.rumor.source.length >= 2);
  assert.ok(first.rumor.text.length >= 4);
  assert.doesNotMatch(first.note, BANNED);
  assert.match(first.note, /^【打听】/);
  assert.equal(askAround(world, player), null, '同一个月里同一地方，问不出第二句');
  world.date = { year: 3, month: 5, day: 1 };
  assert.ok(askAround(world, player), '换个月份可以再问');
});

test('荒郊野岭和坊市，说话的人不一样', () => {
  const wild = setup('乱世', '筑基初期', 'chisha');
  const town = setup('乱世', '筑基初期', 'luoxia');
  const a = askAround(wild.world, wild.player);
  const b = askAround(town.world, town.player);
  assert.ok(a && b);
  assert.ok(['落脚处的樵夫', '酒肆里的散修', '游方道人', '同路的行商'].includes(a.rumor.source), a.rumor.source);
  assert.ok(['茶馆掌柜', '坊市药童', '驿馆伙计', '行商'].includes(b.rumor.source), b.rumor.source);
});

test('身份越高，听到的真话越多', () => {
  const sample = (realm) => {
    let truth = 0;
    for (let i = 0; i < 120; i += 1) {
      const { player, world } = setup('乱世', realm, 'luoxia');
      world.date = { year: 3, month: 1 + (i % 12), day: 1 };
      const r = askAround(world, player);
      if (r && r.rumor.truth) truth += 1;
    }
    return truth;
  };
  const low = sample('炼气中期');
  const high = sample('元婴后期');
  assert.ok(high > low, `元婴(${high}) 该比炼气(${low}) 听到更多真话`);
});

test('初到一地，落脚处会听到一句（原著里的先打听再动身）', () => {
  const { player, world } = setup('乱世', '筑基初期', 'qingwu');
  world.rumors = [];
  world.rumorSeq = 0;
  applyStateUpdates(player, world, { travelTo: '落霞坊' });
  assert.equal(world.rumors.length, 1, '换个地方该听到一句');
  assert.ok(world.rumors[0].text.length > 0);
});

test('三回合后见分晓并写进事迹；元婴能听出假话', () => {
  const { player, world } = setup('乱世', '元婴中期', 'luoxia');
  const got = askAround(world, player);
  assert.ok(got);
  const r = got.rumor;
  world.turn = r.turn + 1;
  settleRumors(world, player);
  assert.equal(r.outcome, null, '不到三回合不揭晓');
  world.turn = r.turn + 3;
  settleRumors(world, player);
  assert.equal(r.outcome, r.truth ? 'true' : 'false');
  assert.ok(world.events.some((e) => e.subject === '传闻' && (e.title === '应验' || e.title === '是虚的')));

  const low = setup('乱世', '炼气后期', 'luoxia');
  low.world.rumors = [{ id: 'rm-x', text: '城里都在说粮价要跌', source: '行商', claim: '盛世', truth: false, turn: 9, month: 1, outcome: null }];
  assert.doesNotMatch(rumorsFor(low.player, low.world).join(''), /不像实话/);
  world.rumors = [{ id: 'rm-y', text: '城里都在说粮价要跌', source: '行商', claim: '盛世', truth: false, turn: 99, month: 1, outcome: null }];
  assert.match(rumorsFor(player, world).join(''), /不像实话/);
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
  assert.ok(priceMultiplier('qingwu', '末法时代', world) > priceMultiplier('qingwu', '盛世', world));
  const region = { id: 'qingwu', qi: 4, danger: 4, products: ['灵品', '玄品'] };
  assert.ok(regionNodeCap(region, '秘境将启') > regionNodeCap(region, '末法时代'));
  assert.equal(ERA_LEVELS.length, 5);
});
