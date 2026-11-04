// NPC 性格三级渐进揭示：陌生 → 初识（气质）→ 深交（真实性格）
import {
  newPlayerState, newWorldState, applyStateUpdates, buildGMMessages, buildExtractMessages, npcInsightStage,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 登场时保存气质与真实性格 ----------
const p = newPlayerState();
const w = newWorldState();
applyStateUpdates(p, w, { newNpcs: [{ name: '柳如烟', desc: 'x', temperament: '清冷', personality: '面冷心热' }] });
const n = w.npcs[0];
assert('气质字段保存', n.temperament === '清冷');
assert('真实性格字段保存', n.personality === '面冷心热');
assert('初始阶段为陌生', npcInsightStage(n) === 'unknown');

// ---------- 2. 互动次数推进到初识 ----------
applyStateUpdates(p, w, { newEvents: [{ subject: '柳如烟', title: '夜约', desc: 'x', relation: '' }] });
assert('一次互动 → 初识', npcInsightStage(w.npcs[0]) === 'acquaintance');
assert('互动次数为 1', w.npcs[0].interactionCount === 1);
// 同回合同一 NPC 两次事件只计一次
applyStateUpdates(p, w, { newEvents: [
  { subject: '柳如烟', title: 'a', desc: 'x' },
  { subject: '柳如烟', title: 'b', desc: 'x' },
] });
assert('同回合两次互动只计一次', w.npcs[0].interactionCount === 2);

// ---------- 3. 长期关系 → 深交揭示 ----------
const p2 = newPlayerState();
const w2 = newWorldState();
applyStateUpdates(p2, w2, { newNpcs: [{ name: '苏瑶', desc: 'x', temperament: '温柔', personality: '外柔内刚' }] });
applyStateUpdates(p2, w2, { npcRelations: [{ name: '苏瑶', relation: '道侣' }] });
assert('结成道侣 → 深交揭示真实性格', npcInsightStage(w2.npcs[0]) === 'insight' && w2.npcs[0].personalityRevealed === true);

// ---------- 4. 叙事看透 → 深交揭示（personalityReveals） ----------
const p3 = newPlayerState();
const w3 = newWorldState();
applyStateUpdates(p3, w3, { newNpcs: [{ name: '岳青锋', desc: 'x', temperament: '豪爽', personality: '伪君子' }] });
applyStateUpdates(p3, w3, { personalityReveals: [{ name: '岳青锋' }] });
assert('叙事看透 → 深交揭示', npcInsightStage(w3.npcs[0]) === 'insight');

// ---------- 5. 无气质 NPC：互动后仍显示未明 ----------
const p4 = newPlayerState();
const w4 = newWorldState();
applyStateUpdates(p4, w4, { newNpcs: [{ name: '路人甲', desc: 'x' }] });
applyStateUpdates(p4, w4, { newEvents: [{ subject: '路人甲', title: '初遇', desc: 'x' }] });
assert('无气质的 NPC 互动后仍为未明', npcInsightStage(w4.npcs[0]) === 'unknown');

// ---------- 6. 规则注入 ----------
const g = buildGMMessages(newPlayerState(), newWorldState(), [], 'x');
const rule = g.find((m) => m.role === 'system' && m.content.includes('复杂人性'));
assert('复杂人性规则含外显气质', rule && rule.content.includes('外显气质'));
assert('复杂人性规则含性格不漂移', rule && rule.content.includes('不得漂移'));
const em = buildExtractMessages('测试叙事', newPlayerState(), newWorldState());
assert('提取器 schema 含 personalityReveals', em[0].content.includes('personalityReveals'));

console.log(fails === 0 ? '\n✅ 性格揭示测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
