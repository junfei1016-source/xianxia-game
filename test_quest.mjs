// 聚焦新功能联调：难度注入 + 支线任务提取 + 风险判定
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, applyStateUpdates,
  parseLLMJSON, newPlayerState, newWorldState, evaluateEndings, DIFFICULTIES, PACES,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-v4-flash';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';
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
    try { const c = await callOnce(messages, json); if (c.trim()) return c; throw new Error('模型返回为空'); }
    catch (e) {
      lastErr = e;
      if (e.message === '模型返回为空') { emptyFail = true; if (attempt < 3) { await sleep(2000 * attempt); } continue; }
      if ((e.status === 429 || e.status >= 500) && attempt < 3) { await sleep(2000 * attempt); continue; }
      break;
    }
  }
  if (json && emptyFail) { try { const c = await callOnce(messages, false); if (c.trim()) return c; } catch (e) { lastErr = e; } }
  throw lastErr || new Error('模型调用失败');
}

const player = newPlayerState();
const world = newWorldState();
world.settings = { difficulty: '困难', pace: '快', turnLimit: 0 };
let history = [];

console.log('难度:', world.settings.difficulty, '| 节奏:', world.settings.pace, '| 伤害乘数:', DIFFICULTIES['困难'].damageMult, '| 修为倍率:', PACES['快'].cultivationMult);

{
  const raw = await call(buildWorldGenMessages('random', {}));
  const seed = parseLLMJSON(raw);
  if (seed?.player) { player.name = seed.player.name || player.name; player.origin = seed.player.origin || ''; }
  world.era = seed?.era || '';
  console.log('创世:', player.name, '|', world.era);
}

const actions = [
  '我四处打听，看看附近有什么委托、悬赏或机缘可接。',
  '我接下那个委托，立刻动身去完成它。',
  '我为了完成任务，硬闯一处凶险禁地。',
  '我继续完成委托，并留意有没有新的任务。',
];

for (let i = 0; i < actions.length; i++) {
  const text = actions[i];
  console.log(`\n=== 回合 ${i + 1}: ${text} ===`);
  try {
    const raw = await call(buildGMMessages(player, world, history, text), false);
    const narrative = raw.trim();
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    world.turn += 1;
    console.log('  叙事:', narrative.slice(0, 60).replace(/\n/g, ' '));
    console.log('  risk:', out?.risk || '-', '| 新任务:', (out?.newQuests || []).map((q) => q.title).join('、') || '-', '| 任务更新:', (out?.questUpdates || []).map((q) => q.title + ':' + q.status).join('、') || '-');
    console.log('  气血:', player.hp + '/' + player.maxHp, '| 修为:', player.cultivation, '| 回合:', world.turn, '| 支线数:', world.quests.filter((q) => q.type === 'side').length);
    const ending = evaluateEndings(player, world);
    if (ending) { console.log('\n🎉 结局:', ending.title, '| 达成:', ending.win); console.log(ending.text); break; }
  } catch (e) {
    console.log('  出错:', e.message);
  }
  await sleep(1500);
}
console.log('\n=== 支线任务列表 ===');
world.quests.filter((q) => q.type === 'side').forEach((q) => console.log('  -', q.title, '| 目标:', q.objective, '| 期限:', q.timeNode, '| 奖励:', q.reward, '|', q.status));
console.log('=== 结束 ===');
