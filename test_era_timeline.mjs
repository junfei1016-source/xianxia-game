// 大势时间轴：期限到必演变（先给 GM 一回合收束，否则引擎强制）
import {
  newWorldState, addMonths, dateAfter, enforceEraTimeline, applyStateUpdates, newPlayerState, buildGMMessages,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 日期工具 ----------
assert('加三个月', (() => { const d = addMonths({ year: 1, month: 1, day: 15 }, 3); return d.year === 1 && d.month === 4 && d.day === 15; })());
assert('跨年加月', (() => { const d = addMonths({ year: 1, month: 11, day: 1 }, 3); return d.year === 2 && d.month === 2; })());
assert('日期比较', dateAfter({ year: 1, month: 5, day: 1 }, { year: 1, month: 4, day: 30 }) === true && dateAfter({ year: 1, month: 4, day: 1 }, { year: 1, month: 4, day: 1 }) === false);

// ---------- 2. 秘境将启自动设三月之期 ----------
const w = newWorldState();
w.eraType = '秘境将启';
w.date = { year: 1, month: 1, day: 1 };
const n1 = enforceEraTimeline(w, null);
assert('无期限时自动设三月之期', w.eraDeadline && w.eraDeadline.year === 1 && w.eraDeadline.month === 4);
assert('未到期不提示', n1 === null);

// ---------- 3. 到期：先给 GM 一回合收束 ----------
w.date = { year: 1, month: 5, day: 1 };
const n2 = enforceEraTimeline(w, null);
assert('到期后标记 eraExpired 并给一句征兆（不报时代名）', w.flags.eraExpired === true && !!n2 && /该来的|天色|坊市/.test(n2) && !/盛世|乱世|末法|秘境将启|正魔大战/.test(n2));
assert('GM 本回合已收束 → 不强制、清标记', (() => { const w2 = newWorldState(); w2.eraType = '秘境将启'; w2.date = { year: 1, month: 5, day: 1 }; enforceEraTimeline(w2, null); return enforceEraTimeline(w2, { eraChange: { type: '乱世' } }) === null && w2.flags.eraExpired === false; })());

// ---------- 4. 连续两回合未收束 → 引擎强制演变 ----------
const w3 = newWorldState();
w3.eraType = '秘境将启';
w3.era = '秘境三月后开启';
w3.date = { year: 1, month: 5, day: 1 };
w3.eraDeadline = { year: 1, month: 4, day: 1 }; // 期限已过
enforceEraTimeline(w3, null); // 第一次：标记，给 GM 收束机会
const n3 = enforceEraTimeline(w3, null); // 第二次：强制
assert('强制演变为乱世', w3.eraType === '乱世' && !w3.eraDeadline && w3.flags.eraExpired === false);
assert('强制演变提示只说现象、不说“乱世”二字', !!n3 && /秘境现世|散修|货价/.test(n3) && !/乱世/.test(n3));

// ---------- 5. eraChange 带期限 → 设截止日；无期限 → 清除 ----------
const p = newPlayerState();
const w4 = newWorldState();
applyStateUpdates(p, w4, { eraChange: { type: '秘境将启', text: '三月后开启', months: 3 } });
assert('eraChange 带期限设置截止日', w4.eraDeadline && w4.eraDeadline.month === 4);
applyStateUpdates(p, w4, { eraChange: { type: '盛世', text: '天下太平' } });
assert('eraChange 无期限清除截止日', w4.eraDeadline === undefined);

// ---------- 6. GM 指引注入【大势到期】 ----------
const w5 = newWorldState();
w5.flags = { eraExpired: true };
const g = buildGMMessages(newPlayerState(), w5, [], 'x');
assert('到期时注入【天时该变了】指引', g.some((m) => m.role === 'system' && m.content.includes('【天时该变了】')));
const w6 = newWorldState();
assert('未到期不注入', !buildGMMessages(newPlayerState(), w6, [], 'x').some((m) => m.role === 'system' && m.content.includes('【天时该变了】')));

// ---------- 7. 无期限大势忽略旧期限（切走秘境将启后不误报） ----------
const w7 = newWorldState();
w7.eraType = '乱世';
w7.date = { year: 1, month: 5, day: 1 };
w7.eraDeadline = { year: 1, month: 4, day: 1 }; // 旧期限残留
w7.flags = { eraExpired: true };
const n7 = enforceEraTimeline(w7, null);
assert('乱世忽略旧期限：不提示不强制', n7 === null && w7.eraType === '乱世' && w7.eraDeadline === undefined && w7.flags.eraExpired === false);
// 从无期限转回秘境将启 → 自动重新设期
const w8 = newWorldState();
w8.eraType = '乱世';
w8.date = { year: 2, month: 1, day: 1 };
enforceEraTimeline(w8, null);
w8.eraType = '秘境将启';
enforceEraTimeline(w8, null);
assert('转回秘境将启自动设三月之期', w8.eraDeadline && w8.eraDeadline.year === 2 && w8.eraDeadline.month === 4);

console.log(fails === 0 ? '\n✅ 大势时间轴测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
