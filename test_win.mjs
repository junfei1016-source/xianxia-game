// 自动闯关：用 deepseek-v4-flash 驱动一局，目标打到「飞升成仙」通关
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, buildSummaryMessages, applyStateUpdates,
  parseLLMJSON, newPlayerState, newWorldState, evaluateEndings, evaluateAchievements, realmIndex, REALM_LADDER,
  breakthroughNeed,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-v4-flash';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';
const MAX_TURNS = Number(process.env.DSH_TURNS || 50);
if (!API_KEY) { console.error('缺少 Key'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(messages, json) {
  const payload = { baseUrl: BASE_URL, apiKey: API_KEY, model: MODEL, messages, temperature: 0.8 };
  if (json) payload.response_format = { type: 'json_object' };
  const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const err = data?.error?.message || data?.error || text;
    const e = new Error(`HTTP ${res.status}: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
    e.status = res.status; throw e;
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型返回为空');
  return content;
}
async function call(messages, json = true) {
  let lastErr = null, emptyFail = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const c = await callOnce(messages, json);
      if (c.trim()) return c;
      throw new Error('模型返回为空');
    } catch (e) {
      lastErr = e;
      if (e.message === '模型返回为空') { emptyFail = true; if (attempt < 3) { await sleep(2000 * attempt); } continue; }
      if ((e.status === 429 || e.status >= 500) && attempt < 3) { await sleep(2000 * attempt); continue; }
      break;
    }
  }
  if (json && emptyFail) {
    try { const c = await callOnce(messages, false); if (c.trim()) return c; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('模型调用失败');
}

const player = newPlayerState();
const world = newWorldState();
world.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, cultGain: process.env.DSH_GAIN || '3x' };
let history = [];

console.log('=== 创世 ===');
{
  const raw = await call(buildWorldGenMessages('random', {}));
  const seed = parseLLMJSON(raw);
  if (seed?.player) {
    player.name = seed.player.name || player.name;
    player.origin = seed.player.origin || '';
    player.backstory = seed.player.backstory || '';
    if (typeof seed.player.spiritStones === 'number') player.spiritStones = seed.player.spiritStones;
  }
  world.era = seed?.era || '';
  console.log('姓名:', player.name, '| 出身:', player.origin, '| 大势:', world.era);
}

const actions = [
  '我寻访名山大川，寻找上古修士留下的传承洞府。',
  '我闭关苦修，运转功法冲击当前境界的瓶颈。',
  '我深入秘境，搜寻能助我突破的灵药与丹药。',
  '我向修为高深的前辈请教，参悟大道至理。',
  '我冒着危险探访险地，以求机缘突破。',
  '我闭关潜修，一心冲击更高境界。',
];

// 演示智能体：用 AI 生成策略性行动（与 DM 用同一模型，即 MODEL）
const DEMO_BRAIN_PROMPT = `你是一个"武侠·修仙"开放世界文字游戏里的玩家，正在扮演一位修士，目标是通过修炼、寻找机缘，最终渡劫飞升成仙。

根据"当前状态"和"最近发生"的事，输出一句你的下一步行动（第一人称，20~50字，直接写动作，不要任何解释或前缀）。

行动要：
- 有策略、符合修仙者的目标（提升修为、寻找机缘、完成任务、应对危险）。
- 随机应变：修为圆满就寻机缘破境；缺灵石就接委托或做买卖；遇到危险要懂得避让或应对；有未了之事就去处理。
- 早期（凡人、炼气阶段）以修炼提升修为为主，至少每 2~3 回合就闭关修炼一次；但探索、任务、奇遇、越级杀敌同样能变强，可穿插进行，不必一味闭关。
- 闭关时直接说明时长（如"闭关三个月"乃至"闭关十年"），一次闭关可跨越数月/数年、一次顶多次，不必逐回合修炼。
- 可主动挑战境界高于自己的强敌（越级杀敌）：成功可得高级功法/法宝/武器、加速成长，但要权衡生死风险。
- 不要一直重复同一件事，也不要空口索要逆天之物。

示例：
"我继续闭关修炼，冲击当前境界的瓶颈。"
"我四处打听附近有没有机缘或委托可接。"`;

function strategyHint() {
  const c = player.cultivation || 0;
  const need = breakthroughNeed(player.realm);
  if (c < need) return `\n【当前修为 ${c}%，本阶参考门槛 ${need}%，应闭关修炼提升修为。】`;
  if (c < 100) return `\n【修为已达门槛（当前 ${c}%），再闭关一次即可圆满；圆满后可直接破境。】`;
  return `\n【修为已圆满（100%），可直接突破到下一境界，无需再等机缘。】`;
}
function ensureCultivation(action) {
  const PRODUCTIVE = ['修炼', '闭关', '打坐', '吐纳', '参悟', '练功', '凝气', '引气', '突破', '运功', '周天', '冲击'];
  if ((player.cultivation || 0) >= 100) return action;
  if (!action || PRODUCTIVE.some((w) => action.includes(w))) return action;
  return '我闭关修炼，运转功法提升修为。';
}

async function generateAction() {
  const snapshot = JSON.stringify({ player, world: { era: world.era, goal: world.goal, turn: world.turn } });
  const recent = history.slice(-6).map((m) => (m.role === 'user' ? '你：' : '世界：') + m.content).join('\n');
  const messages = [
    { role: 'system', content: DEMO_BRAIN_PROMPT },
    { role: 'user', content: `当前状态：${snapshot}\n最近发生：\n${recent}${strategyHint()}\n\n请给出你的下一步行动（一句话，20~50字）：` },
  ];
  const action = await call(messages, false);
  return ensureCultivation(action.trim());
}

let win = false;
for (let t = 1; t <= MAX_TURNS; t++) {
  let text;
  try {
    text = await generateAction();
  } catch {
    text = actions[(t - 1) % actions.length];
  }
  if (!text) text = actions[(t - 1) % actions.length];
  try {
    // 叙事（非 JSON）
    const raw = await call(buildGMMessages(player, world, history, text), false);
    const narrative = raw.trim();
    // 状态提取
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    // 记忆压缩
    if (history.length > 16) {
      const overflow = history.slice(0, history.length - 16);
      try {
        const s = await call(buildSummaryMessages(overflow), false);
        world.memory = (world.memory ? world.memory + '\n' : '') + s.trim();
        history = history.slice(overflow.length);
      } catch { /* 忽略压缩失败 */ }
    }
    // 成就
    const ach = evaluateAchievements(player, world);
    if (ach.length) { world.achievements.push(...ach); console.log('  🏆 成就:', ach.join('、')); }

    const ri = realmIndex(player.realm);
    const total = REALM_LADDER.length - 1;
    const prog = out?.realmChange ? ` ↪ 突破→${out.realmChange}` : '';
    console.log(`回合${String(t).padStart(2)} | 境界 ${player.realm}(${ri}/${total}) | 修为${player.cultivation}% | 灵石${player.spiritStones}${prog}`);

    const ending = evaluateEndings(player);
    if (ending) {
      console.log('\n════ 结局触发 ════');
      console.log('结局:', ending.title, '| 主目标(飞升)达成:', ending.win);
      console.log(ending.text);
      win = ending.win;
      break;
    }
  } catch (e) {
    console.log(`回合${t} 出错: ${e.message}`);
  }
  await sleep(1500);
}

console.log('\n=== 闯关结束 ===');
console.log('最终境界:', player.realm, '| 是否飞升通关:', player.realm === '飞升' || win);
console.log('已解锁成就:', world.achievements.join('、') || '无');
