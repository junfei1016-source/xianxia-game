// 地理层级与路网：界 → 大区 → 区域，以及"怎么走"（陆路／海路／古传送阵）。
// 原文：第 221 章（越国、元武同在一带陆上，天罗与风都是大国）；
// 第 364 章（韩立以古传送阵自越国到乱星海）；第 365/366 章（乱星海是海外群岛）；
// 第 1315 章（灵界只能飞升）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
} from '../public/game.js';
import {
  allRegions,
  regionById,
  macroOf,
  travelPlan,
  moveToRegion,
  buildSlice,
  GATES,
  MACROS,
} from '../public/world.js';

const setup = (region = 'qingwu', stones = 0) => {
  const player = newPlayerState();
  player.spiritStones = stones;
  const world = newWorldState();
  world.eraType = '盛世';
  world.geo = { regionId: region, sinceTurn: 0, migrated: false };
  world.date = { year: 2, month: 3, day: 1 };
  return { player, world };
};

test('层级：二十域分属五个大区（天南 9、乱星海 4、大晋 1、五龙海 1、灵界 5）', () => {
  const count = {};
  for (const r of allRegions()) {
    const m = macroOf(r).macro;
    count[m] = (count[m] || 0) + 1;
    assert.ok(MACROS[m], `${r.name} 归到了未定义的大区 ${m}`);
  }
  assert.deepEqual(count, { 天南: 9, 乱星海: 4, 大晋: 1, 五龙海: 1, 灵界: 5 });
  assert.equal(macroOf(regionById('qingwu')).macro, '天南');
  assert.equal(macroOf(regionById('hanyuan')).macro, '乱星海');
  assert.equal(macroOf(regionById('taiqing')).macro, '灵界');
});

test('天南内部走陆路，不花灵石', () => {
  const plan = travelPlan('qingwu', 'dayan');
  assert.equal(plan.mode, '陆路');
  assert.equal(plan.cost, 0);
  assert.ok(plan.days > 0);
  for (const id of ['luoxia', 'dayan', 'chisha', 'wanyao']) {
    const p = travelPlan('qingwu', id);
    assert.equal(p.mode, '陆路', `越国到 ${id} 应是陆路`);
    assert.equal(p.cost, 0);
  }
});

test('乱星海内部走海路', () => {
  for (const id of ['guixu', 'xingyun']) {
    const plan = travelPlan('hanyuan', id);
    assert.equal(plan.mode, '海路');
    assert.equal(plan.cost, 0);
    assert.ok(plan.days > 0);
  }
});

test('跨大区只有古传送阵：一日可达，但要 200 灵石', () => {
  const out = travelPlan('qingwu', 'hanyuan');
  const back = travelPlan('guixu', 'hanyuan');
  assert.equal(out.mode, '传送阵');
  assert.equal(out.days, 1);
  assert.equal(out.cost, 200);
  assert.ok(out.note.includes('古传送阵'));
  assert.equal(back.mode, '海路', '天星城与尾星岛同在外海，走海路');
  const backGate = travelPlan('hanyuan', 'qingwu');
  assert.equal(backGate.mode, '传送阵', '回建州也得靠阵');
  assert.equal(GATES.length, 3, '三道阵：建州↔外海、天星城↔大晋、大晋↔五龙海');
  // 没有阵的组合去不了
  assert.equal(travelPlan('dayan', 'guixu'), null, '元武到天星城隔海又无阵');
  assert.equal(travelPlan('chisha', 'xingyun'), null);
});

test('凡界与灵界互不相通：只能飞升（灵界内部另算）', () => {
  const ming = macroOf(regionById('qingwu')).macro;
  assert.equal(ming, '天南');
  for (const r of allRegions()) {
    const m = macroOf(r).macro;
    if (m === '灵界') {
      // 灵界自己的几处：走得通
      for (const other of allRegions()) {
        if (macroOf(other).macro !== '灵界' || other.id === r.id) continue;
        const plan = travelPlan(r.id, other.id);
        assert.ok(plan && plan.mode === '界内', `灵界内部 ${r.name}→${other.name} 应可行`);
      }
      // 但到凡界一律不行
      assert.equal(travelPlan(r.id, 'qingwu'), null, `${r.name} 不该有回凡界的路`);
    } else {
      assert.equal(travelPlan(r.id, 'taiqing'), null, `${r.name} 不该有去灵界的路`);
    }
  }
});

test('灵石不够：传送阵打不开，人还留在原地', () => {
  const { player, world } = setup('qingwu', 50);
  const note = applyStateUpdates(player, world, { travelTo: '乱星海·尾星岛' });
  assert.equal(world.geo.regionId, 'qingwu', '没走成');
  assert.match(note, /灵石/);
  assert.match(note, /走不了/);
  assert.equal(player.spiritStones, 50, '没扣钱');
});

test('灵石够：扣 200，一日到外海，提示里写明方式与花费', () => {
  const { player, world } = setup('qingwu', 260);
  const note = applyStateUpdates(player, world, { travelTo: '乱星海·尾星岛' });
  assert.equal(world.geo.regionId, 'hanyuan');
  assert.equal(player.spiritStones, 60);
  assert.match(note, /传送阵/);
  assert.match(note, /耗灵石 200/);
});

test('陆路照旧：不扣灵石，天数按路程表', () => {
  const { player, world } = setup('qingwu', 5);
  const note = applyStateUpdates(player, world, { travelTo: '元武国' });
  assert.equal(world.geo.regionId, 'dayan');
  assert.equal(player.spiritStones, 5, '陆路不花钱');
  assert.match(note, /陆路/);
});

test('切片把交通方式与花费讲清楚，并提醒灵界只能飞升', () => {
  const { player, world } = setup('qingwu');
  const slice = buildSlice(player, world);
  assert.match(slice, /陆路/);
  assert.match(slice, /另有传送阵：乱星海·尾星岛 1日 \/ 200灵石（古传送阵）/);
  assert.match(slice, /灵界无路，只能飞升/);
  assert.match(slice, /跨海须借传送阵/, '要提醒跨海得走阵');
});

test('moveToRegion 返回方式与花费，原地不动返回 null', () => {
  const world = setup('qingwu', 0).world;
  const moved = moveToRegion(world, 'luoxia');
  assert.equal(moved.mode, '陆路');
  assert.equal(moved.cost, 0);
  assert.equal(moveToRegion(world, 'luoxia'), null);
});
