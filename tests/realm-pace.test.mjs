import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  buildGMMessages,
  yearsInRealm,
  minYearsFor,
  REALM_MIN_YEARS,
} from '../public/game.js';

const setup = (year = 1) => {
  const player = newPlayerState();
  const world = newWorldState();
  world.date = { year, month: 1, day: 1 };
  world.realmSince = { year: 1, month: 1, day: 1 };
  return { player, world };
};

test('下限年限表：随境界递增，且与原著的"百年"量级一致', () => {
  assert.equal(minYearsFor('凡人'), 3);
  assert.equal(minYearsFor('炼气中期'), 8);
  assert.equal(minYearsFor('筑基后期'), 60);
  assert.equal(minYearsFor('金丹初期'), 100);
  assert.equal(minYearsFor('元婴初期'), 200);
  assert.ok(REALM_MIN_YEARS.大乘 >= REALM_MIN_YEARS.合体);
});

test('本境年数按 360 天/年算，旧档没记录返回 null', () => {
  const { player, world } = setup(4);
  assert.equal(yearsInRealm(world, player), 3);
  delete world.realmSince;
  assert.equal(yearsInRealm(world, player), null);
});

test('小境界不受年限限制：当年就能连破', () => {
  const { player, world } = setup(1);
  player.realm = '炼气初期';
  const report = {};
  applyStateUpdates(player, world, { realmChange: '炼气中期' }, report);
  assert.equal(player.realm, '炼气中期');
  assert.ok(!report.issues.some((i) => i.code === 'breakthrough_too_soon'));
});

test('大境界年限不足：突破被拒，叙事保留、境界不动', () => {
  const { player, world } = setup(1); // 第 1 年
  const report = {};
  applyStateUpdates(player, world, { realmChange: '炼气初期', narrative: '你突破了' }, report);
  assert.equal(player.realm, '凡人');
  assert.ok(report.issues.some((i) => i.code === 'breakthrough_too_soon'));
  assert.equal(report.out.realmChange, undefined, '被拒的提案不应留给前端');
});

test('年限足够：大境界突破生效，并把"入本境日期"重置', () => {
  const { player, world } = setup(4); // 凡人满 3 年
  applyStateUpdates(player, world, { realmChange: '炼气初期' });
  assert.equal(player.realm, '炼气初期');
  assert.equal(player.cultivation, 0);
  assert.deepEqual(world.realmSince, { year: 4, month: 1, day: 1 });

  // 紧接着想再跨大境界（炼气→筑基，需 8 年）应被拒
  const report = {};
  applyStateUpdates(player, world, { realmChange: '筑基初期' }, report);
  assert.equal(player.realm, '炼气初期');
  assert.ok(report.issues.some((i) => i.code === 'breakthrough_too_soon'));
});

test('筑基→结丹要熬满 60 年：第 60 年才放行', () => {
  const early = setup(61); // 第 61 年，距第 1 年 60 年
  early.player.realm = '筑基后期';
  applyStateUpdates(early.player, early.world, { realmChange: '金丹初期' });
  assert.equal(early.player.realm, '金丹初期');

  const late = setup(30); // 才 29 年
  late.player.realm = '筑基后期';
  const report = {};
  applyStateUpdates(late.player, late.world, { realmChange: '金丹初期' }, report);
  assert.equal(late.player.realm, '筑基后期');
  assert.ok(report.issues.some((i) => i.code === 'breakthrough_too_soon'));
});

test('旧档没有 realmSince：不拦，突破后开始记录', () => {
  const { player, world } = setup(2);
  delete world.realmSince;
  applyStateUpdates(player, world, { realmChange: '炼气初期' });
  assert.equal(player.realm, '炼气初期');
  assert.deepEqual(world.realmSince, { year: 2, month: 1, day: 1 });
});

test('只升不降：同级或倒退的 realmChange 被忽略', () => {
  const { player, world } = setup(100);
  player.realm = '金丹初期';
  applyStateUpdates(player, world, { realmChange: '筑基后期' });
  assert.equal(player.realm, '金丹初期');
});

test('提示词带上"已历多少年/还差多少年"', () => {
  const { player, world } = setup(4);
  player.realm = '炼气后期';
  player.cultivation = 80;
  const text = buildGMMessages(player, world, [], '修炼').map((m) => m.content).join('\n');
  assert.ok(text.includes('【境界岁月】'));
  assert.ok(text.includes('炼气后期'));
  assert.ok(text.includes('还差约') || text.includes('已足'));
});
