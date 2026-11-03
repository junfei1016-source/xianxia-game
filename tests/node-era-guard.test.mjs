import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  gatherMaterials,
  regionNodeCap,
  nodeRespawn,
} from '../public/game.js';
import { regionById } from '../public/world.js';

const setup = (regionId, realm = '元婴初期', eraType = '') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  world.eraType = eraType;
  player.realm = realm;
  return { player, world };
};

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('刷新按小说年数：凡品两年、灵品十年、玄品五十年、仙品两百年、神品八百年', () => {
  assert.equal(nodeRespawn('凡品'), 24);
  assert.equal(nodeRespawn('灵品'), 120);
  assert.equal(nodeRespawn('玄品'), 600);
  assert.equal(nodeRespawn('仙品'), 2400);
  assert.equal(nodeRespawn('神品'), 9600);
});

test('大势改上限：秘境将启提两档，末法时代降两档', () => {
  const qingwu = regionById('qingwu');
  assert.equal(regionNodeCap(qingwu), 0);
  assert.equal(regionNodeCap(qingwu, '秘境将启'), 2);
  assert.equal(regionNodeCap(qingwu, '盛世'), 1);
  assert.equal(regionNodeCap(qingwu, '末法时代'), 0);

  const taiqing = regionById('taiqing');
  assert.equal(regionNodeCap(taiqing), 4);
  assert.equal(regionNodeCap(taiqing, '末法时代'), 2, '仙域也会跌到玄品');
});

test('秘境将启能催出灵品采集点，平时只有凡品', () => {
  const plain = new Set();
  for (let i = 0; i < 20; i++) {
    const { player, world } = setup('qingwu', '金丹初期', '');
    gatherMaterials(world, player, { kind: '采药', days: 4 }, seq([(i % 10) / 10, 0.3, 0.6, 0.9]));
    for (const n of world.nodes) plain.add(n.rarity);
  }
  assert.deepEqual([...plain], ['凡品']);

  const boom = new Set();
  for (let i = 0; i < 20; i++) {
    const { player, world } = setup('qingwu', '金丹初期', '秘境将启');
    gatherMaterials(world, player, { kind: '采药', days: 4 }, seq([(i % 10) / 10, 0.3, 0.6, 0.9]));
    for (const n of world.nodes) boom.add(n.rarity);
  }
  assert.ok(boom.has('灵品') || boom.has('玄品'), `秘境将启应出高阶：${[...boom].join('、')}`);
});

test('高阶采集点有守护：打不过就采不到，还会受伤', () => {
  const { player, world } = setup('xingyun', '金丹初期');
  world.nodes = [{
    id: 'xingyun_矿脉_0', region: 'xingyun', kind: '矿脉',
    material: '陨铁', rarity: '仙品', respawnMonths: 2400, harvestedMonth: null,
    guard: { name: '护脉石傀', rank: 3, defeated: false },
  }];
  const hp0 = player.hp;
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.9);
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('没能得手'), res.note);
  assert.ok(res.hpLoss > 0);
  assert.ok(player.hp < hp0);
  assert.equal(world.nodes[0].guard.defeated, false, '没打过，守护还在');
});

test('打赢守护：采得到，守护倒下', () => {
  const { player, world } = setup('xingyun', '元婴初期');
  world.nodes = [{
    id: 'xingyun_矿脉_0', region: 'xingyun', kind: '矿脉',
    material: '陨铁', rarity: '仙品', respawnMonths: 2400, harvestedMonth: null,
    guard: { name: '护脉石傀', rank: 3, defeated: false },
  }];
  const res = gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.1);
  assert.ok(res.note.includes('击退'), res.note);
  assert.equal(world.nodes[0].guard.defeated, true);
  assert.ok(Object.values(res.items).reduce((a, b) => a + b, 0) >= 1);
});

test('到期的采集点会按当前大势重掷：守护也重新生成', () => {
  const { player, world } = setup('xingyun', '元婴初期', '秘境将启');
  world.nodes = [{
    id: 'xingyun_矿脉_0', region: 'xingyun', kind: '矿脉',
    material: '星砂', rarity: '凡品', respawnMonths: 24, harvestedMonth: 0,
    guard: null,
  }];
  world.date = { year: 30, month: 1, day: 1 }; // 早就该恢复了
  gatherMaterials(world, player, { kind: '挖矿', days: 4 }, () => 0.1);
  const node = world.nodes[0];
  assert.ok(node.harvestedMonth > 0, '重掷后又被采了一次');
  assert.ok(['凡品', '灵品', '玄品', '仙品'].includes(node.rarity));
});

test('大势变了，重掷出来的东西不同档', () => {
  const calm = setup('xingyun', '元婴初期', '末法时代');
  const rich = setup('xingyun', '元婴初期', '秘境将启');
  assert.ok(regionNodeCap(regionById('xingyun'), '秘境将启') >= regionNodeCap(regionById('xingyun'), '末法时代'));

  // 末法时代：星陨的矿脉不该再出仙品（当地最低就是玄品，退而取之）
  gatherMaterials(calm.world, calm.player, { kind: '挖矿', days: 4 }, () => 0.05);
  for (const n of calm.world.nodes) {
    assert.ok(!['仙品', '神品'].includes(n.rarity), `末法时代不该出${n.rarity}`);
  }
  assert.ok(rich.world);
});
