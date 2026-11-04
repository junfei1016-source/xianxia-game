// 长期记忆：关系档案（防 GM 遗忘感情线）+ 记忆窗口 + 压缩提示词升级
import {
  newPlayerState, newWorldState, applyStateUpdates, buildWorldContext, buildGMMessages, buildSummaryMessages, compactDossier,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 关系档案维护 ----------
const p = newPlayerState();
const w = newWorldState();
w.npcs = [{ name: '柳如烟', relation: '', desc: '' }];
applyStateUpdates(p, w, {
  npcRelations: [{ name: '柳如烟', relation: '暧昧' }],
  newEvents: [{ subject: '柳如烟', title: '定情', desc: '山神庙一夜，互诉衷肠', relation: '暧昧' }],
});
assert('档案建档（2 条里程碑）', w.relationDossier['柳如烟'] && w.relationDossier['柳如烟'].milestones.length === 2);
assert('当前关系更新为暧昧', w.relationDossier['柳如烟'].relation === '暧昧');
assert('里程碑带回合号', w.relationDossier['柳如烟'].milestones.every((m) => typeof m.turn === 'number'));
// 同回合同题去重
applyStateUpdates(p, w, { npcRelations: [{ name: '柳如烟', relation: '暧昧' }] });
assert('同回合同关系不重复记', w.relationDossier['柳如烟'].milestones.length === 2);
// 上限 12 且保留首个
for (let i = 0; i < 20; i++) {
  applyStateUpdates(p, w, { newEvents: [{ subject: '柳如烟', title: '事件' + i, relation: '暧昧' }] });
}
const ms = w.relationDossier['柳如烟'].milestones;
assert('里程碑上限 12', ms.length === 12);
assert('首个里程碑保留', ms[0].title === '关系：暧昧');
// 无关系词条的人物事件也进档案（subject 是 NPC）
const wb = newWorldState();
wb.npcs = [{ name: '王铁山', relation: '', desc: '' }];
applyStateUpdates(p, wb, { newEvents: [{ subject: '王铁山', title: '初遇', desc: '客栈喝酒' }] });
assert('NPC 事件自动进档案', wb.relationDossier['王铁山'] && wb.relationDossier['王铁山'].milestones.length === 1);

// ---------- 2. compactDossier ----------
const wc = newWorldState();
wc.relationDossier = {};
for (let i = 0; i < 10; i++) {
  wc.relationDossier['路人' + i] = { relation: '', milestones: [{ turn: i, title: '初遇', note: '' }] };
}
wc.relationDossier['苏瑶'] = { relation: '道侣', milestones: [{ turn: 99, title: '成婚', note: '拜堂成亲' }] };
const cd = compactDossier(wc);
assert('活跃关系排第一', cd[0].name === '苏瑶');
assert('档案上限 8 条', cd.length === 8);
assert('里程碑截取最近 6 条', cd.every((e) => e.ms.length <= 6));
assert('空档案返回 undefined', compactDossier(newWorldState()) === undefined);

// ---------- 3. 世界快照携带档案 ----------
const ctx = buildWorldContext(wc);
assert('快照含关系档案', Array.isArray(ctx.relationDossier) && ctx.relationDossier[0].name === '苏瑶');
assert('无档案时字段为 undefined（JSON 序列化自动省略）', buildWorldContext(newWorldState()).relationDossier === undefined);

// ---------- 4. GM 指引注入 ----------
const wd = newWorldState();
wd.relationDossier = { '柳如烟': { relation: '暧昧', milestones: [{ turn: 5, title: '定情', note: '' }] } };
const g1 = buildGMMessages(newPlayerState(), wd, [], '测试').find((m) => m.role === 'system' && m.content.includes('【关系档案】'));
assert('有档案时注入【关系档案】', !!g1 && g1.content.includes('柳如烟') && g1.content.includes('暧昧'));
assert('指引要求履行约定', g1 && g1.content.includes('约定'));
const wEmpty = newWorldState();
assert('无档案不注入', !buildGMMessages(newPlayerState(), wEmpty, [], 'x').some((m) => m.role === 'system' && m.content.includes('【关系档案】')));

// ---------- 5. 记忆窗口扩容 ----------
const we = newWorldState();
we.memory = '忆'.repeat(3000);
const cte = buildWorldContext(we);
assert('记忆快照上限 1000 字', cte.memory.length === 1000);

// ---------- 6. 压缩提示词强调关系进度 ----------
const sum = buildSummaryMessages([]);
const sys = sum.find((m) => m.role === 'system').content;
assert('压缩提示词强调感情线进度', sys.includes('感情线') && sys.includes('进度'));
assert('压缩提示词强调承诺', sys.includes('承诺'));

console.log(fails === 0 ? '\n✅ 长期记忆测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
