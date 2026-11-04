import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIALS,
  MATERIAL_TIERS,
  MATERIAL_KINDS,
  tierForYear,
  materialByName,
  materialTier,
  materialPrice,
  materialsInRegion,
  materialNamesInRegion,
  materialBrewBonus,
} from '../public/materials.js';
import { newPlayerState, newWorldState, applyStateUpdates } from '../public/game.js';
import { buildSlice } from '../public/world.js';

const setup = () => {
  const player = newPlayerState();
  const world = newWorldState();
  world.date = { year: 1, month: 1, day: 1 };
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  return { player, world };
};

test('年份定阶：十年凡、百年灵、五百年玄、千年仙、万年神', () => {
  assert.equal(tierForYear(10), '凡品');
  assert.equal(tierForYear(120), '灵品');
  assert.equal(tierForYear(500), '玄品');
  assert.equal(tierForYear(1000), '仙品');
  assert.equal(tierForYear(10000), '神品');
  assert.ok(MATERIAL_TIERS.神品.price > MATERIAL_TIERS.仙品.price);
});

test('名录够用：三十种以上，每件都有品类、五行与产地', () => {
  assert.ok(MATERIALS.length >= 35, `实际 ${MATERIALS.length}`);
  for (const m of MATERIALS) {
    assert.ok(m.name);
    assert.ok(MATERIAL_KINDS[m.kind], `${m.name} 品类「${m.kind}」不认识`);
    assert.ok(m.element, `${m.name} 缺五行`);
    assert.ok(Array.isArray(m.regions) && m.regions.length, `${m.name} 缺产地`);
    assert.ok(materialTier(m), `${m.name} 无品阶`);
  }
});

test('药龄与矿石各按各的：血参按年份，星砂按录入阶位', () => {
  assert.equal(materialTier(materialByName('千年血参')), '仙品');
  assert.equal(materialTier(materialByName('星砂')), '玄品');
  assert.equal(materialTier(materialByName('陨铁')), '仙品');
  assert.equal(materialTier(materialByName('妖丹')), '灵品');
});

test('带年份前缀的写法也能认：百年回春草 → 回春草', () => {
  const m = materialByName('百年回春草');
  assert.ok(m);
  assert.equal(m.name, '回春草');
  assert.equal(materialTier(m), '灵品');
});

test('价目随品阶递增', () => {
  assert.ok(materialPrice(materialByName('万年灵乳')) > materialPrice(materialByName('百年灵草')));
  assert.ok(materialPrice(materialByName('百年灵草')) > materialPrice(materialByName('灵草')));
});

test('产地：乱星海·尾星岛出寒铁与灵乳，奇渊岛出星砂与陨铁', () => {
  const han = materialsInRegion('hanyuan').map((m) => m.name);
  assert.ok(han.includes('寒铁'));
  assert.ok(han.includes('万年灵乳'));
  const xing = materialsInRegion('xingyun').map((m) => m.name);
  assert.ok(xing.includes('星砂'));
  assert.ok(xing.includes('陨铁'));
  assert.equal(materialNamesInRegion('qingwu', 2).length, 2);
});

test('炼丹加料：年份越足越稳，封顶 +15%', () => {
  assert.equal(materialBrewBonus(['灵草']), 0);
  assert.ok(materialBrewBonus(['千年血参']) > 0);
  assert.equal(materialBrewBonus(['万年灵乳', '万年灵乳', '万年灵乳', '万年灵乳', '万年灵乳']), 0.15);
});

test('只认年份前缀，不认任意子串：玄铁甲是衣物，不是玄铁', () => {
  assert.equal(materialByName('玄铁甲'), null);
  assert.equal(materialByName('精铁剑'), null);
  assert.equal(materialByName('玄铁'), materialByName('玄铁'));
});

test('收进背包：材料只认名字，品类与年份由表定', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    itemChanges: [{ name: '星砂', delta: 2, kind: '材料', grade: '天阶', rarity: '神品' }],
  });
  const it = world.inventory.find((x) => x.name === '星砂');
  assert.equal(it.kind, '材料');
  assert.equal(it.matTier, '玄品');
  assert.equal(it.element, '金');
  assert.equal(it.matKind, '矿石');
});

test('世界切片带「可采」：本地能采什么，写清楚', () => {
  const { player, world } = setup();
  const slice = buildSlice(player, world);
  assert.ok(slice.includes('可采：'));
  assert.ok(slice.includes('灵草'));
  assert.ok(slice.length < 400);
});

test('毒物有标记：阴煞、生魂、蚀骨花', () => {
  for (const name of ['阴煞之气', '生魂', '蚀骨花', '血煞石']) {
    assert.equal(materialByName(name).toxic, true, `${name} 应标为毒物`);
  }
  assert.ok(!materialByName('灵草').toxic);
});
