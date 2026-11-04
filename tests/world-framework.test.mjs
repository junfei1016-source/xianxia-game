import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  buildWorldContext,
  buildGMMessages,
  buildGMCombinedMessages,
} from '../public/game.js';
import {
  allRegions,
  allFactions,
  allRelations,
  regionById,
  factionsIn,
  travelDays,
  priceOf,
  priceMultiplier,
  pickStarter,
  ensureWorldGeo,
  moveToRegion,
  buildSlice,
  startingFactions,
} from '../public/world.js';

const setup = (geo = 'qingwu') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.era = '越国·建州风调雨顺';
  world.eraType = '盛世';
  world.geo = { regionId: geo, sinceTurn: 0, migrated: false };
  return { player, world };
};

test('世界数据自洽：引用完整、每个区域都有本地势力', () => {
  const ids = new Set(allRegions().map((r) => r.id));
  for (const f of allFactions()) {
    assert.ok(ids.has(f.seat), `势力 ${f.id} 的驻地不存在`);
  }
  for (const r of allRelations()) {
    assert.ok(allFactions().some((f) => f.id === r.a), `关系端点 ${r.a} 不存在`);
    assert.ok(allFactions().some((f) => f.id === r.b), `关系端点 ${r.b} 不存在`);
  }
  for (const r of allRegions()) {
    assert.ok(factionsIn(r.id).length >= 2, `区域 ${r.id} 势力不足`);
    assert.ok(factionsIn(r.id).some((f) => f.tier <= 2), `区域 ${r.id} 缺当家人`);
  }
});

test('路程双向对称，跨区必须中转', () => {
  for (const r of allRegions()) {
    for (const [to, days] of Object.entries(r.travel_days || {})) {
      assert.equal(travelDays(to, r.id), days, `${r.id}<->${to} 不对称`);
      assert.ok(days > 0);
    }
    // 不能凭空瞬移：同区 0 日，未知区域 null
    assert.equal(travelDays(r.id, r.id), 0);
    assert.equal(travelDays(r.id, 'nowhere'), null);
  }
});

test('物价系数随区域与大势变化，且落在品阶带内', () => {
  const base = priceOf('灵品', 'qingwu', '盛世');
  const blackMarket = priceOf('灵品', 'chisha', '盛世');
  assert.ok(blackMarket.min > base.min, '黑市应更贵');
  assert.equal(priceMultiplier('chisha', '乱世'), Math.round(2.0 * 1.2 * 100) / 100);
  for (const rarity of ['凡品', '灵品', '玄品', '仙品', '神品']) {
    const p = priceOf(rarity, 'luoxia', '盛世');
    assert.ok(p.min > 0 && p.max >= p.min, `${rarity} 价格带无效`);
  }
  assert.equal(priceOf('不存在', 'qingwu', '盛世'), null);
});

test('开局区域只能落在凡界，且权重偏向新手区', () => {
  const picked = new Set();
  for (let i = 0; i < 200; i++) picked.add(pickStarter(() => i / 200));
  assert.ok(picked.has('qingwu'));
  assert.ok(!picked.has('hanyuan'), '高风险海域不应作为开局');
  for (const id of picked) assert.ok(regionById(id));
});

test('ensureWorldGeo 幂等：重复调用不改变任何字段', () => {
  const world = newWorldState();
  const first = ensureWorldGeo(world);
  const snapshot = JSON.stringify(world);
  const second = ensureWorldGeo(world);
  assert.equal(first, second, '第二次应返回同一个 geo 对象');
  assert.equal(JSON.stringify(world), snapshot, '重复迁移不得改动存档');
  assert.ok(regionById(world.geo.regionId));
});

test('旧档按起始地名匹配区域，不匹配则给一个合法默认', () => {
  const named = newWorldState();
  named.startingLocation = { name: '黄枫谷坊市', desc: '' };
  ensureWorldGeo(named);
  assert.equal(named.geo.regionId, 'luoxia');

  const unknown = newWorldState();
  unknown.startingLocation = { name: '不存在之地', desc: '' };
  ensureWorldGeo(unknown);
  assert.ok(regionById(unknown.geo.regionId));
});

test('moveToRegion 返回真实天数并切换区域', () => {
  const { world } = setup('qingwu');
  const moved = moveToRegion(world, 'luoxia');
  assert.equal(moved.days, 2, '越国·建州到黄枫谷坊市：同在建州，2 日');
  assert.equal(world.geo.regionId, 'luoxia');
  assert.equal(moveToRegion(world, 'luoxia'), null, '原地不动不产生移动');
  assert.equal(moveToRegion(world, '不存在'), null);
});

test('切片只讲当前区域，短且带铁律', () => {
  const { player, world } = setup('chisha');
  const slice = buildSlice(player, world);
  assert.ok(slice.includes('天罗国'));
  assert.ok(slice.includes('物价×'));
  assert.ok(slice.includes('【铁律】'));
  assert.ok(!slice.includes('乱星海·尾星岛（'), '不应展开别的区域描述');
  assert.ok(slice.length < 400, `切片过长：${slice.length}`);

  const noGeo = newWorldState();
  assert.equal(buildSlice(player, noGeo), '', '没有区域坐标时不应注入切片');
});

test('高境界回到安全区会收到“此地已压不住你”的提示', () => {
  const { player, world } = setup('qingwu');
  player.realm = '元婴中期';
  assert.ok(buildSlice(player, world).includes('此地已压不住你'));
  player.realm = '炼气中期';
  assert.ok(!buildSlice(player, world).includes('此地已压不住你'));
});

test('行路：提取器给 travelTo 时，耗时由路程表决定，模型自报时间被覆盖', () => {
  const { player, world } = setup('qingwu');
  const report = {};
  const note = applyStateUpdates(player, world, { travelTo: '黄枫谷坊市', timeMonths: 3 }, report);
  assert.equal(world.geo.regionId, 'luoxia');
  assert.ok(note.includes('行路'));
  // 越国·建州→黄枫谷坊市 2 日 ≈ 0.067 月，而不是模型自报的 3 月
  assert.equal(report.out.timeMonths, 0.067);
  advanceTime(world, player, report.out.timeMonths);
  assert.deepEqual(world.date, { year: 1, month: 1, day: 3 });
});

test('行路：未知区域名被忽略，时间保持原样且不落错误区域', () => {
  const { player, world } = setup('qingwu');
  applyStateUpdates(player, world, { travelTo: '不存在的城', timeMonths: 1 });
  assert.equal(world.geo.regionId, 'qingwu');
});

test('提取器输出里的 travelTo 通过校验并进入结算', () => {
  const { player, world } = setup('qingwu');
  const report = {};
  applyStateUpdates(player, world, { travelTo: '元武国' }, report);
  assert.equal(report.out.travelTo, undefined, 'travelTo 只用于结算，不落到前端');
  assert.equal(world.geo.regionId, 'dayan');
});

test('回合提示词带世界切片，且切片在快照里也是同一份', () => {
  const { player, world } = setup('luoxia');
  const messages = buildGMMessages(player, world, [], '去黄枫谷坊市转转');
  const all = messages.map((m) => m.content).join('\n');
  assert.ok(all.includes('【世界切片】'));
  assert.ok(all.includes('黄枫谷坊市'));
  const ctx = buildWorldContext(world, player);
  assert.equal(ctx.region.name, '黄枫谷坊市');
  assert.ok(ctx.worldSlice.includes('物价×'));

  const fast = buildGMCombinedMessages(player, world, [], '去黄枫谷坊市转转');
  assert.ok(fast.map((m) => m.content).join('\n').includes('travelTo'));
});

test('开局只登场一部分势力：当家人必在，其余随机，不把名单摊开', () => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const list = startingFactions('qingwu', () => (i % 10) / 10);
    assert.ok(list.length >= 2 && list.length <= 3, '开局只该有 2~3 家');
    assert.ok(list.some((f) => f.name === '拾云门'), '当家人（二级）必须在场');
    for (const f of list) {
      assert.ok(f.name && f.alignment && f.tier);
      assert.equal(f.seeded, true);
      seen.add(f.name);
    }
  }
  const localTotal = factionsIn('qingwu').length;
  assert.ok(seen.size > 3, '多次开局应见到不同组合');
  assert.ok(seen.size <= localTotal);
});

test('开局抽取不会把自己抽重，也不会漏掉当家人', () => {
  const list = startingFactions('dayan', () => 0.42);
  const names = list.map((f) => f.name);
  assert.equal(new Set(names).size, names.length, '同一份名单不能重名');
  assert.ok(names.includes('镇魔司'), '一级当家人必须在场');
});

test('切片只列已打过交道的势力，其余只报个数', () => {
  const { player, world } = setup('qingwu');
  world.factions = startingFactions('qingwu', () => 0);
  const slice = buildSlice(player, world);
  assert.ok(slice.includes('已知势力'));
  for (const f of world.factions) assert.ok(slice.includes(f.name));
  assert.ok(slice.includes('未与之打过交道'), '没登场的势力不应逐一点名');
  // 不在已知名单里的势力，切片里不应出现其名字
  const unknown = factionsIn('qingwu').filter((f) => !world.factions.some((k) => k.name === f.name));
  for (const f of unknown) assert.ok(!slice.includes(f.name), `${f.name} 不该出现在切片里`);
});
