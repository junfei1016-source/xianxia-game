import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  parseLLMJSON,
  validateStateOutput,
  expireQuestDeadlines,
  advanceTime,
  addGameDays,
  daysUntil,
} from '../public/game.js';

const acceptedCodes = new Set([
  'invalid_root', 'invalid_type', 'invalid_number', 'forbidden_set',
  'unsafe_key', 'unknown_field', 'terminal_quest', 'conflicting_quest_updates',
  'numeric_overflow', 'forbidden_flag',
]);
const numericFields = ['hp', 'maxHp', 'lifespan', 'spiritStones', 'morality', 'reputation', 'cultivation'];
const setup = () => ({ player: newPlayerState(), world: newWorldState() });
function apply(state, input) {
  const report = {};
  const note = applyStateUpdates(state.player, state.world, input, report);
  assert.ok(note === null || typeof note === 'string');
  assert.ok(Array.isArray(report.issues));
  return report;
}
const hasCode = (report, code) => report.issues.some((issue) => issue.code === code);
function assertSafeNumbers(state) {
  for (const field of numericFields) {
    assert.equal(Number.isFinite(state.player[field]), true, field);
    assert.ok(Math.abs(state.player[field]) <= Number.MAX_SAFE_INTEGER, field);
  }
}
const withoutLog = (world) => {
  const copy = structuredClone(world);
  delete copy.validationLog;
  return copy;
};

test('解析器拒绝合法 JSON 根数组/标量，不截取数组内部对象', () => {
  for (const raw of ['null', '[]', '[{"stateUpdates":{"spiritStones":5}}]', '[1,{"a":1}]', '1', 'true', 'false', '"text"']) {
    assert.equal(parseLLMJSON(raw), null, raw);
  }
});

test('解析器继续兼容围栏、附加说明和中文弯引号对象', () => {
  assert.deepEqual(parseLLMJSON('```json\n{"stateUpdates":{"hp":-2}}\n```'), { stateUpdates: { hp: -2 } });
  assert.deepEqual(parseLLMJSON('说明：{"a":1}。以上。'), { a: 1 });
  assert.deepEqual(parseLLMJSON('{“a”:1}'), { a: 1 });
  assert.deepEqual(parseLLMJSON('{"narrative":"他说“你好”"}'), { narrative: '他说“你好”' });
});

test('校验器对非法根返回 null 和静态诊断', () => {
  for (const input of [null, undefined, [], 1, true, 'text', new Date(), /x/]) {
    const report = validateStateOutput(input);
    assert.equal(report.out, null);
    assert.ok(hasCode(report, 'invalid_root'));
  }
});

test('非法根不进入结算，不改变玩家、任务、闭关计数等状态', () => {
  for (const input of [null, undefined, [], 1, true, 'text']) {
    const state = setup();
    state.world.closedStreak = 3;
    const beforePlayer = structuredClone(state.player);
    const beforeWorld = withoutLog(state.world);
    const report = apply(state, input);
    assert.equal(report.out, null);
    assert.ok(hasCode(report, 'invalid_root'));
    assert.deepEqual(state.player, beforePlayer);
    assert.deepEqual(withoutLog(state.world), beforeWorld);
  }
});

test('合法对象可校验，输入对象本身不被改写', () => {
  const input = { stateUpdates: { hp: { delta: -5 } }, flags: { 已见故人: true }, newNpcs: [{ name: '沈青梧', desc: '青衣剑客' }] };
  const original = structuredClone(input);
  const report = validateStateOutput(input);
  assert.equal(typeof report.out, 'object');
  assert.notEqual(report.out, null);
  assert.equal(Array.isArray(report.out), false);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(input, original);
});

test('stateUpdates 非对象时拒绝该字段，独立合法内容继续应用', () => {
  for (const invalid of [null, [], 'bad', 12, true]) {
    const state = setup();
    const report = apply(state, { stateUpdates: invalid, flags: { 已见故人: true } });
    assert.ok(hasCode(report, 'invalid_type'));
    assert.equal(state.world.flags.已见故人, true);
    assertSafeNumbers(state);
  }
});

test('合法裸数字、delta 对象和平铺属性保持兼容', () => {
  const a = setup();
  apply(a, { stateUpdates: { hp: -10, spiritStones: { delta: 20 } } });
  assert.equal(a.player.hp, 90);
  assert.equal(a.player.spiritStones, 20);
  const b = setup();
  apply(b, { hp: { delta: -10 }, spiritStones: 20 });
  assert.equal(b.player.hp, 90);
  assert.equal(b.player.spiritStones, 20);
});

test('JSON 的 1e309、NaN、Infinity 和不安全数值不能污染玩家', () => {
  const inputs = [parseLLMJSON('{"stateUpdates":{"spiritStones":{"delta":1e309}}}'), ...[NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '50'].map((delta) => ({ stateUpdates: { spiritStones: { delta } } }))];
  for (const input of inputs) {
    const state = setup();
    const report = apply(state, input);
    assert.ok(hasCode(report, 'invalid_number') || hasCode(report, 'invalid_type'));
    assert.equal(state.player.spiritStones, 0);
    assertSafeNumbers(state);
  }
});

test('非法玩家数值逐字段拒绝，同批合法疗伤与灵石仍落地', () => {
  const state = setup();
  state.player.hp = 50;
  const report = apply(state, { stateUpdates: { maxHp: { delta: Infinity }, cultivation: { delta: NaN }, hp: { delta: 10 }, spiritStones: { delta: 5 } } });
  assert.equal(state.player.hp, 60);
  assert.equal(state.player.spiritStones, 5);
  assert.equal(state.player.maxHp, 100);
  assert.equal(state.player.cultivation, 0);
  assert.ok(report.issues.length >= 2);
  assertSafeNumbers(state);
});

test('delta 对象形状非法时不按字符串或数组隐式转换', () => {
  for (const invalid of [{ delta: '10' }, { delta: null }, [], true, '10', { delta: [] }]) {
    const state = setup();
    const report = apply(state, { stateUpdates: { spiritStones: invalid } });
    assert.ok(report.issues.length > 0);
    assert.equal(state.player.spiritStones, 0);
  }
});

test('set 一律拒绝，不能绕过普通/困难/快速/外挂数值规则', () => {
  for (const settings of [
    { difficulty: '普通', pace: '慢' },
    { difficulty: '困难', pace: '慢' },
    { difficulty: '普通', pace: '快' },
    { difficulty: '普通', pace: '慢', godMode: true },
  ]) {
    const state = setup();
    state.world.settings = settings;
    const before = structuredClone(state.player);
    const report = apply(state, { stateUpdates: { hp: { set: 1 }, cultivation: { set: 99 }, spiritStones: { set: 999 } } });
    assert.ok(hasCode(report, 'forbidden_set'));
    assert.deepEqual(state.player, before);
  }
});

test('拒绝 set 不影响同批独立 delta，合法外挂减伤与快速修为仍生效', () => {
  const state = setup();
  state.world.settings = { godMode: true, pace: '快', difficulty: '普通' };
  const report = apply(state, { stateUpdates: { hp: { delta: -99 }, spiritStones: { set: 999 }, cultivation: { delta: 10 } } });
  assert.equal(state.player.hp, 100);
  assert.equal(state.player.spiritStones, 0);
  assert.equal(state.player.cultivation, 20);
  assert.ok(hasCode(report, 'forbidden_set'));
});

test('倍率后溢出被拒绝，同批合法负伤仍可应用', () => {
  const state = setup();
  state.world.eraType = '盛世';
  const report = apply(state, { stateUpdates: { spiritStones: { delta: Number.MAX_SAFE_INTEGER }, hp: { delta: -10 } } });
  assert.equal(state.player.spiritStones, 0);
  assert.equal(state.player.hp, 93); // 盛世危险倍率 0.7。
  assert.ok(hasCode(report, 'numeric_overflow'));
  assertSafeNumbers(state);
});

test('加法后溢出被拒绝，而不是把存档中的数字写成 null', () => {
  const state = setup();
  state.player.spiritStones = Number.MAX_SAFE_INTEGER - 1;
  const report = apply(state, { stateUpdates: { spiritStones: { delta: 10 } } });
  assert.equal(state.player.spiritStones, Number.MAX_SAFE_INTEGER - 1);
  assert.ok(hasCode(report, 'numeric_overflow'));
  assertSafeNumbers(state);
  assert.notEqual(JSON.parse(JSON.stringify(state.player)).spiritStones, null);
});

test('非法时间被剔除，界面消费 report.out 不推进日期', () => {
  for (const timeMonths of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    const state = setup();
    const report = apply(state, { timeMonths, flags: { 已见故人: true } });
    assert.ok(report.issues.length > 0);
    advanceTime(state.world, state.player, report.out?.timeMonths ?? 0);
    assert.deepEqual(state.world.date, { year: 1, month: 1, day: 1 });
    assert.equal(state.world.flags.已见故人, true);
  }
});

test('字符串枚举、布尔和战斗对象不会从错误类型隐式转换', () => {
  const state = setup();
  const report = apply(state, { gainType: 'invented', risk: 'fatal', died: 'true', combat: [], realmChange: { realm: '飞升' }, flags: { 合法故事: true } });
  for (const key of ['gainType', 'risk', 'died', 'combat', 'realmChange']) assert.equal(report.out[key], undefined);
  assert.equal(state.player.hp, 100);
  assert.equal(state.player.realm, '凡人');
  assert.equal(state.world.flags.合法故事, true);
});

test('所有列表字段的非数组形状被拒绝，独立合法字段仍落地', () => {
  const fields = ['newNpcs', 'newLocations', 'newSkills', 'newEvents', 'newFactions', 'npcRelations', 'factionRelations', 'hooks', 'itemChanges', 'equipChanges', 'newQuests', 'questUpdates', 'effectRequests', 'retract', 'personalityReveals'];
  for (const field of fields) {
    const state = setup();
    const report = apply(state, { [field]: { bad: true }, stateUpdates: { spiritStones: 1 } });
    assert.ok(hasCode(report, 'invalid_type'), field);
    assert.equal(state.player.spiritStones, 1, field);
  }
});

test('NPC 列表中的坏条目被跳过，合法人物与普通剧情继续保存', () => {
  const state = setup();
  const report = apply(state, { newNpcs: [null, [], 1, 'npc', { name: 42 }, { name: { nested: true } }, { name: '沈青梧', desc: '青衣剑客', temperament: '清冷', personality: '外冷内热' }] });
  assert.deepEqual(state.world.npcs.map((n) => n.name), ['沈青梧']);
  assert.ok(report.issues.length > 0);
  assert.equal(state.world.npcs[0].personality, '外冷内热');
});

test('地点/功法/事件的坏条目不阻止合法条目登记', () => {
  const state = setup();
  const report = apply(state, {
    newLocations: [{ name: [] }, { name: '青云谷', desc: '灵气充沛' }],
    newSkills: [{ name: false }, { name: '青木诀', grade: '基础', desc: '基础功法' }],
    newEvents: [{ subject: [], title: {} }, { subject: '青云谷', title: '到访', desc: '初次抵达' }],
  });
  assert.deepEqual(state.world.locations.map((x) => x.name), ['青云谷']);
  assert.deepEqual(state.world.skills.map((x) => x.name), ['青木诀']);
  assert.equal(state.world.events.filter((x) => x.title === '到访').length, 1);
  assert.ok(report.issues.length > 0);
});

test('叙事 flags 只接受布尔，保留任意合法剧情名称与 closedDoor', () => {
  const state = setup();
  const report = apply(state, { flags: { 已见故人: true, 金丹碎裂: false, closedDoor: true, 文本标记: 'true', 数字标记: 1, 嵌套标记: { value: true } } });
  assert.equal(state.world.flags.已见故人, true);
  assert.equal(state.world.flags.金丹碎裂, false);
  assert.equal(state.world.flags.closedDoor, true);
  for (const key of ['文本标记', '数字标记', '嵌套标记']) assert.equal(Object.hasOwn(state.world.flags, key), false);
  assert.ok(report.issues.length >= 3);
});

test('flags 数组不会合入数字下标键', () => {
  const state = setup();
  const report = apply(state, { flags: [true, false] });
  assert.ok(hasCode(report, 'invalid_type'));
  assert.equal(Object.hasOwn(state.world.flags, '0'), false);
  assert.equal(Object.hasOwn(state.world.flags, '1'), false);
});

test('模型不能伪造代码保留 flags，也不能设 true 伪造濒死/走火入魔', () => {
  const state = setup();
  const report = apply(state, { flags: { deathByRisk: true, eraExpired: true, goalCompleted: true, deathImminent: true, qiDeviation: true, 合法故事: true } });
  for (const key of ['deathByRisk', 'eraExpired', 'goalCompleted', 'deathImminent', 'qiDeviation']) assert.notEqual(state.world.flags[key], true, key);
  assert.equal(state.world.flags.合法故事, true);
  assert.ok(hasCode(report, 'forbidden_flag'));
});

test('明确 false 仍可解除已有濒死和走火入魔', () => {
  const state = setup();
  state.player.hp = 10;
  state.world.flags = { deathImminent: true, qiDeviation: true };
  const report = apply(state, { flags: { deathImminent: false, qiDeviation: false } });
  assert.equal(state.world.flags.deathImminent, false);
  assert.equal(state.world.flags.qiDeviation, false);
  assert.deepEqual(report.issues, []);
});

test('撤回可删除普通剧情标记，但不能删除代码保留标记', () => {
  const state = setup();
  state.world.flags = { deathByRisk: true, eraExpired: true, goalCompleted: true, qiDeviation: true, 普通剧情: true };
  const report = apply(state, { retract: [{ flags: ['deathByRisk', 'eraExpired', 'goalCompleted', 'qiDeviation', '普通剧情'] }] });
  for (const key of ['deathByRisk', 'eraExpired', 'goalCompleted', 'qiDeviation']) assert.equal(state.world.flags[key], true, key);
  assert.equal(state.world.flags.普通剧情, undefined);
  assert.ok(hasCode(report, 'forbidden_flag'));
});

test('原型保留键无法污染根状态或 flags，合法 delta 继续落地', () => {
  const input = JSON.parse('{"__proto__":{"poisoned":true},"constructor":{"prototype":{"poisoned":true}},"flags":{"__proto__":{"poisoned":true},"constructor":true,"prototype":true,"合法故事":true},"stateUpdates":{"spiritStones":3}}');
  const state = setup();
  const originalPrototype = Object.getPrototypeOf(state.world.flags);
  const report = apply(state, input);
  assert.equal(Object.getPrototypeOf(state.world.flags), originalPrototype);
  assert.equal(state.world.flags.poisoned, undefined);
  assert.equal({}.poisoned, undefined);
  assert.equal(state.world.flags.合法故事, true);
  assert.equal(state.player.spiritStones, 3);
  assert.ok(hasCode(report, 'unsafe_key'));
});

test('动态实体名不能从 aliasMap 或关系档案继承原型函数', () => {
  for (const name of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf']) {
    const state = setup();
    assert.doesNotThrow(() => apply(state, {
      newNpcs: [{ name, desc: '测试实体' }],
      npcRelations: [{ name, relation: '道侣' }],
      newEvents: [{ subject: name, title: '初遇', relation: '道侣' }],
    }), name);
    const allowedNames = [name, ...state.world.npcs.map((npc) => npc.name), ...Object.values(state.world.aliasMap).filter((value) => typeof value === 'string')];
    for (const event of state.world.events) {
      assert.equal(typeof event.subject, 'string', name);
      assert.ok(allowedNames.includes(event.subject), name);
    }
    for (const key of Object.keys(state.world.relationDossier || {})) assert.equal(key.includes('[native code]'), false, name);
    assert.equal(Object.hasOwn(Object.prototype.toString, 'relation'), false);
  }
});

test('时间月份乘天数和当前日期加月份后仍需处于安全范围', () => {
  const large = setup();
  const report = apply(large, { timeMonths: Number.MAX_SAFE_INTEGER, eraChange: { type: '秘境将启', months: Number.MAX_SAFE_INTEGER } });
  assert.equal(report.out.timeMonths, undefined);
  assert.equal(report.out.eraChange?.months, undefined);
  assert.ok(hasCode(report, 'invalid_number'));
  const edge = setup();
  edge.world.date = addGameDays({ year: 1, month: 1, day: 1 }, Number.MAX_SAFE_INTEGER - 10);
  const edgeReport = apply(edge, { eraChange: { type: '秘境将启', months: 1 } });
  assert.ok(!edge.world.eraDeadline || daysUntil({ year: 1, month: 1, day: 1 }, edge.world.eraDeadline) !== null);
  assert.ok(hasCode(edgeReport, 'numeric_overflow'));
});

test('物品数量缺失/非法时不凭空补一件，同批合法数量继续登记', () => {
  const state = setup();
  const report = apply(state, { itemChanges: [{ name: '缺数量' }, { name: '无限数量', delta: Infinity }, { name: '字符串数量', delta: '2' }, { name: '合法药丸', kind: '丹药', delta: 2 }] });
  assert.deepEqual(state.world.inventory.map((x) => [x.name, x.qty]), [['合法药丸', 2]]);
  assert.ok(report.issues.length >= 3);
});

test('退款 retract.items 同样要求明确有限数量', () => {
  const state = setup();
  const report = apply(state, { retract: [{ items: [{ name: '缺数量退款' }, { name: '无限退款', delta: Infinity }, { name: '合法退款', delta: 1 }] }] });
  assert.deepEqual(state.world.inventory.map((x) => [x.name, x.qty]), [['合法退款', 1]]);
  assert.ok(report.issues.length >= 2);
});

test('负数或零退款被拒绝，不能取绝对值凭空转成正数物品', () => {
  for (const delta of [-2, 0]) {
    const state = setup();
    const report = apply(state, { retract: [{ items: [{ name: '非法退款', delta }] }] });
    assert.equal(state.world.inventory.length, 0);
    assert.equal(state.world.items.length, 0);
    assert.ok(report.issues.length > 0);
  }
});

test('物品数量加法和步进取整后仍不能越过安全数值范围', () => {
  const state = setup();
  state.world.inventory = [{ name: '药丸', qty: Number.MAX_SAFE_INTEGER, kind: '丹药' }];
  const report = apply(state, { itemChanges: [{ name: '药丸', kind: '丹药', delta: 1 }] });
  assert.equal(state.world.inventory[0].qty, Number.MAX_SAFE_INTEGER);
  assert.ok(hasCode(report, 'numeric_overflow'));
});

test('未知更新字段不进入规范化提案，但合法叙事字符串保留', () => {
  const report = validateStateOutput({ narrative: '你来到青云谷。', mystery: { hp: 0 }, stateUpdates: { spiritStones: 2 } });
  assert.equal(report.out.narrative, '你来到青云谷。');
  assert.equal(report.out.mystery, undefined);
  assert.ok(hasCode(report, 'unknown_field'));
});

test('所有诊断只含静态 code/path/message，不能保存输入值或动态字段名', () => {
  const marker = 'SENSITIVE_SENTINEL_20261021';
  const state = setup();
  const report = apply(state, {
    [marker]: marker,
    stateUpdates: { [marker]: marker, hp: { set: marker } },
    newNpcs: [{ name: { [marker]: marker } }],
    narrative: marker,
  });
  assert.ok(report.issues.length >= 1);
  for (const issue of report.issues) {
    assert.equal(typeof issue.code, 'string');
    assert.equal(typeof issue.path, 'string');
    assert.equal(typeof issue.message, 'string');
    assert.ok(acceptedCodes.has(issue.code), issue.code);
    assert.equal(JSON.stringify(issue).includes(marker), false);
  }
  assert.equal(JSON.stringify(state.world.validationLog).includes(marker), false);
});

test('问题日志限制最近 30 次问题回合且每次至多 10 条，合法回合不写日志', () => {
  const state = setup();
  apply(state, { flags: { 合法故事: true } });
  assert.equal((state.world.validationLog || []).length, 0);
  for (let i = 0; i < 45; i += 1) {
    state.world.turn = i;
    apply(state, { newNpcs: Array.from({ length: 20 }, () => ({ name: 12 })) });
  }
  assert.equal(state.world.validationLog.length, 30);
  for (const entry of state.world.validationLog) {
    assert.equal(typeof entry.turn, 'number');
    assert.ok(['partial', 'rejected'].includes(entry.result));
    assert.ok(Array.isArray(entry.issues));
    assert.ok(entry.issues.length > 0 && entry.issues.length <= 10);
  }
});

test('任务终态×后续状态矩阵：状态/期限/事迹均不能被改写', () => {
  for (const from of ['completed', 'failed', 'cancelled']) {
    for (const to of ['active', 'completed', 'failed', 'cancelled']) {
      const state = setup();
      const quest = { title: '历史委托', status: from, timeNode: '三日内', deadlineDate: { year: 1, month: 1, day: 4 }, deadlinePending: false, deadlineVersion: 2 };
      state.world.quests = [quest];
      const before = structuredClone(quest);
      const report = apply(state, { questUpdates: [{ title: quest.title, status: to, note: '新事迹应忽略', deadlineDays: 99, timeNode: '改期' }] });
      assert.deepEqual(quest, before, `${from}->${to}`);
      assert.equal(state.world.events.length, 0, `${from}->${to}`);
      if (to !== from) assert.ok(report.issues.length > 0, `${from}->${to}`);
    }
  }
});

test('active 任务正常完成/失败并记录一次，重复相同终态安静幂等', () => {
  for (const status of ['completed', 'failed']) {
    const state = setup();
    state.world.quests = [{ title: '当前委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
    apply(state, { questUpdates: [{ title: '当前委托', status, note: '实际结果' }] });
    assert.equal(state.world.quests[0].status, status);
    assert.equal(state.world.events.length, 1);
    const second = apply(state, { questUpdates: [{ title: '当前委托', status, note: '不能补造里程碑' }] });
    assert.equal(state.world.events.length, 1);
    assert.deepEqual(second.issues, []);
  }
});

test('同批同任务完成/失败冲突则整项拒绝，不取数组最后一项', () => {
  for (const statuses of [['completed', 'failed'], ['failed', 'completed']]) {
    const state = setup();
    state.world.quests = [{ title: '矛盾委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
    const report = apply(state, { questUpdates: statuses.map((status) => ({ title: '矛盾委托', status, note: '互相矛盾' })), stateUpdates: { spiritStones: 2 } });
    assert.equal(state.world.quests[0].status, 'active');
    assert.equal(state.world.events.length, 0);
    assert.equal(state.player.spiritStones, 2);
    assert.ok(hasCode(report, 'conflicting_quest_updates'));
  }
});

test('同批冲突按任务隔离，不阻止另一个合法任务完成', () => {
  const state = setup();
  state.world.quests = ['矛盾任务', '正常任务'].map((title) => ({ title, status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }));
  apply(state, { questUpdates: [{ title: '矛盾任务', status: 'completed' }, { title: '正常任务', status: 'completed' }, { title: '矛盾任务', status: 'failed' }] });
  assert.equal(state.world.quests[0].status, 'active');
  assert.equal(state.world.quests[1].status, 'completed');
  assert.equal(state.world.events.length, 1);
  assert.equal(state.world.events[0].subject, '正常任务');
});

test('同批重复完成是一次状态迁移和一条事迹', () => {
  const state = setup();
  state.world.quests = [{ title: '重复完成', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
  apply(state, { questUpdates: [{ title: '重复完成', status: 'completed' }, { title: '重复完成', status: 'completed' }] });
  assert.equal(state.world.quests[0].status, 'completed');
  assert.equal(state.world.events.length, 1);
});

test('newEvents 的系统状态标签不能与同批真实任务结算产生相反事迹', () => {
  for (const [status, title] of [['failed', '已完成'], ['completed', '已失败']]) {
    const state = setup();
    state.world.quests = [{ title: '结算委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
    apply(state, { newEvents: [{ subject: '结算委托', title, desc: '错误叙事状态' }], questUpdates: [{ title: '结算委托', status, note: '真实任务结果' }] });
    assert.equal(state.world.quests[0].status, status);
    const events = state.world.events.filter((event) => event.subject === '结算委托');
    assert.equal(events.length, 1);
    assert.equal(events[0].title, status === 'completed' ? '已完成' : '已失败');
  }
});

test('同批任务状态冲突不能借 newEvents 绕过拒绝', () => {
  const state = setup();
  state.world.quests = [{ title: '冲突委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
  const report = apply(state, { newEvents: [{ subject: '冲突委托', title: '已完成' }], questUpdates: [{ title: '冲突委托', status: 'completed' }, { title: '冲突委托', status: 'failed' }] });
  assert.equal(state.world.quests[0].status, 'active');
  assert.equal(state.world.events.length, 0);
  assert.ok(hasCode(report, 'conflicting_quest_updates'));
});

test('仅有 newEvents 系统状态标签不能伪造任务完成/失败/放弃', () => {
  for (const title of ['已完成', '已失败', '已失败（超时）', '已放弃']) {
    const state = setup();
    state.world.quests = [{ title: '进行中委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
    apply(state, { newEvents: [{ subject: '进行中委托', title }] });
    assert.equal(state.world.quests[0].status, 'active');
    assert.equal(state.world.events.length, 0);
  }
});

test('同批刚登记的新任务也不能被 newEvents 伪造为已完成', () => {
  const state = setup();
  apply(state, { newQuests: [{ title: '新委托', objective: '取药', reward: '灵石' }], newEvents: [{ subject: '新委托', title: '已完成' }] });
  assert.equal(state.world.quests.find((q) => q.title === '新委托').status, 'active');
  assert.equal(state.world.events.filter((event) => event.subject === '新委托').length, 0);
});

test('模型不能把 active 任务自行切换为玩家主动放弃状态', () => {
  const state = setup();
  state.world.quests = [{ title: '未放弃委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false }];
  const report = apply(state, { questUpdates: [{ title: '未放弃委托', status: 'cancelled' }] });
  assert.equal(state.world.quests[0].status, 'active');
  assert.equal(state.world.events.length, 0);
  assert.ok(hasCode(report, 'terminal_quest'));
});

test('非法期限仍是待确认，不被校验器静默改成无期限', () => {
  const state = setup();
  const report = apply(state, { newQuests: [{ title: '坏期限', objective: '取药', reward: '灵石', deadlineDays: Infinity }] });
  const quest = state.world.quests.find((q) => q.title === '坏期限');
  assert.ok(quest);
  assert.equal(quest.deadlinePending, true);
  assert.equal(quest.deadlineDate, null);
  assert.ok(report.issues.length > 0);
  state.world.date = { year: 100, month: 1, day: 1 };
  assert.deepEqual(expireQuestDeadlines(state.player, state.world), []);
});

test('待确认旧任务合法补录日期仍可用，终态保护不阻断第一轮兼容路径', () => {
  const state = setup();
  state.world.quests = [{ title: '旧委托', status: 'active', deadlineTurn: 8, timeNode: '明日' }];
  apply(state, { questUpdates: [{ title: '旧委托', deadlineDays: 1, timeNode: '明日' }] });
  assert.equal(state.world.quests[0].legacyDeadlineTurn, 8);
  assert.equal(state.world.quests[0].deadlinePending, false);
  assert.deepEqual(state.world.quests[0].deadlineDate, { year: 1, month: 1, day: 2 });
});

test('任务对象引用不被整包替换，调用方持有的引用保持有效', () => {
  const state = setup();
  const originalQuests = state.world.quests;
  const quest = { title: '引用委托', status: 'active', deadlineVersion: 2, deadlineDate: null, deadlinePending: false };
  state.world.quests.push(quest);
  const worldRef = state.world;
  apply(state, { questUpdates: [{ title: quest.title, status: 'completed' }] });
  assert.equal(state.world, worldRef);
  assert.equal(state.world.quests, originalQuests);
  assert.equal(state.world.quests.find((q) => q.title === quest.title), quest);
  assert.equal(quest.status, 'completed');
});
