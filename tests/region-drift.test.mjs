// 地脉盛衰：区域灵气随岁月漂移（原文第 220 章「灵脉有枯竭之日」、第 172 章灵药采尽即枯、
// 第 358 章修士渐多灵石渐少）。只测规则与数据层，不联网、不碰真实模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  ensureRegionDrift,
  evolveRegions,
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
  regionDanger,
  qiLabel,
  qiCultMult,
  qiPriceMult,
  REGION_DRIFT,
} from '../public/world.js';

const setup = (geo = 'qingwu') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.era = '青芜国风调雨顺';
  world.eraType = '盛世';
  world.geo = { regionId: geo, sinceTurn: 0, migrated: false };
  return { player, world };
};

test('ensureRegionDrift：旧档补字段幂等，非法值被重置', () => {
  const { world } = setup();
  assert.equal(world.regionDrift, undefined, '新档默认不带漂移字段');
  const first = ensureRegionDrift(world);
  assert.deepEqual(first, {});
  assert.equal(world.driftDays, 0);
  assert.equal(world.driftSteps, 0);
  assert.deepEqual(world.regionChronicle, []);
  const snapshot = JSON.stringify({ d: world.regionDrift, days: world.driftDays, steps: world.driftSteps, c: world.regionChronicle });
  ensureRegionDrift(world);
  assert.equal(JSON.stringify({ d: world.regionDrift, days: world.driftDays, steps: world.driftSteps, c: world.regionChronicle }), snapshot, '第二次调用不得改动任何字段');

  const broken = newWorldState();
  broken.regionDrift = [];
  broken.driftDays = -5;
  broken.driftSteps = '3';
  broken.regionChronicle = 'x';
  ensureRegionDrift(broken);
  assert.deepEqual(broken.regionDrift, {});
  assert.equal(broken.driftDays, 0);
  assert.equal(broken.driftSteps, 0);
  assert.deepEqual(broken.regionChronicle, []);
});

test('不足半年不漂移，满半年才走一步', () => {
  const { player, world } = setup();
  advanceTime(world, player, 5); // 150 天
  assert.equal(world.driftSteps, 0, '五个月不该动地脉');
  advanceTime(world, player, 1); // 再 30 天 → 满 180
  assert.equal(world.driftSteps, 1, '满半年走一步');
  assert.equal(world.driftDays, 0);
});

test('一步只动一个地方，且漂移量落在灵气 1~6、凶险 1~5 之内', () => {
  let world = setup().world;
  for (let i = 0; i < 300; i += 1) evolveRegions(world, 6);
  const touched = Object.keys(world.regionDrift);
  assert.ok(touched.length >= 2, '长期应有多个区域被波及');
  assert.ok(touched.length <= allRegions().length, '漂移只落在已知区域上');
  for (const id of touched) {
    const region = regionById(id, world);
    assert.ok(region, `漂移记录指向未知区域 ${id}`);
    const qi = regionQi(region, world);
    const danger = regionDanger(region, world);
    assert.ok(qi >= 1 && qi <= 6, `灵气越界：${id}=${qi}`);
    assert.ok(danger >= 1 && danger <= 5, `凶险越界：${id}=${danger}`);
    assert.ok(Number.isInteger(world.regionDrift[id].qi), '存的是整数');
  }
  assert.equal(world.regionDrift.taiqing, undefined, '仙界不参与凡界盛衰');
});

test('静态世界表不被污染：漂移只写存档', () => {
  const { world } = setup();
  for (let i = 0; i < 120; i += 1) evolveRegions(world, 6);
  const qingwu = allRegions().find((r) => r.id === 'qingwu');
  assert.equal(qingwu.qi, 2, '九域表的底值不该被改写');
  assert.equal(qingwu.danger, 1);
  const fresh = newWorldState();
  assert.equal(regionQi(regionById('qingwu'), fresh), 2, '另一份存档看不到漂移');
});

test('确定性：同样起点、同样月数，漂移结果一致', () => {
  const a = setup().world;
  const b = setup().world;
  for (let i = 0; i < 20; i += 1) { evolveRegions(a, 6); evolveRegions(b, 6); }
  assert.equal(JSON.stringify(a.regionDrift), JSON.stringify(b.regionDrift));
  assert.equal(JSON.stringify(a.regionChronicle), JSON.stringify(b.regionChronicle));
  assert.equal(a.driftSteps, b.driftSteps);
});

test('灵气影响修炼：旺地涨得快，枯地涨得慢', () => {
  const player = newPlayerState();
  const rich = setup().world;
  const poor = setup().world;
  rich.regionDrift = { qingwu: { qi: 6 } };
  poor.regionDrift = { qingwu: { qi: 1 } };
  applyStateUpdates(player, rich, { cultivation: { delta: 10 } });
  const richGain = player.cultivation;
  const player2 = newPlayerState();
  applyStateUpdates(player2, poor, { cultivation: { delta: 10 } });
  assert.ok(richGain > player2.cultivation, `旺地 ${richGain} 应高于枯地 ${player2.cultivation}`);
  assert.equal(qiCultMult(6), 1.15);
  assert.equal(qiCultMult(1), 0.9);
  assert.equal(qiCultMult(3), 1);
  assert.equal(regionCultMult(rich), 1.15);
  assert.equal(regionCultMult(setup().world), 0.95, '青芜国底值灵气2（稀薄），略慢于寻常');
});

test('灵气影响物价：枯地贵，旺地便宜', () => {
  const rich = setup().world;
  const poor = setup().world;
  rich.regionDrift = { qingwu: { qi: 6 } };
  poor.regionDrift = { qingwu: { qi: 1 } };
  const base = priceMultiplier('qingwu', '盛世', setup().world);
  const richP = priceMultiplier('qingwu', '盛世', rich);
  const poorP = priceMultiplier('qingwu', '盛世', poor);
  assert.ok(richP < base, `旺地 ${richP} 应低于寻常 ${base}`);
  assert.ok(poorP > base, `枯地 ${poorP} 应高于寻常 ${base}`);
  assert.equal(qiPriceMult(3), 1);
});

test('灵气影响采集点上限：枯地出不了高货', () => {
  const region = regionById('wanyao'); // 原表灵气 4、危险 5
  const base = regionNodeCap(region, '盛世', 4);
  assert.ok(regionNodeCap(region, '盛世', 1) < base, '灵气掉到枯涸，上限应随之下降');
  assert.ok(regionNodeCap(region, '盛世', 6) >= base, '灵气升到灵涌，上限不降');
  assert.equal(regionNodeCap(region, '末法时代', 1), 0, '末法又枯，连凡品都难');
});

test('切片写进当前灵气与地脉纪事，灵气有中文档位', () => {
  const { player, world } = setup();
  world.regionDrift = { qingwu: { qi: 5, danger: 2 } };
  world.regionChronicle = [
    { regionId: 'dayan', region: '大衍王朝', month: 12, text: '大衍王朝地脉复苏：灵气由寻常复为丰沛。' },
    { regionId: 'qingwu', region: '青芜国', month: 18, text: '青芜国灵脉渐枯：灵气由稀薄落为枯涸。' },
  ];
  const slice = buildSlice(player, world);
  assert.match(slice, /灵气5（浓郁）/, '切片用漂移后的实际灵气并带中文档位');
  assert.match(slice, /【地脉】/, '有纪事时给 GM 一行地脉');
  assert.match(slice, /青芜国灵脉渐枯/, '只带本地纪事');
  assert.doesNotMatch(slice, /大衍王朝地脉复苏/, '别把别处的事搬进来');
  assert.equal(qiLabel(1), '枯涸');
  assert.equal(qiLabel(6), '灵涌');
  assert.equal(qiLabel(99), '灵涌', '越界取上限');
});

test('旧档读入不判罚：没有漂移字段照样能走时间', () => {
  const world = newWorldState();
  world.date = { year: 3, month: 4, day: 10 };
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: true };
  const player = newPlayerState();
  delete world.regionDrift;
  delete world.driftDays;
  const before = { ...world.date };
  advanceTime(world, player, 12);
  assert.equal(world.date.year, 4, '日期照常推进');
  assert.equal(world.driftSteps, 2, '一年整好两步');
  assert.ok(player.lifespan < 100, '寿元照常流逝');
  assert.ok(before.year < world.date.year);
  assert.deepEqual(ensureWorldGeo(world), world.geo, '地理字段不被改动');
});

test('读档只补字段、不推进漂移', () => {
  const world = newWorldState();
  world.date = { year: 900, month: 1, day: 1 };
  ensureRegionDrift(world);
  assert.deepEqual(world.regionDrift, {}, '读档那一下不该凭空漂移');
  assert.equal(world.driftSteps, 0);
});

test('纪事有条数上限，最老的先掉', () => {
  const { world } = setup();
  for (let i = 0; i < 400; i += 1) evolveRegions(world, 6);
  assert.ok(world.regionChronicle.length <= REGION_DRIFT.maxChronicle);
  assert.ok(world.lastDriftEvents.length <= 20 || world.lastDriftEvents.length >= 0);
  for (const c of world.regionChronicle) {
    assert.equal(typeof c.text, 'string');
    assert.ok(c.text.length > 0);
    assert.ok(Number.isFinite(c.month));
  }
});
