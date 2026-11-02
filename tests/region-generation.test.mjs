import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newWorldState,
  newPlayerState,
  applyStateUpdates,
  validateStateOutput,
} from '../public/game.js';
import {
  addRegion,
  validateRegionProposal,
  travelDays,
  moveToRegion,
  buildSlice,
  allRegions,
  priceMultiplier,
  REGION_STANDARD,
} from '../public/world.js';

const good = () => ({
  name: '雾隐泽',
  terrain: '泽国水乡',
  qi: 3,
  danger: 3,
  products: ['灵品', '玄品'],
  links: [{ to: '青芜国', days: 5 }],
  desc: '终年大雾的泽国，散修在此避祸。',
});

test('标准本身：灵气 1~6、危险 1~5、路程 1~60、描述 ≤90 字', () => {
  assert.deepEqual(REGION_STANDARD.qi, [1, 6]);
  assert.deepEqual(REGION_STANDARD.danger, [1, 5]);
  assert.deepEqual(REGION_STANDARD.travel, [1, 60]);
  assert.equal(REGION_STANDARD.descLen, 90);
});

test('合法提案：通过并入库，来回两程都记上', () => {
  const world = newWorldState();
  const res = addRegion(world, good());
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('雾隐泽'));
  assert.equal(world.dynamicRegions.length, 1);
  assert.equal(travelDays('qingwu', res.region.id, world), 5);
  assert.equal(travelDays(res.region.id, 'qingwu', world), 5, '返程必须对称');
});

test('名字太短、重名都要拒', () => {
  const world = newWorldState();
  assert.equal(validateRegionProposal({ ...good(), name: '泽' }, world).ok, false);
  assert.equal(validateRegionProposal({ ...good(), name: '青芜国' }, world).ok, false);
});

test('灵气/危险越界要拒', () => {
  const world = newWorldState();
  assert.equal(validateRegionProposal({ ...good(), qi: 7 }, world).ok, false);
  assert.equal(validateRegionProposal({ ...good(), danger: 0 }, world).ok, false);
  assert.equal(validateRegionProposal({ ...good(), qi: 2.5 }, world).ok, false);
});

test('产出受地气约束：灵气 2·危险 1 出不了仙品', () => {
  const world = newWorldState();
  const res = validateRegionProposal({ ...good(), qi: 2, danger: 1, products: ['仙品'], links: [{ to: '青芜国', days: 5 }] }, world);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((x) => x.includes('出不了')));
});

test('神品要灵气 ≥5', () => {
  const world = newWorldState();
  const res = validateRegionProposal({ ...good(), qi: 4, danger: 5, products: ['神品'], links: [{ to: '青芜国', days: 5 }] }, world);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((x) => x.includes('神品')));
});

test('没有通路的地界不能入图', () => {
  const world = newWorldState();
  const res = validateRegionProposal({ ...good(), links: [] }, world);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((x) => x.includes('一条通往外界的路')));
});

test('路程越界或指向未知区域要拒', () => {
  const world = newWorldState();
  assert.equal(validateRegionProposal({ ...good(), links: [{ to: '青芜国', days: 0 }] }, world).ok, false);
  assert.equal(validateRegionProposal({ ...good(), links: [{ to: '青芜国', days: 61 }] }, world).ok, false);
  assert.equal(validateRegionProposal({ ...good(), links: [{ to: '不存在的地方', days: 5 }] }, world).ok, false);
});

test('新区域能走进去、切片能讲它、物价有系数', () => {
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  const res = addRegion(world, good());
  const moved = moveToRegion(world, res.region.id);
  assert.ok(moved);
  assert.equal(moved.days, 5);

  const slice = buildSlice(newPlayerState(), world);
  assert.ok(slice.includes('雾隐泽'));
  assert.ok(slice.includes('可达'));

  assert.ok(priceMultiplier(res.region.id, '', world) > 0);
  assert.ok(allRegions(world).some((r) => r.name === '雾隐泽'));
});

test('动态区域有上限，不能无限扩图', () => {
  const world = newWorldState();
  world.dynamicRegions = Array.from({ length: REGION_STANDARD.maxDynamic }, (_, i) => ({ id: `x${i}`, name: `旧域${i}` }));
  const res = validateRegionProposal(good(), world);
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((x) => x.includes('最多开辟')));
});

test('校验层接受 newRegion，字段缺失的要丢', () => {
  const { out } = validateStateOutput({
    newRegion: { ...good(), id: 'wuyin' },
  });
  assert.equal(out.newRegion.name, '雾隐泽');
  assert.equal(out.newRegion.links.length, 1);

  const { out: bad } = validateStateOutput({ newRegion: { name: '雾隐泽' } });
  assert.ok(bad.newRegion === undefined || bad.newRegion === null || !bad.newRegion.qi);
});

test('回合结算：合法新域入图并给回执', () => {
  const player = newPlayerState();
  const world = newWorldState();
  const note = applyStateUpdates(player, world, { newRegion: good() });
  assert.ok(note.includes('【新域】'));
  assert.equal(world.dynamicRegions.length, 1);
});

test('回合结算：不合标准的新域被拒，世界不脏', () => {
  const player = newPlayerState();
  const world = newWorldState();
  const report = {};
  applyStateUpdates(player, world, {
    newRegion: { name: '仙府', terrain: '云海', qi: 9, danger: 9, products: ['神品'], links: [] },
  }, report);
  assert.equal((world.dynamicRegions || []).length, 0);
  assert.ok(report.issues.some((i) => i.code === 'region_invalid'));
});
