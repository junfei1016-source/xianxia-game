// 防幻觉：剧情撤回机制 + 反编造规则
import {
  newPlayerState, newWorldState, applyStateUpdates, buildGMMessages, buildSummaryMessages,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 撤回：按标题删除事迹 ----------
const p1 = newPlayerState();
const w1 = newWorldState();
applyStateUpdates(p1, w1, { newEvents: [
  { subject: '燕绥', title: '助燕绥剿灭紫云盗', desc: '围杀曹谦' },
  { subject: '燕绥', title: '初遇', desc: '东郊相识' },
] });
applyStateUpdates(p1, w1, { retract: [{ titles: ['助燕绥剿灭紫云盗'] }] });
assert('按标题撤回：假事迹被删', !w1.events.some((e) => e.title === '助燕绥剿灭紫云盗'));
assert('按标题撤回：其余事迹保留', w1.events.some((e) => e.title === '初遇'));

// ---------- 2. 撤回：只给主体时整条脉络删 + 关系档案删 ----------
const p2 = newPlayerState();
const w2 = newWorldState();
w2.npcs = [{ name: '燕绥', relation: '', desc: '' }];
applyStateUpdates(p2, w2, {
  newEvents: [
    { subject: '燕绥', title: '初遇', desc: 'x', relation: '道友' },
    { subject: '燕绥', title: '联手', desc: 'x', relation: '道友' },
  ],
});
assert('档案已建', w2.relationDossier['燕绥'] && w2.relationDossier['燕绥'].milestones.length === 2);
applyStateUpdates(p2, w2, { retract: [{ subjects: ['燕绥'] }] });
assert('主体撤回：整条事迹脉络删除', !w2.events.some((e) => e.subject === '燕绥'));
assert('主体撤回：关系档案删除', !w2.relationDossier['燕绥']);

// ---------- 3. 撤回：主体+标题只删对应里程碑 ----------
const p3 = newPlayerState();
const w3 = newWorldState();
w3.npcs = [{ name: '柳如烟', relation: '', desc: '' }];
applyStateUpdates(p3, w3, { newEvents: [
  { subject: '柳如烟', title: '定情', desc: 'x', relation: '暧昧' },
  { subject: '柳如烟', title: '共游', desc: 'x', relation: '暧昧' },
] });
applyStateUpdates(p3, w3, { retract: [{ subjects: ['柳如烟'], titles: ['共游'] }] });
assert('主体+标题：只删对应里程碑', w3.relationDossier['柳如烟'].milestones.length === 1 && w3.relationDossier['柳如烟'].milestones[0].title === '定情');

// ---------- 4. 撤回：剧情标记删除 ----------
const p4 = newPlayerState();
const w4 = newWorldState();
w4.flags = { 紫云盗覆灭: true, 帮主曹谦伏诛: true, 正常标记: true };
applyStateUpdates(p4, w4, { retract: [{ flags: ['紫云盗覆灭', '帮主曹谦伏诛'] }] });
assert('撤回标记删除', w4.flags['紫云盗覆灭'] === undefined && w4.flags['帮主曹谦伏诛'] === undefined);
assert('无关标记保留', w4.flags['正常标记'] === true);

// ---------- 5. 反编造规则注入 GM ----------
const g = buildGMMessages(newPlayerState(), newWorldState(), [], 'x');
const rules = g.find((m) => m.role === 'system' && m.content.includes('剧情真实'));
assert('GM 规则含「剧情真实（防幻觉）」', !!rules);
assert('GM 规则要求传闻标注', rules && rules.content.includes('传闻'));
assert('GM 规则禁止编造经历', rules && rules.content.includes('绝对禁止编造'));

// ---------- 6. 压缩提示词忠实性 ----------
const sum = buildSummaryMessages([]);
const sys = sum.find((m) => m.role === 'system').content;
assert('压缩提示词要求忠实输入', sys.includes('忠实') && sys.includes('禁止虚构'));

// ---------- 7. 误耗物品补回（retract.items） ----------
const p5 = newPlayerState();
const w5 = newWorldState();
applyStateUpdates(p5, w5, { itemChanges: [{ name: '百转培元丹', desc: '灵品丹药', delta: -1, kind: '丹药' }, { name: '培元丹', desc: 'x', delta: -1, kind: '丹药' }] });
assert('误耗后两样都扣了', w5.inventory.length === 0);
applyStateUpdates(p5, w5, { retract: [{ items: [{ name: '百转培元丹', delta: 1 }] }] });
assert('补回被误耗的百转培元丹', w5.inventory.some((t) => t.name === '百转培元丹' && t.qty === 1));

// ---------- 8. 防认错规则注入 ----------
const g2 = buildGMMessages(newPlayerState(), newWorldState(), [], 'x');
const itemRule = g2.find((m) => m.role === 'system' && m.content.includes('物品使用（防认错）'));
assert('GM 规则含「物品使用（防认错）」', !!itemRule);
assert('规则要求逐字一致', itemRule && itemRule.content.includes('逐字一致') && itemRule.content.includes('绝不替换'));

console.log(fails === 0 ? '\n✅ 防幻觉测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
