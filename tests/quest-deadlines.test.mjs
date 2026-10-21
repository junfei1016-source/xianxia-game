import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  advanceTime,
  addGameDays,
  daysUntil,
  migrateQuestDeadlines,
  expireQuestDeadlines,
  questDeadlineInfo,
  buildWorldContext,
  buildGMMessages,
  buildGMCombinedMessages,
  buildExtractMessages,
} from '../public/game.js';

const date = (year = 1, month = 1, day = 1) => ({ year, month, day });
const setup = () => ({ player: newPlayerState(), world: newWorldState() });
function register(state, fields = {}) {
  applyStateUpdates(state.player, state.world, {
    newQuests: [{ title: '替顾丹师取药', objective: '向货主买药', reward: '30 灵石', timeNode: '三日内', deadlineDays: 3, ...fields }],
  });
  return state.world.quests.find((q) => q.title === (fields.title || '替顾丹师取药'));
}
// Match app.js ordering: apply completion/registration, advance the calendar, expire.
function turn(state, out = {}) {
  applyStateUpdates(state.player, state.world, out);
  state.world.turn += 1;
  advanceTime(state.world, state.player, out.timeMonths ?? 0);
  return expireQuestDeadlines(state.player, state.world);
}

test('日期计算沿用每月 30 天、每年 360 天，且不修改输入', () => {
  const original = date(1, 1, 29);
  assert.deepEqual(addGameDays(original, 3), date(1, 2, 2));
  assert.deepEqual(original, date(1, 1, 29));
  assert.deepEqual(addGameDays(date(1, 12, 30), 1), date(2, 1, 1));
  assert.deepEqual(addGameDays(date(), 360), date(2, 1, 1));
  assert.deepEqual(addGameDays(date(2, 2, 28), 3), date(2, 3, 1));
});

test('剩余天数可区分截止当日和已超期', () => {
  assert.equal(daysUntil(date(), date(1, 1, 4)), 3);
  assert.equal(daysUntil(date(1, 1, 4), date(1, 1, 4)), 0);
  assert.equal(daysUntil(date(1, 1, 5), date(1, 1, 4)), -1);
  assert.equal(daysUntil(date(1, 12, 30), date(2, 1, 2)), 2);
});

test('拒绝非法日期或非整数日期偏移', () => {
  const invalidDates = [null, {}, date(0), date(1, 0), date(1, 13), date(1, 1, 0), date(1, 1, 31), date(1.5), date(Infinity), { year: '1', month: 1, day: 1 }];
  for (const input of invalidDates) {
    assert.equal(addGameDays(input, 1), null);
    assert.equal(daysUntil(input, date()), null);
    assert.equal(daysUntil(date(), input), null);
  }
  for (const input of [NaN, Infinity, -Infinity, 0.5, '3', null]) {
    assert.equal(addGameDays(date(), input), null);
  }
});

test('三日任务保存绝对截止日期，不生成旧回合字段', () => {
  const state = setup();
  const quest = register(state);
  assert.deepEqual(quest.deadlineDate, date(1, 1, 4));
  assert.equal(quest.deadlineVersion, 2);
  assert.equal(quest.deadlineTurn, undefined);
  assert.notEqual(quest.deadlinePending, true);
});

test('复现修复：同日连续 20 回合谈价不会误判三日任务失败', () => {
  const state = setup();
  const quest = register(state);
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(turn(state, { timeMonths: 0 }), []);
  }
  assert.deepEqual(state.world.date, date());
  assert.equal(quest.status, 'active');
  assert.deepEqual(quest.deadlineDate, date(1, 1, 4));
});

test('截止当天保持进行中，下一游戏日才失败', () => {
  const state = setup();
  const quest = register(state);
  assert.deepEqual(turn(state, { timeMonths: 0.1 }), []);
  assert.deepEqual(state.world.date, date(1, 1, 4));
  assert.equal(quest.status, 'active');
  assert.equal(questDeadlineInfo(quest, state.world).remainingDays, 0);
  const expired = turn(state, { timeMonths: 1 / 30 });
  assert.deepEqual(state.world.date, date(1, 1, 5));
  assert.deepEqual(expired.map((q) => q.title), [quest.title]);
  assert.equal(quest.status, 'failed');
});

test('今夜/当日的 0 天期限不被当成无期限', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 0, timeNode: '今夜' });
  assert.deepEqual(quest.deadlineDate, date());
  assert.deepEqual(turn(state, { timeMonths: 0 }), []);
  assert.equal(quest.status, 'active');
  assert.equal(turn(state, { timeMonths: 1 / 30 }).length, 1);
});

test('任务期限正确跨月与跨年', () => {
  for (const [start, expected] of [[date(1, 1, 29), date(1, 2, 2)], [date(1, 12, 29), date(2, 1, 2)]]) {
    const state = setup();
    state.world.date = start;
    const quest = register(state);
    assert.deepEqual(quest.deadlineDate, expected);
    assert.deepEqual(turn(state, { timeMonths: 0.1 }), []);
    assert.equal(turn(state, { timeMonths: 1 / 30 }).length, 1);
  }
});

test('同回合明确完成优先于推进时间后的超时', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 0 });
  const expired = turn(state, { timeMonths: 1, questUpdates: [{ title: quest.title, status: 'completed', note: '已经交药' }] });
  assert.equal(quest.status, 'completed');
  assert.deepEqual(expired, []);
  assert.equal(state.world.events.filter((e) => e.subject === quest.title && e.title.includes('超时')).length, 0);
});

test('一月旅途结束接取三日任务，截止从旅途末开始计算', () => {
  const state = setup();
  const expired = turn(state, { timeMonths: 1, newQuests: [{ title: '抵达后的新委托', objective: '取药', reward: '10 灵石', deadlineDays: 3 }] });
  const quest = state.world.quests.find((q) => q.title === '抵达后的新委托');
  assert.deepEqual(state.world.date, date(1, 2, 1));
  assert.deepEqual(quest.deadlineDate, date(1, 2, 4));
  assert.deepEqual(expired, []);
});

test('相对期限与时间推进采用同一天数舍入', () => {
  const state = setup();
  turn(state, { timeMonths: 0.03, newQuests: [{ title: '次日新任务', objective: '取药', reward: '10 灵石', deadlineDays: 1 }] });
  const quest = state.world.quests.find((q) => q.title === '次日新任务');
  assert.deepEqual(state.world.date, date(1, 1, 2));
  assert.deepEqual(quest.deadlineDate, date(1, 1, 3));
});

test('兼容只有年月的旧存档：首次续玩接任务同样以初一锚定', () => {
  const state = setup();
  state.world.date = { year: 1, month: 2 };
  turn(state, { timeMonths: 1 / 30, newQuests: [{ title: '旧档新委托', objective: '取药', reward: '灵石', deadlineDays: 3 }] });
  assert.deepEqual(state.world.date, date(1, 2, 2));
  const quest = state.world.quests.find((q) => q.title === '旧档新委托');
  assert.deepEqual(quest.deadlineDate, date(1, 2, 5));
  assert.notEqual(quest.deadlinePending, true);
});

test('旧存档缺失或为空的游戏日期使用默认起点，接任务和时间推进一致', () => {
  for (const missing of [undefined, null]) {
    const state = setup();
    state.world.date = missing;
    turn(state, { timeMonths: 1 / 30, newQuests: [{ title: '缺日期旧档', objective: '取药', reward: '灵石', deadlineDays: 3 }] });
    assert.deepEqual(state.world.date, date(1, 1, 2));
    assert.deepEqual(state.world.quests.find((q) => q.title === '缺日期旧档').deadlineDate, date(1, 1, 5));
  }
});

test('旧存档已有非法日期时不偷偷改为合法日期，也不据此判罚', () => {
  for (const invalid of [date(1, 1, 0), date(1, 1, 31), date(1, 1, -1), date(1, 13, 1), date(0, 1, 1)]) {
    const state = setup();
    state.world.date = invalid;
    const original = { ...invalid };
    turn(state, { timeMonths: 1, newQuests: [{ title: '坏日期旧档', objective: '取药', reward: '灵石', deadlineDays: 3 }] });
    assert.deepEqual(state.world.date, original);
    const quest = state.world.quests.find((q) => q.title === '坏日期旧档');
    assert.equal(quest.deadlinePending, true);
    assert.equal(quest.status, 'active');
  }
});

test('合法绝对截止日期优先于相对天数', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 99, deadlineDate: date(2, 3, 4) });
  assert.deepEqual(quest.deadlineDate, date(2, 3, 4));
});

test('迁移旧期限只保留原回合数待确认，不猜测天数或立即失败', () => {
  const state = setup();
  state.world.turn = 200;
  state.world.date = date(2, 8, 6);
  state.world.quests = [{ title: '旧存档取药', type: 'side', objective: '买药', reward: '灵石', timeNode: '辰时前', status: 'active', deadlineTurn: 143 }];
  const original = JSON.parse(JSON.stringify(state.world.quests[0]));
  assert.ok(migrateQuestDeadlines(state.world) >= 1);
  const quest = state.world.quests[0];
  assert.equal(quest.status, original.status);
  assert.equal(quest.objective, original.objective);
  assert.equal(quest.timeNode, original.timeNode);
  assert.equal(quest.legacyDeadlineTurn, 143);
  assert.equal(quest.deadlineTurn, undefined);
  assert.equal(quest.deadlinePending, true);
  assert.equal(quest.deadlineDate == null, true);
  assert.deepEqual(expireQuestDeadlines(state.player, state.world), []);
  assert.equal(questDeadlineInfo(quest, state.world).pending, true);
});

test('旧存档迁移幂等，重复加载或迁移不会顺延已知截止日期', () => {
  const state = setup();
  state.world.quests = [{ title: '旧任务', status: 'active', deadlineTurn: 50 }, { title: '日期任务', status: 'active', deadlineDate: date(1, 1, 4) }];
  migrateQuestDeadlines(state.world);
  const snapshot = JSON.stringify(state.world.quests);
  state.world.date = date(1, 1, 3);
  state.world.turn = 99;
  assert.equal(migrateQuestDeadlines(state.world), 0);
  assert.equal(JSON.stringify(state.world.quests), snapshot);
  const restored = JSON.parse(JSON.stringify(state.world));
  assert.equal(migrateQuestDeadlines(restored), 0);
  assert.deepEqual(restored.quests[1].deadlineDate, date(1, 1, 4));
});

test('真实 v1.1.0 日志的脱敏任务快照迁移保留全部 19 项状态', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/legacy-v1.1.0-quests.json', import.meta.url), 'utf8'));
  const state = setup();
  state.world = { ...state.world, ...fixture.world };
  const expected = state.world.quests.map(({ title, status, timeNode }) => ({ title, status, timeNode }));
  assert.equal(expected.length, 19);
  migrateQuestDeadlines(state.world);
  assert.deepEqual(state.world.quests.map(({ title, status, timeNode }) => ({ title, status, timeNode })), expected);
  assert.deepEqual(expireQuestDeadlines(state.player, state.world), []);
  assert.equal(state.world.quests.find((q) => q.title === '替顾丹师取药').legacyDeadlineTurn, 142);
  assert.equal(state.world.quests.find((q) => q.title === '摸透青焰炭性').status, 'failed');
  assert.equal(migrateQuestDeadlines(state.world), 0);
});

test('迁移绝不重新打开 completed/failed/cancelled 任务', () => {
  const state = setup();
  state.world.quests = ['completed', 'failed', 'cancelled'].map((status) => ({ title: status, status, deadlineTurn: 2 }));
  migrateQuestDeadlines(state.world);
  for (const quest of state.world.quests) {
    assert.equal(quest.status, quest.title);
    applyStateUpdates(state.player, state.world, { questUpdates: [{ title: quest.title, deadlineDays: 3 }] });
    assert.equal(quest.status, quest.title);
    applyStateUpdates(state.player, state.world, { questUpdates: [{ title: quest.title, status: 'active', deadlineDays: 3 }] });
    assert.equal(quest.status, quest.title);
  }
  assert.deepEqual(expireQuestDeadlines(state.player, state.world), []);
});

test('剧情明确补录相对期限后，旧任务恢复日期判定', () => {
  const state = setup();
  state.world.quests = [{ title: '待确认', status: 'active', deadlineTurn: 2 }];
  migrateQuestDeadlines(state.world);
  turn(state, { timeMonths: 1 / 30, questUpdates: [{ title: '待确认', deadlineDays: 2, timeNode: '两日内' }] });
  const quest = state.world.quests[0];
  assert.deepEqual(quest.deadlineDate, date(1, 1, 4));
  assert.notEqual(quest.deadlinePending, true);
  assert.equal(quest.timeNode, '两日内');
  assert.deepEqual(turn(state, { timeMonths: 2 / 30 }), []);
  assert.equal(turn(state, { timeMonths: 1 / 30 }).length, 1);
});

test('剧情可为待确认旧任务补录绝对日期', () => {
  const state = setup();
  state.world.quests = [{ title: '旧委托', status: 'active', deadlineTurn: 5 }];
  migrateQuestDeadlines(state.world);
  applyStateUpdates(state.player, state.world, { questUpdates: [{ title: '旧委托', deadlineDate: date(1, 2, 3) }] });
  assert.deepEqual(state.world.quests[0].deadlineDate, date(1, 2, 3));
  assert.notEqual(state.world.quests[0].deadlinePending, true);
});

test('重复登记任务或非法期限更新不顺延已有合法截止日期', () => {
  const state = setup();
  const quest = register(state);
  turn(state, { timeMonths: 1 / 30, newQuests: [{ title: quest.title, objective: '取药', reward: '灵石', deadlineDays: 3 }] });
  assert.deepEqual(quest.deadlineDate, date(1, 1, 4));
  applyStateUpdates(state.player, state.world, { questUpdates: [{ title: quest.title, deadlineDate: date(1, 99, 99) }] });
  assert.deepEqual(quest.deadlineDate, date(1, 1, 4));
  assert.notEqual(quest.deadlinePending, true);
});

test('模型每月重复 questUpdates.deadlineDays 不能无限顺延已确认期限', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 60, timeNode: '两月内' });
  const confirmed = date(1, 3, 1);
  assert.deepEqual(quest.deadlineDate, confirmed);
  for (let month = 0; month < 3; month += 1) {
    const expired = turn(state, {
      timeMonths: 1,
      questUpdates: [{ title: quest.title, status: 'active', deadlineDays: 60 }],
    });
    assert.deepEqual(quest.deadlineDate, confirmed);
    assert.equal(expired.length, month === 2 ? 1 : 0);
  }
  assert.deepEqual(state.world.date, date(1, 4, 1));
  assert.equal(quest.status, 'failed');
});

test('合法的绝对日期更新同样不能替换已确认期限', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 0, timeNode: '今日' });
  const expired = turn(state, {
    timeMonths: 1 / 30,
    questUpdates: [{ title: quest.title, deadlineDate: date(99, 12, 30), deadlineDays: 9999 }],
  });
  assert.deepEqual(quest.deadlineDate, date());
  assert.equal(quest.status, 'failed');
  assert.equal(expired.length, 1);
});

test('已确认日期和原文期限一起固定，重复 timeNode 不能制造显示与判定冲突', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 3, timeNode: '三日内' });
  for (const update of [
    { timeNode: '三年内' },
    { timeNode: '一月内', deadlineDays: 30 },
    { timeNode: '第99年末', deadlineDate: date(99, 12, 30) },
  ]) {
    applyStateUpdates(state.player, state.world, { questUpdates: [{ title: quest.title, ...update }] });
    assert.equal(quest.timeNode, '三日内');
    assert.deepEqual(quest.deadlineDate, date(1, 1, 4));
  }
  assert.equal(turn(state, { timeMonths: 4 / 30 }).length, 1);
  assert.equal(quest.status, 'failed');
});

test('无期限任务不会因为回合或日期增长而失败', () => {
  const state = setup();
  applyStateUpdates(state.player, state.world, { newQuests: [{ title: '无期限的约定', objective: '寻访', reward: '友谊', timeNode: '无期限' }] });
  const quest = state.world.quests.find((q) => q.title === '无期限的约定');
  state.world.turn = 1000;
  turn(state, { timeMonths: 120 });
  assert.equal(quest.status, 'active');
  const info = questDeadlineInfo(quest, state.world);
  assert.equal(info.remainingDays, null);
  assert.equal(info.pending, false);
});

test('旧模型仍输出 deadlineTurns 时只待确认，不恢复回合判罚', () => {
  const state = setup();
  applyStateUpdates(state.player, state.world, { newQuests: [{ title: '旧模型任务', objective: '取药', reward: '灵石', deadlineTurns: 3 }] });
  const quest = state.world.quests.find((q) => q.title === '旧模型任务');
  assert.equal(quest.deadlinePending, true);
  assert.equal(quest.deadlineTurn, undefined);
  state.world.turn = 1000;
  turn(state, { timeMonths: 12 });
  assert.equal(quest.status, 'active');
});

test('非法相对期限被标记待确认，不产生可判罚日期', () => {
  for (const deadlineDays of [-1, 0.5, NaN, Infinity, '3']) {
    const state = setup();
    const quest = register(state, { deadlineDays });
    assert.equal(quest.deadlinePending, true);
    assert.equal(questDeadlineInfo(quest, state.world).remainingDays, null);
    assert.deepEqual(turn(state, { timeMonths: 12 }), []);
  }
});

test('非法绝对期限或旧存档坏日期不会触发误失败', () => {
  for (const deadlineDate of [date(1, 13, 1), date(1, 1, 31), { year: '1', month: 1, day: 1 }]) {
    const state = setup();
    state.world.quests = [{ title: '坏日期', status: 'active', deadlineDate }];
    migrateQuestDeadlines(state.world);
    state.world.date = date(10, 1, 1);
    assert.deepEqual(expireQuestDeadlines(state.player, state.world), []);
    assert.equal(questDeadlineInfo(state.world.quests[0], state.world).pending, true);
  }
});

test('非法时间输出不会破坏日期或寿元', () => {
  for (const months of [-1, NaN, Infinity, -Infinity, '1']) {
    const state = setup();
    const originalLife = state.player.lifespan;
    assert.doesNotThrow(() => advanceTime(state.world, state.player, months));
    assert.deepEqual(state.world.date, date());
    assert.equal(state.player.lifespan, originalLife);
    applyStateUpdates(state.player, state.world, { timeMonths: months, newQuests: [{ title: '新委托', objective: '取药', reward: '灵石', deadlineDays: 3 }] });
    assert.deepEqual(state.world.quests.find((q) => q.title === '新委托').deadlineDate, date(1, 1, 4));
  }
});

test('超时只返回一次并记录截止日、判定日和唯一事迹', () => {
  const state = setup();
  const quest = register(state, { deadlineDays: 0 });
  turn(state, { timeMonths: 1 / 30 });
  assert.equal(quest.status, 'failed');
  assert.equal(typeof quest.failureReason, 'string');
  assert.ok(quest.failureReason.includes('截止1年1月1日'));
  assert.ok(quest.failureReason.includes('当前1年1月2日'));
  assert.deepEqual(quest.failedAtDate, date(1, 1, 2));
  const events = state.world.events.filter((e) => e.subject === quest.title && e.title.includes('超时'));
  assert.equal(events.length, 1);
  assert.deepEqual(expireQuestDeadlines(state.player, state.world), []);
  assert.equal(state.world.events.filter((e) => e.subject === quest.title && e.title.includes('超时')).length, 1);
});

test('到期前迁移只归一化，不在读取存档时判罚', () => {
  const state = setup();
  state.world.date = date(1, 2, 1);
  state.world.quests = [{ title: '已过日期但未结算', status: 'active', deadlineDate: date(1, 1, 2) }];
  migrateQuestDeadlines(state.world);
  assert.equal(state.world.quests[0].status, 'active');
  assert.equal(state.world.events.length, 0);
  assert.equal(expireQuestDeadlines(state.player, state.world).length, 1);
});

test('快照携带日期期限及旧期限待确认状态', () => {
  const state = setup();
  register(state);
  state.world.quests.push({ title: '旧任务', status: 'active', deadlineTurn: 99 });
  migrateQuestDeadlines(state.world);
  const context = buildWorldContext(state.world);
  assert.deepEqual(context.quests.find((q) => q.title === '替顾丹师取药').deadlineDate, date(1, 1, 4));
  assert.equal(context.quests.find((q) => q.title === '旧任务').deadlinePending, true);
});

test('快慢模式都向模型说明日期期限，移除三日等于三回合的示例', () => {
  const state = setup();
  const extracted = JSON.stringify(buildExtractMessages('三日内取药', state.player, state.world));
  assert.ok(extracted.includes('deadlineDays'));
  assert.ok(extracted.includes('deadlineDate'));
  assert.equal(extracted.includes('deadlineTurns 为期限的回合数'), false);
  state.world.settings.pace = '快';
  const fast = JSON.stringify(buildGMCombinedMessages(state.player, state.world, [], '接取任务'));
  assert.ok(fast.includes('deadlineDays'));
  assert.ok(fast.includes('deadlineDate'));
  assert.equal(fast.includes('deadlineTurns 为期限的回合数'), false);
});
