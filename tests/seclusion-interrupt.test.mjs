import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  buildGMMessages,
  seclusionIntent,
  rollSeclusionInterrupt,
} from '../public/game.js';

const setup = (patch = {}) => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  world.realmSince = { year: 1, month: 1, day: 1 };
  player.realm = '筑基初期';
  Object.assign(world, patch);
  return { player, world };
};

// 固定序列的假随机：第一次给 chance 判定，第二次给"第几年"
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('只有闭关意图才掷骰：闲聊不触发', () => {
  const { player, world } = setup();
  assert.equal(seclusionIntent('出去走走'), false);
  assert.equal(seclusionIntent('闭关十年'), true);
  assert.equal(rollSeclusionInterrupt(world, player, '去坊市看看', () => 0), null);
  assert.equal(world.pendingInterrupt, undefined);
});

test('风平浪静时，掷不中就没有打断', () => {
  const { player, world } = setup();
  assert.equal(rollSeclusionInterrupt(world, player, '闭关十年', () => 0.99), null);
  assert.equal(world.pendingInterrupt, null);
});

test('仇家在旁：闭关被打断，并指定"第几年、谁"', () => {
  const { player, world } = setup();
  world.npcs = [{ name: '血手人屠', relation: '结仇', bond: { debt: 0, grudge: 80, trust: 0, need: 0 } }];
  const hit = rollSeclusionInterrupt(world, player, '闭关十年', seq(0.01, 0.5));
  assert.ok(hit);
  assert.ok(hit.by.includes('血手人屠'));
  assert.ok(hit.afterYears >= 1 && hit.afterYears <= 3);
});

test('没有具体仇人时，敌对势力背锅；再没有就落到心魔/不速之客', () => {
  const { player, world } = setup();
  world.factions = [{ name: '血刀寨', relation: '敌对' }];
  const hit = rollSeclusionInterrupt(world, player, '闭关', seq(0.01, 0));
  assert.ok(hit.by.includes('血刀寨'));

  const clean = setup();
  const fallback = rollSeclusionInterrupt(clean.world, clean.player, '闭关', seq(0.0, 0));
  assert.ok(fallback.by === '心魔' || fallback.by === '不速之客');
});

test('危险地带与乱世会提高概率（同一掷点，安全地不中、险地中）', () => {
  const safe = setup();
  const risky = setup({ eraType: '乱世' });
  risky.world.geo = { regionId: 'hanyuan', sinceTurn: 0, migrated: false };
  // 掷点 0.2：安全地基础概率约 0.08 不中；险地 + 乱世约 0.08+0.10+0.05 会中
  assert.equal(rollSeclusionInterrupt(safe.world, safe.player, '闭关', () => 0.2), null);
  assert.ok(rollSeclusionInterrupt(risky.world, risky.player, '闭关', () => 0.2));
});

test('提示词写明"提前出关"并限定只填被打断的那几年', () => {
  const { player, world } = setup();
  world.pendingInterrupt = { by: '血刀寨', afterYears: 2, turn: 3 };
  const text = buildGMMessages(player, world, [], '闭关十年').map((m) => m.content).join('\n');
  assert.ok(text.includes('【闭关将被打断】'));
  assert.ok(text.includes('提前出关'));
  assert.ok(text.includes('24 月'));
});

test('结算时把时长压到打断那年，修为也跟着少', () => {
  const { player, world } = setup();
  world.pendingInterrupt = { by: '血刀寨', afterYears: 1, turn: 3 };
  const note = applyStateUpdates(player, world, {
    timeMonths: 120,
    flags: { closedDoor: true },
    stateUpdates: { cultivation: { delta: 10 } },
  });
  assert.ok(note.includes('闭关被打断'));
  // 筑基每月 0.139 × 12 月 ≈ 1.67，而不是十年该有的 16.7
  assert.ok(player.cultivation > 1.5 && player.cultivation < 2, `实际 ${player.cultivation}`);
});

test('打断只用一回合：结算完自动清空，不会连累下一次闭关', () => {
  const { player, world } = setup();
  world.pendingInterrupt = { by: '心魔', afterYears: 2, turn: 1 };
  applyStateUpdates(player, world, { timeMonths: 120, flags: { closedDoor: true } });
  assert.equal(world.pendingInterrupt, null);
  const text = buildGMMessages(player, world, [], '继续闭关').map((m) => m.content).join('\n');
  assert.ok(!text.includes('【闭关将被打断】'));
});

test('闭关被打断会记一笔事迹，供事后翻查', () => {
  const { player, world } = setup();
  world.pendingInterrupt = { by: '血刀寨', afterYears: 1, turn: 2 };
  applyStateUpdates(player, world, { timeMonths: 60, flags: { closedDoor: true } });
  const ev = world.events.find((e) => e.title === '闭关受扰');
  assert.ok(ev);
  assert.equal(ev.subject, '血刀寨');
});

test('言出法随模式不掷打断（外挂不该被搅局）', () => {
  const { player, world } = setup();
  world.settings = { ...world.settings, godMode: true };
  assert.equal(rollSeclusionInterrupt(world, player, '闭关十年', () => 0), null);
});
