// 冒烟测试：固定行动 + 不 sleep，快速验证游戏循环（时间/状态/结局）
// DSH_PACE=慢(默认，两段式) 或 快(合并式)；DSH_GAIN 修为增益；DSH_TURNS 回合数
import {
  buildWorldGenMessages, buildGMMessages, buildGMCombinedMessages, buildExtractMessages,
  applyStateUpdates, parseLLMJSON, newPlayerState, newWorldState,
  evaluateEndings, advanceTime, realmIndex, REALM_LADDER,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-v4-flash';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';
const TURNS = Number(process.env.DSH_TURNS || 8);
const PACE = process.env.DSH_PACE || '慢';
const GAIN = process.env.DSH_GAIN || '1x';
const LENGTH = process.env.DSH_LENGTH || '标准';
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
      if (e.message === '模型返回为空') { if (attempt < 3) { await sleep(1500 * attempt); } continue; }
      if ((e.status === 429 || e.status >= 500) && attempt < 3) { await sleep(1500 * attempt); continue; }
      break;
    }
  }
  if (json) { try { const c = await callOnce(messages, false); if (c.trim()) return c; } catch (e) { lastErr = e; } }
  throw lastErr || new Error('模型调用失败');
}

const player = newPlayerState();
const world = newWorldState();
world.settings = { difficulty: '普通', pace: PACE, turnLimit: 0, cultGain: GAIN, godMode: false, length: LENGTH };
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
  console.log(`模式: ${PACE}节奏 · 增益${GAIN} · 篇幅${LENGTH}`);
}

const actions = [
  '我闭关修炼三个月，运转功法提升修为。',
  '我寻访附近机缘，寻找丹药与传承。',
  '我闭关潜修，冲击更高境界。',
  '我向修为高深的前辈请教参悟。',
  '我深入秘境寻宝，寻找机缘。',
];

for (let t = 1; t <= TURNS; t++) {
  const text = actions[(t - 1) % actions.length];
  try {
    let narrative, out = null;
    if (PACE === '快') {
      const raw = await call(buildGMCombinedMessages(player, world, history, text), true);
      out = parseLLMJSON(raw);
      narrative = (out && typeof out.narrative === 'string' && out.narrative.trim()) ? out.narrative : raw;
    } else {
      narrative = (await call(buildGMMessages(player, world, history, text), false)).trim();
      try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
    }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    world.turn += 1;
    const months = (out && typeof out.timeMonths === 'number' && out.timeMonths > 0) ? out.timeMonths : 0;
    advanceTime(world, player, months);
    const prog = out?.realmChange ? ` ↪${out.realmChange}` : '';
    const combat = out?.combat ? ` | 战斗:${out.combat.enemy || ''}(${out.combat.realm || '未知'})` : '';
    console.log(`回合${t} | ${player.realm}(${realmIndex(player.realm)}/${REALM_LADDER.length - 1}) | 修为${player.cultivation}% | ${world.date.year}年${world.date.month}月${world.date.day}日 | 寿元${player.lifespan.toFixed(1)}${prog}${combat}`);
    const ending = evaluateEndings(player, world);
    if (ending) { console.log('结局:', ending.title, '| 通关:', ending.win); break; }
  } catch (e) {
    console.log(`回合${t} 出错: ${e.message}`);
  }
}
console.log('=== 冒烟测试结束 ===');
console.log('最终境界:', player.realm, '| 背包:', (world.inventory || []).map((i) => `${i.name}${i.kind ? `(${i.kind})` : ''}×${i.qty}`).join('、') || '空');
