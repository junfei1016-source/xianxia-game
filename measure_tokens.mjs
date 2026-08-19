// 临时诊断：量一下每回合发给 LLM 的输入规模（近似 token：中文约 1 字≈1 token）
import {
  newPlayerState, newWorldState, buildGMMessages, buildGMCombinedMessages, buildExtractMessages,
  buildWorldGenMessages, buildSummaryMessages,
} from './public/game.js';

const ch = (s) => (s || '').length;
const tok = (s) => Math.round(ch(s) / 1); // 中文粗略 1 字 ≈ 1 token

function summarize(name, msgs) {
  const sizes = msgs.map((m) => tok(m.content));
  console.log(`\n【${name}】消息数 ${msgs.length}，输入合计 ≈ ${sizes.reduce((a, b) => a + b, 0)} token`);
  msgs.forEach((m, i) => console.log(`  ${m.role}(${i}) ≈ ${sizes[i]} token`));
}

// 1) 开局世界生成
const gen = buildWorldGenMessages('random', {});
summarize('开局创世', gen);

// 2) 全新局：慢节奏两段式（GM 叙事 + 状态提取）
const p = newPlayerState();
const w = newWorldState();
const gm = buildGMMessages(p, w, [], '闭关修炼');
summarize('慢节奏·GM 叙事（新局）', gm);
const ex = buildExtractMessages('你闭关三个月，修为精进。', p, w);
summarize('慢节奏·状态提取（新局）', ex);

// 3) 全新局：快节奏合并式（单次调用）
const combined = buildGMCombinedMessages(p, w, [], '闭关修炼');
summarize('快节奏·合并式（新局）', combined);

// 4) 模拟"后期世界"膨胀：填满 NPC/事件/物品/记忆/任务
const w2 = newWorldState();
for (let i = 0; i < 20; i++) w2.npcs.push({ name: '苏瑶' + i, desc: '一位修士的详细描述，出身、性格、动机都写清楚，大约几十个字。', relation: '挚友', personality: '傲娇' });
for (let i = 0; i < 40; i++) w2.events.push({ subject: '苏瑶', title: '事件' + i, desc: '一段较长的剧情记录，记录当时的因果与关系变化，几十个字左右。', relation: '挚友', turn: i, date: '1年1月', stage: '炼气初期' });
for (let i = 0; i < 20; i++) w2.items.push({ name: '法宝' + i, desc: '某件法宝的来历与用途，几十个字的说明。' });
for (let i = 0; i < 15; i++) w2.inventory.push({ name: '丹药' + i, desc: '丹药说明', qty: 3 });
for (let i = 0; i < 6; i++) w2.quests.push({ id: 'q' + i, type: 'side', title: '支线任务' + i, desc: '任务详情', objective: '目标', timeNode: '三日内', reward: '灵石', status: 'active' });
w2.memory = '这是一段长期剧情记忆。'.repeat(80); // 约 800 字
const gm2 = buildGMMessages(p, w2, [], '闭关修炼');
summarize('慢节奏·GM 叙事（后期膨胀世界）', gm2);

// 5) 历史窗口贡献：12 回合 × 每回合约 250 字叙事 + 30 字行动
const hist = [];
for (let i = 0; i < 12; i++) {
  hist.push({ role: 'user', content: '我闭关修炼冲击瓶颈，顺便寻访机缘。' });
  hist.push({ role: 'assistant', content: '（这是一段约两百五十字的仙侠叙事，用于估算历史窗口对每回合输入的贡献。它包含了环境描写、人物对话、剧情推进与数值变化的自然表述，字数大致如此。）' });
}
const gm3 = buildGMMessages(p, w, hist, '闭关修炼');
summarize('慢节奏·GM 叙事（含 12 回合历史）', gm3);

console.log('\n=== 小结 ===');
console.log('慢节奏每回合输入 = GM + 提取（新局）≈', tok(gm.reduce((a, x) => a + x.content, '')) + tok(ex.reduce((a, x) => a + x.content, '')) - 0, 'token（不含输出）');
console.log('快节奏每回合输入（新局）≈', tok(combined.reduce((a, x) => a + x.content, '')), 'token（单次调用，不含输出）');
