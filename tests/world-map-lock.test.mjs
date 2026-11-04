// 开局定图：一局的地图在开头钉死，中途不许再长新地界。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
} from '../public/game.js';
import {
  lockWorldMap,
  worldMapOf,
  allRegions,
  regionById,
  regionByName,
  travelDays,
  priceMultiplier,
  regionQi,
  addRegion,
  ensureWorldGeo,
} from '../public/world.js';

const fresh = () => {
  const world = newWorldState();
  world.eraType = '盛世';
  return world;
};

test('开局定图：把九域钉进存档，模块级世界表不动', () => {
  const world = fresh();
  assert.equal(worldMapOf(world), null, '新档一开始没有地图表');
  const map = lockWorldMap(world);
  assert.ok(map && Array.isArray(map.regions));
  assert.equal(map.regions.length, allRegions().length, '默认地图就是九域');
  assert.ok(map.regions.some((r) => r.id === 'qingwu'));
  assert.ok(Number.isFinite(map.regions[0].qi), '区域数据要完整复制');
  // 改了存档里的地图，不该影响模块常量
  const before = regionById('qingwu').qi;
  map.regions.find((r) => r.id === 'qingwu').qi = 6;
  assert.equal(regionById('qingwu').qi, before, '模块表的底值不该被改写');
  assert.equal(regionQi(regionById('qingwu', world), world), 6, '局内以存档地图为准');
});

test('定图幂等：再钉一次不会覆盖已有地图', () => {
  const world = fresh();
  lockWorldMap(world);
  world.map.regions.find((r) => r.id === 'dayan').danger = 5;
  const snap = JSON.stringify(world.map);
  lockWorldMap(world);
  assert.equal(JSON.stringify(world.map), snap, '第二次调用必须原样返回');
});

test('定图之后不能再开辟新域', () => {
  const world = fresh();
  lockWorldMap(world);
  const res = addRegion(world, {
    name: '新荒原', terrain: '戈壁', qi: 3, danger: 3,
    products: ['灵品'], desc: '测试用', links: [{ to: '越国·建州', days: 5 }],
  });
  assert.equal(res.ok, false);
  assert.match((res.issues || []).join(''), /开局定死/);
  assert.equal(worldMapOf(world).regions.length, 9, '地图没被改动');
});

test('模型再提 newRegion 会被拒并记进诊断', () => {
  const world = fresh();
  const player = newPlayerState();
  lockWorldMap(world);
  applyStateUpdates(player, world, {
    newRegion: { name: '新荒原', terrain: '戈壁', qi: 3, danger: 3, products: ['灵品'], desc: '测试', links: [{ to: '越国·建州', days: 5 }] },
  });
  assert.equal(worldMapOf(world).regions.length, 9);
  const logged = JSON.stringify(world.validationLog || []);
  assert.match(logged, /开局定死|新域不合标准/, '应留下诊断');
});

test('旧档迁移：已有的动态区域与路程一起并进地图', () => {
  const world = fresh();
  world.dynamicRegions = [{ id: 'dyn_test', name: '旧游之地', terrain: '山谷', qi: 3, danger: 2, products: ['灵品'], travel_days: { qingwu: 6 }, desc: '旧档里开出来的', dynamic: true }];
  world.dynamicTravel = { 'dyn_test|qingwu': 6, 'qingwu|dyn_test': 6 };
  const map = lockWorldMap(world);
  assert.equal(map.regions.length, 10, '九域 + 旧档新域');
  assert.ok(map.regions.some((r) => r.id === 'dyn_test'));
  assert.equal(map.travel['dyn_test|qingwu'], 6, '动态路程要保留');
  assert.equal(regionByName('旧游之地', world).id, 'dyn_test', '名字还能查到');
  assert.equal(travelDays('dyn_test', 'qingwu', world), 6, '路程按地图算');
});

test('地图定死之后，路程与物价都只认存档那份', () => {
  const world = fresh();
  lockWorldMap(world);
  const qingwu = world.map.regions.find((r) => r.id === 'qingwu');
  const oldDays = travelDays('qingwu', 'dayan', world);
  qingwu.travel_days.dayan = 99;
  assert.equal(travelDays('qingwu', 'dayan', world), 99, '地图改了，路程跟着改');
  qingwu.travel_days.dayan = oldDays;

  const basePrice = priceMultiplier('chisha', '盛世', world);
  world.map.regions.find((r) => r.id === 'chisha').qi = 1;
  assert.ok(priceMultiplier('chisha', '盛世', world) >= basePrice, '灵气枯了不会更便宜');
});

test('没有地图表的旧世界仍按老路走（不破坏兼容）', () => {
  const world = fresh();
  assert.equal(worldMapOf(world), null);
  assert.equal(regionById('luoxia', world).name, '黄枫谷坊市');
  assert.ok(travelDays('qingwu', 'luoxia', world) > 0);
  assert.equal(allRegions(world).length, 9);
});

test('开局定图与开局区域不冲突：ensureWorldGeo 仍能给起始地', () => {
  const world = fresh();
  lockWorldMap(world);
  const geo = ensureWorldGeo(world);
  assert.ok(geo && regionById(geo.regionId, world), '起始区域必须在定死的地图里');
  const again = ensureWorldGeo(world);
  assert.deepEqual(again, geo, '再调一次不变');
});
