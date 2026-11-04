// 地脉枯荣：灵气被采狠了会流失，封山久了才回补。
// 原文依据：第 220 章（灵脉成形后"灵气循环不绝，不会有枯竭之日"；灵眼处最适合打坐），
// 第 172 章（禁地频繁开启 → 灵气大量流失、灵药逐年稀少；圈封五六十年才恢复密度）。
// 只测规则与数据层，不联网、不碰真实模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  ensureRegionQi,
  noteRegionHarvest,
  evolveRegionQi,
  regionCultMult,
  regionNodeCap,
} from '../public/game.js';
import {
  allRegions,
  regionById,
  buildSlice,
  ensureWorldGeo,
  priceMultiplier,
  regionQi,
  regionQiState,
  qiLabel,
  qiCultMult,
  qiPriceMult,
  REGION_QI_RULES,
} from '../public/world.js';

const setup = (geo = 'qingwu') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.era = '越国·建州风调雨顺';
  world.eraType = '盛世';
  world.geo = { regionId: geo, sinceTurn: 0, migrated: false };
  return { player, world };
};

test('ensureRegionQi：旧档补字段幂等，非法值被重置', () => {
  const { world } = setup();
  assert.equal(world.regionQi, undefined, '新档默认不带枯荣字段');
  const first = ensureRegionQi(world);
  assert.deepEqual(first, {});
  assert.equal(world.qiDays, 0);
  assert.equal(world.qiMonths, 0);
  assert.deepEqual(world.regionQiLog, []);
  const snap = JSON.stringify({ q: world.regionQi, d: world.qiDays, m: world.qiMonths, l: world.regionQiLog });
  ensureRegionQi(world);
  assert.equal(JSON.stringify({ q: world.regionQi, d: world.qiDays, m: world.qiMonths, l: world.regionQiLog }), snap, '第二次调用不得改动');

  const broken = newWorldState();
  broken.regionQi = [];
  broken.qiDays = -3;
  broken.regionQiLog = 'x';
  ensureRegionQi(broken);
  assert.deepEqual(broken.regionQi, {});
  assert.equal(broken.qiDays, 0);
  assert.deepEqual(broken.regionQiLog, []);
});

test('采集会加压：越高等的货压得越重', () => {
  const { world } = setup();
  const region = regionById('qingwu');
  noteRegionHarvest(world, region, '凡品');
  const afterLow = regionQiState(world, 'qingwu').pressure;
  assert.equal(afterLow, REGION_QI_RULES.harvestCost['凡品']);
  noteRegionHarvest(world, region, '玄品');
  assert.equal(regionQiState(world, 'qingwu').pressure, REGION_QI_RULES.harvestCost['凡品'] + REGION_QI_RULES.harvestCost['玄品']);
  assert.ok(REGION_QI_RULES.harvestCost['神品'] > REGION_QI_RULES.harvestCost['灵品'], '神品比灵品压得重');
});

test('压力攒满才掉一寸，且灵气不低于 1', () => {
  const { world } = setup();
  const region = regionById('qingwu'); // 底值 2
  noteRegionHarvest(world, region, '神品'); // 30 → 刚好一个阈值
  evolveRegionQi(world, 1); // 一个月：先自消 2 点压力，再看阈值
  const st = regionQiState(world, 'qingwu');
  assert.equal(st.qi, 2, '自消后只剩 28，未到阈值，灵气不动');
  noteRegionHarvest(world, region, '神品');
  noteRegionHarvest(world, region, '神品');
  evolveRegionQi(world, 1);
  assert.equal(regionQi(region, world), 1, '压力攒满后掉到下限');
  for (let i = 0; i < 40; i += 1) {
    noteRegionHarvest(world, region, '神品');
    evolveRegionQi(world, 1);
  }
  assert.ok(regionQi(region, world) >= 1, '再采也不会低于 1');
});

test('灵气不会超过表里的底值：灵脉会回常态，不会更好', () => {
  const { world } = setup();
  const region = regionById('qingwu');
  world.regionQi = { qingwu: { qi: 6, pressure: 0, idle: 0 } };
  assert.equal(regionQi(region, world), 2, '青芜底值 2，存档里写 6 也只能算 2');
  world.regionQi = { qingwu: { qi: 1, pressure: 0, idle: REGION_QI_RULES.recoverPerMonths - 1 } };
  evolveRegionQi(world, 1);
  assert.equal(regionQi(region, world), 2, '闲置满期回补，也不会越过底值');
});

test('封山才回补：静置满期回一寸，期间一采就重新计时', () => {
  const { world } = setup();
  const region = regionById('qingwu');
  world.regionQi = { qingwu: { qi: 1, pressure: 0, idle: 0 } };
  evolveRegionQi(world, REGION_QI_RULES.recoverPerMonths - 2);
  assert.equal(regionQi(region, world), 1, '还没满期，不回补');
  noteRegionHarvest(world, region, '凡品'); // 一采就断
  noteRegionHarvest(world, region, '凡品');
  evolveRegionQi(world, REGION_QI_RULES.recoverPerMonths * 2);
  assert.equal(regionQi(region, world), 2, '压力自消后重新计满，终于回了一寸');
  assert.ok(world.regionQiLog.length > 0, '枯与荣都进纪事');
  assert.match(world.regionQiLog[world.regionQiLog.length - 1].text, /复为|落为/);
});

test('灵气影响修炼：被采枯的地方涨得慢', () => {
  const player = newPlayerState();
  const rich = setup().world; // 底值 2
  const poor = setup().world;
  poor.regionQi = { qingwu: { qi: 1, pressure: 0, idle: 0 } };
  applyStateUpdates(player, rich, { cultivation: { delta: 10 } });
  const richGain = player.cultivation;
  const player2 = newPlayerState();
  applyStateUpdates(player2, poor, { cultivation: { delta: 10 } });
  assert.ok(richGain > player2.cultivation, `常态 ${richGain} 应高于被采枯的 ${player2.cultivation}`);
  assert.equal(qiCultMult(1), 0.9);
  assert.equal(qiCultMult(2), 0.95);
  assert.equal(qiCultMult(6), 1.15);
  assert.equal(regionCultMult(rich), 0.95);
  assert.equal(regionCultMult(poor), 0.9);
});

test('物价只随枯荣走：没被采过的区域价格与旧口径一致', () => {
  const fresh = setup().world;
  const worn = setup().world;
  worn.regionQi = { qingwu: { qi: 1, pressure: 0, idle: 0 } };
  const base = priceMultiplier('qingwu', '盛世', fresh);
  assert.equal(base, 0.9, '1.0 区域系数 × 0.9 盛世 × 1.0 灵气（无枯荣）');
  assert.ok(priceMultiplier('qingwu', '盛世', worn) > base, '采枯了要贵');
  assert.equal(qiPriceMult(3), 1);
});

test('灵气影响采集上限：采枯的地方出不了高货', () => {
  const region = regionById('wanyao'); // 底值灵气 4、危险 5
  const base = regionNodeCap(region, '盛世', 4);
  assert.ok(regionNodeCap(region, '盛世', 1) < base, '灵气掉到枯涸，上限下降');
  assert.equal(regionNodeCap(region, '末法时代', 1), 0, '末法又枯，连凡品都难');
});

test('切片写进当前灵气与本地地脉纪事', () => {
  const { player, world } = setup();
  world.regionQi = { qingwu: { qi: 1, pressure: 0, idle: 0 } };
  world.regionQiLog = [
    { regionId: 'dayan', region: '元武国', month: 3, text: '元武国灵脉被采薄了：灵气由丰沛落为寻常。' },
    { regionId: 'qingwu', region: '越国·建州', month: 9, text: '越国·建州灵脉被采薄了：灵气由稀薄落为枯涸。' },
  ];
  const slice = buildSlice(player, world);
  assert.match(slice, /灵气1（枯涸）/, '切片用当前灵气并带中文档位');
  assert.match(slice, /【地脉】/);
  assert.match(slice, /越国·建州灵脉被采薄了/, '只带本地纪事');
  assert.doesNotMatch(slice, /元武国灵脉/, '别把别处的地脉纪事搬进来');
  assert.equal(qiLabel(1), '枯涸');
  assert.equal(qiLabel(99), '灵涌');
});

test('旧档读入不判罚：没有枯荣字段照样走时间', () => {
  const world = newWorldState();
  world.date = { year: 3, month: 4, day: 10 };
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: true };
  const player = newPlayerState();
  delete world.regionQi;
  delete world.qiDays;
  advanceTime(world, player, 12);
  assert.equal(world.date.year, 4, '日期照常推进');
  assert.ok(player.lifespan < 100, '寿元照常流逝');
  assert.deepEqual(ensureWorldGeo(world), world.geo, '地理字段不被改动');
  assert.ok(Array.isArray(world.regionQiLog));
});

test('读档只补字段、不判罚也不凭空掉灵气', () => {
  const world = newWorldState();
  world.date = { year: 900, month: 1, day: 1 };
  ensureRegionQi(world);
  assert.deepEqual(world.regionQi, {}, '读档那一下不该有任何枯荣记录');
  assert.equal(regionQi(regionById('qingwu'), world), 2, '没被采过就是底值');
});

test('静态世界表不被污染，纪事有条数上限', () => {
  const { world } = setup();
  const region = regionById('qingwu');
  for (let i = 0; i < 200; i += 1) {
    noteRegionHarvest(world, region, '神品');
    evolveRegionQi(world, 1);
  }
  assert.equal(allRegions().find((r) => r.id === 'qingwu').qi, 2, '九域表底值不该被改写');
  assert.ok(world.regionQiLog.length <= REGION_QI_RULES.maxChronicle);
  for (const c of world.regionQiLog) {
    assert.equal(typeof c.text, 'string');
    assert.ok(c.text.length > 0);
    assert.ok(Number.isFinite(c.month));
  }
});
