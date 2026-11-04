import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  gatherMaterials,
  regionNodeCap,
  nodeRespawn,
  NODE_RARITIES,
} from '../public/game.js';
import { regionById } from '../public/world.js';

const setup = (regionId, realm = '元婴初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  return { player, world };
};

// 依次取值的假随机
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('区域稀有度上限：按灵气+危险排，仙域最高', () => {
  assert.equal(regionNodeCap(regionById('qingwu')), 0, '越国·建州只出凡品');
  assert.equal(regionNodeCap(regionById('luoxia')), 0, '坊市同在建州，也是凡品');
  assert.equal(regionNodeCap(regionById('dayan')), 1, '元武国：灵气3+危险2');
  assert.equal(regionNodeCap(regionById('chisha')), 2, '天罗国：3+4');
  assert.equal(regionNodeCap(regionById('hanyuan')), 2, '尾星岛：3+4');
  assert.equal(regionNodeCap(regionById('guixu')), 2, '天星城：4+2');
  assert.equal(regionNodeCap(regionById('wanyao')), 2, '慕兰草原：3+4');
  assert.equal(regionNodeCap(regionById('xingyun')), 3, '奇渊岛：4+5');
  assert.equal(regionNodeCap(regionById('taiqing')), 4, '灵气 6 的灵界可出神品');
});

test('恢复周期按稀有度：凡品半年，神品八年', () => {
  assert.equal(nodeRespawn('凡品'), 24); // 2 年
  assert.equal(nodeRespawn('灵品'), 120); // 10 年
  assert.equal(nodeRespawn('玄品'), 600); // 50 年
  assert.equal(nodeRespawn('仙品'), 2400); // 200 年
  assert.equal(nodeRespawn('神品'), 9600); // 800 年
});

test('青芜的采集点只能是凡品，材料也对得上', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  gatherMaterials(world, player, { kind: '采药', days: 4 }, () => 0.1);
  assert.equal(world.nodes.length, 3);
  for (const n of world.nodes) {
    assert.equal(n.rarity, '凡品');
    assert.equal(n.respawnMonths, 24);
  }
});

test('奇渊岛能出到仙品，但出不了神品', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const { player, world } = setup('xingyun', '元婴初期');
    gatherMaterials(world, player, { kind: '挖矿', days: 4 }, seq([(i % 20) / 20, 0.3, 0.5, 0.9]));
    for (const n of world.nodes) {
      seen.add(n.rarity);
      assert.ok(NODE_RARITIES.indexOf(n.rarity) <= 3, `${n.rarity} 超出上限`);
    }
  }
  assert.ok(seen.has('仙品'), `应出现仙品：${[...seen].join('、')}`);
});

test('灵界·天渊城能出神品', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const { player, world } = setup('taiqing', '化神初期');
    gatherMaterials(world, player, { kind: '采药', days: 4 }, seq([(i % 20) / 20, 0.5, 0.7, 0.95]));
    for (const n of world.nodes) seen.add(n.rarity);
  }
  assert.ok(seen.has('神品') || seen.has('仙品'), `仙域应出仙品以上：${[...seen].join('、')}`);
});

test('高阶采集点收成少：仙品一次只出一份', () => {
  const { player, world } = setup('taiqing', '化神初期');
  world.nodes = [{
    id: 'taiqing_药圃_0', region: 'taiqing', kind: '药圃',
    material: '万年灵乳', rarity: '神品', respawnMonths: 96, harvestedMonth: null,
  }];
  const res = gatherMaterials(world, player, { kind: '采药', days: 12 }, () => 0.1);
  assert.equal(res.ok, true);
  assert.equal(Object.values(res.items).reduce((a, b) => a + b, 0), 1);
  assert.ok(res.note.includes('神品'));
});

test('普通采集点照旧吃天数：凡品八天两份', () => {
  const { player, world } = setup('qingwu', '筑基初期');
  const res = gatherMaterials(world, player, { kind: '采药', days: 8 }, () => 0.1);
  assert.equal(Object.values(res.items).reduce((a, b) => a + b, 0), 2);
  assert.ok(res.note.includes('凡品'));
});

test('低境界取不到仙品采集点：会跳过它', () => {
  const { player, world } = setup('xingyun', '炼气初期');
  world.nodes = [{
    id: 'xingyun_矿脉_0', region: 'xingyun', kind: '矿脉',
    material: '星砂', rarity: '玄品', respawnMonths: 24, harvestedMonth: null,
  }];
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.3);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('非你修为'));
});
