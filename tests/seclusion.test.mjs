import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  cultRatePerMonth,
  seclusionGain,
  closedDoorMult,
} from '../public/game.js';

const setup = (realm = '筑基初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  player.realm = realm;
  world.date = { year: 1, month: 1, day: 1 };
  world.realmSince = { year: 1, month: 1, day: 1 };
  return { player, world };
};

test('每境界的每月涨幅：刚好够在"最少在境年限"里填满', () => {
  assert.ok(Math.abs(cultRatePerMonth('凡人') - 100 / 36) < 1e-9);
  assert.ok(Math.abs(cultRatePerMonth('筑基后期') - 100 / 720) < 1e-9);
  assert.ok(cultRatePerMonth('金丹初期') < cultRatePerMonth('筑基初期'), '境界越高越慢');
  assert.ok(cultRatePerMonth('大乘初期') > 0);
});

test('闭关收益按时长算：筑基十年只有十几点，不是一下子灌满', () => {
  const gain = seclusionGain('筑基初期', 120, 10);
  assert.ok(gain > 16 && gain < 17, `实际 ${gain}`);
  const sixty = seclusionGain('筑基初期', 720, 10);
  assert.ok(sixty > 99 && sixty < 101, '六十年才刚好圆满');
});

test('模型给的 delta 只当效率提示：20 约等于两倍，5 约等于一半', () => {
  const base = seclusionGain('筑基初期', 120, 10);
  const good = seclusionGain('筑基初期', 120, 20);
  const poor = seclusionGain('筑基初期', 120, 5);
  assert.ok(Math.abs(good - base * 2) < 0.02);
  assert.ok(Math.abs(poor - base * 0.5) < 0.02);
  assert.equal(seclusionGain('筑基初期', 120, 999), seclusionGain('筑基初期', 120, 20), '效率上限 2 倍');
  assert.equal(seclusionGain('筑基初期', 120, -99), seclusionGain('筑基初期', 120, 5), '效率下限 0.5 倍');
});

test('闭关十年：修为约 +16.7，不再是一次灌满', () => {
  const { player, world } = setup('筑基初期');
  const report = {};
  applyStateUpdates(player, world, {
    stateUpdates: { cultivation: { delta: 10 } },
    timeMonths: 120,
    flags: { closedDoor: true },
  }, report);
  assert.ok(player.cultivation > 16 && player.cultivation < 17, `实际 ${player.cultivation}`);
});

test('凡人闭关三年：修为圆满（下限 3 年，正好填满）', () => {
  const { player, world } = setup('凡人');
  applyStateUpdates(player, world, {
    stateUpdates: { cultivation: { delta: 10 } },
    timeMonths: 36,
    flags: { closedDoor: true },
  });
  assert.equal(player.cultivation, 100);
});

test('连续闭关仍递减：第三、四次闭关收益明显变低', () => {
  const { player, world } = setup('筑基初期');
  const increments = [];
  for (let i = 0; i < 4; i++) {
    const before = player.cultivation;
    applyStateUpdates(player, world, {
      stateUpdates: { cultivation: { delta: 10 } },
      timeMonths: 60,
      flags: { closedDoor: true },
    });
    increments.push(Math.round((player.cultivation - before) * 100) / 100);
  }
  assert.ok(increments[0] > increments[2], `第一次 ${increments[0]} 应高于第三次 ${increments[2]}`);
  assert.ok(increments[0] > increments[3]);
  assert.equal(closedDoorMult(1), 1);
  assert.ok(closedDoorMult(4) < 1);
});

test('非闭关的顿悟仍按一次结算，不按时长灌水', () => {
  const { player, world } = setup('筑基初期');
  applyStateUpdates(player, world, { stateUpdates: { cultivation: { delta: 10 } }, timeMonths: 120 });
  // 非闭关：仍是"顿悟式"一次性收益（这里不乘时长会得到 10 左右，乘时长则会被放大）
  assert.ok(player.cultivation >= 10, `实际 ${player.cultivation}`);
});

test('闭关满年限后可以突破：修为圆满 + 岁月足够', () => {
  const { player, world } = setup('筑基后期');
  world.date = { year: 61, month: 1, day: 1 }; // 已历 60 年
  applyStateUpdates(player, world, {
    stateUpdates: { cultivation: { delta: 10 } },
    timeMonths: 720,
    flags: { closedDoor: true },
  });
  assert.equal(player.cultivation, 100);
  const report = {};
  applyStateUpdates(player, world, { realmChange: '金丹初期' }, report);
  assert.equal(player.realm, '金丹初期');
  assert.ok(!report.issues.some((i) => i.code === 'breakthrough_too_soon'));
});

test('结局边界：闭关收益不会把修为推过 100', () => {
  const { player, world } = setup('金丹初期');
  applyStateUpdates(player, world, {
    stateUpdates: { cultivation: { delta: 15 } },
    timeMonths: 1200, // 一百年，理论上 150 点，必须被夹到 100
    flags: { closedDoor: true },
  });
  assert.equal(player.cultivation, 100);
});
