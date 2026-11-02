import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allRegions,
  allFactions,
  factionsIn,
  travelDays,
  priceMultiplier,
  buildSlice,
  regionById,
} from '../public/world.js';
import { isBlackMarket, newPlayerState, newWorldState } from '../public/game.js';

test('地图完整：九域二十家，每域都有本地势力与当家人', () => {
  assert.equal(allRegions().length, 9);
  assert.equal(allFactions().length, 20);
  for (const r of allRegions()) {
    const local = factionsIn(r.id);
    assert.ok(local.length >= 2, `${r.id} 势力不足`);
    assert.ok(local.some((f) => f.tier <= 2), `${r.id} 缺当家人`);
  }
  for (const id of ['guixu', 'wanyao', 'xingyun', 'taiqing']) {
    assert.ok(regionById(id), `缺少区域 ${id}`);
  }
});

test('凡界四通八达：归墟、万妖岭、星陨荒原都能走到', () => {
  for (const id of ['guixu', 'wanyao', 'xingyun']) {
    const days = travelDays('qingwu', id);
    assert.ok(Number.isFinite(days) && days > 0, `青芜到 ${id} 应可通行`);
  }
});

test('太清仙域不与凡界连通：只能飞升', () => {
  const taiqing = regionById('taiqing');
  assert.equal(Object.keys(taiqing.travel_days || {}).length, 0);
  assert.equal(travelDays('qingwu', 'taiqing'), null);
  assert.equal(travelDays('taiqing', 'qingwu'), null);
  // 但仙域自己有两家势力
  assert.equal(factionsIn('taiqing').length, 2);
});

test('除仙域外，每个区域都至少有一条对外道路', () => {
  for (const r of allRegions()) {
    if (r.id === 'taiqing') continue;
    assert.ok(Object.keys(r.travel_days || {}).length > 0, `${r.id} 无路可走`);
  }
});

test('黑市只有赤沙与星陨：危险度 5 的寒渊海不算', () => {
  const world = (id) => { const w = newWorldState(); w.geo = { regionId: id, sinceTurn: 0, migrated: false }; return w; };
  assert.equal(isBlackMarket(world('chisha')), true);
  assert.equal(isBlackMarket(world('xingyun')), true);
  assert.equal(isBlackMarket(world('hanyuan')), false, '寒渊海危险但不能当黑市');
  assert.equal(isBlackMarket(world('qingwu')), false);
});

test('物价系数覆盖新区域，仙界最贵', () => {
  assert.equal(priceMultiplier('taiqing'), 3);
  assert.equal(priceMultiplier('chisha'), 2);
  assert.ok(priceMultiplier('guixu') > 1);
  assert.ok(priceMultiplier('wanyao') > 1);
  assert.ok(priceMultiplier('xingyun') > 1);
});

test('星陨荒原的切片能正确讲当地势力与出路', () => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'xingyun', sinceTurn: 0, migrated: false };
  const slice = buildSlice(player, world);
  assert.ok(slice.includes('星陨荒原'));
  assert.ok(slice.includes('可达'));
  assert.ok(slice.length < 420);
});

test('仙域的切片不列任何道路', () => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'taiqing', sinceTurn: 0, migrated: false };
  const slice = buildSlice(player, world);
  assert.ok(slice.includes('太清仙域'));
  assert.ok(!slice.includes('可达：'), '仙界无路，不该写可达');
});
