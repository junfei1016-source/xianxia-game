// 化神后期起跑，验证"渡劫准备 → 飞升"链路
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, buildSummaryMessages, applyStateUpdates,
  parseLLMJSON, newPlayerState, newWorldState, evaluateEndings, realmIndex, REALM_LADDER,
  breakthroughNeed, breakthroughRate, attemptBreakthrough, advanceTime,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-v4-flash';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';
const MAX_TURNS = Number(process.env.DSH_TURNS || 80);
if (!API_KEY) { console.error('缺少 Key'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(messages, json) {
  const payload = { baseUrl: BASE_URL, apiKey: API_KEY, model: MODEL, messages, temperature: 0.8 };
  if (json) payload.response_format = { type: 'json_object' };
  const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.error?.message || text}`);
  const c = data?.choices?.[0]?.message?.content;
  if (typeof c !== 'string' || !c.trim()) throw new Error('模型返回为空');
  return c;
}
async function call(messages, json = true) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { const c = await callOnce(messages, json); if (c.trim()) return c; throw new Error('模型返回为空'); }
    catch (e) {
      lastErr = e;
      if (e.message === '模型返回为空') { if (attempt < 3) { await sleep(2000 * attempt); } continue; }
      if ((e.status === 429 || e.status >= 500) && attempt < 3) { await sleep(2000 * attempt); continue; }
      break;
    }
  }
  if (json) { try { const c = await callOnce(messages, false); if (c.trim()) return c; } catch (e) { lastErr = e; } }
  throw lastErr || new Error('模型调用失败');
}

const player = newPlayerState();
player.realm = '化神后期';
player.cultivation = 95;
player.maxHp = 2000; player.hp = 2000;
player.lifespan = 1500; player.spiritStones = 300;
player.morality = 40; player.reputation = 55;

const world = newWorldState();
world.era = '天劫将至，正魔皆动';
world.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, cultGain: '3x', godMode: false, length: '精简' };
let history = [];

const DEMO_BRAIN_PROMPT = `你是一个修仙游戏里的玩家，正在从化神后期冲击飞升。目标：渡劫飞升成仙。
根据"当前状态"和"最近发生"输出下一步行动（第一人称，20~50字）。
行动要：
- 修为未满就闭关修炼。
- 大境界后期（如化神后期、合体后期、大乘后期）突破需机缘：去探索秘境、寻访传承、寻丹药。
- 渡劫后期要准备渡劫：收集护身法宝/丹药、结道侣或寻师傅护法、稳固道心，然后渡劫。
- 不要一直重复同一件事，也不要空口索要。`;

function strategyHint() {
  const c = player.cultivation || 0;
  if (c < 100) return `\n【当前修为 ${c}%，应闭关修炼提升修为。】`;
  if (player.realm === '渡劫后期') return `\n【渡劫后期修为圆满，做好渡劫准备（护身法宝/道侣护法/道心），即可渡劫飞升。】`;
  if (/后期$/.test(player.realm)) return `\n【${player.realm}是大境界后期，突破需机缘——探索秘境/寻传承/寻丹药。】`;
  return `\n【小境界修为圆满，可直接突破。】`;
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
    { role: 'user', content: `当前状态：${snapshot}\n最近发生：\n${recent}${strategyHint()}\n\n请给出你的下一步行动：` },
  ];
  try { const a = await call(messages, false); return ensureCultivation(a.trim()); } catch { return '我闭关修炼。'; }
}

console.log(`起点：${player.realm} · 修为${player.cultivation}% · 目标飞升`);
for (let t = 1; t <= MAX_TURNS; t++) {
  const text = await generateAction();
  try {
    const raw = await call(buildGMMessages(player, world, history, text), false);
    const narrative = raw.trim();
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    if (history.length > 16) {
      const overflow = history.slice(0, history.length - 16);
      try { const s = await call(buildSummaryMessages(overflow), false); world.memory = (world.memory ? world.memory + '\n' : '') + s.trim(); history = history.slice(overflow.length); } catch { /* 忽略 */ }
    }
    world.turn += 1;
    const months = (out && typeof out.timeMonths === 'number' && out.timeMonths > 0) ? out.timeMonths : 0;
    advanceTime(world, player, months);
    const prog = out?.realmChange ? ` ↪${out.realmChange}` : '';
    const eq = (world.inventory || []).filter((it) => it.equipped).map((it) => it.name).join('、');
    console.log(`回合${t} | ${player.realm}(${realmIndex(player.realm)}/${REALM_LADDER.length - 1}) | 修为${player.cultivation}% | 已装备:${eq || '无'}${prog}`);

    // 渡劫后期 + 修为圆满 → 模拟点击「渡劫飞升」按钮
    if (player.realm === '渡劫后期' && (player.cultivation || 0) >= 100) {
      const rate = breakthroughRate(player, world, 'ascend');
      console.log(`\n渡劫评估：成功率 ${rate}%`);
      const res = attemptBreakthrough(player, world, 'ascend');
      console.log(`渡劫结果：${res.note}`);
      const ending = evaluateEndings(player, world);
      if (ending) { console.log('结局:', ending.title, '| 通关:', ending.win); }
      else { console.log('渡劫未死，当前:', player.realm, '修为', player.cultivation + '%'); }
      break;
    }

    const ending = evaluateEndings(player, world);
    if (ending) { console.log('结局:', ending.title, '| 通关:', ending.win); break; }
  } catch (e) {
    console.log(`回合${t} 出错: ${e.message}`);
  }
}
console.log('\n=== 结束 ===');
console.log('最终境界:', player.realm, '| 是否飞升:', player.realm === '飞升');
