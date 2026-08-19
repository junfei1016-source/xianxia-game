// 多阶段 6 回合检测：DSH_REALM 指定起始境界，统计报错/提取失败
import {
  buildGMMessages, buildExtractMessages, applyStateUpdates, parseLLMJSON,
  newPlayerState, newWorldState, advanceTime, evaluateEndings, realmMajor, REALM_BASE,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-v4-flash';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';
const REALM = process.env.DSH_REALM || '凡人';
const TURNS = Number(process.env.DSH_TURNS || 6);
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
player.realm = REALM;
const base = REALM_BASE[realmMajor(REALM)] || { lifespan: 100, maxHp: 100 };
player.maxHp = base.maxHp; player.hp = base.maxHp;
player.lifespan = base.lifespan;
player.cultivation = 85;
player.spiritStones = 100; player.morality = 20; player.reputation = 30;

const world = newWorldState();
world.era = '正魔暗流涌动';
world.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, cultGain: '1x', godMode: false, length: '标准' };
let history = [];

const actions = [
  '我闭关修炼，冲击更高境界。',
  '我继续闭关苦修，冲击瓶颈。',
  '我继续闭关，试图强行突破。',
  '我外出游历，寻访机缘。',
  '我深入秘境寻宝。',
  '我闭关冲击更高境界。',
];

let errors = 0, extractFails = 0;
for (let t = 1; t <= TURNS; t++) {
  const text = actions[(t - 1) % actions.length];
  try {
    const narrative = (await call(buildGMMessages(player, world, history, text), false)).trim();
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; extractFails++; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    world.turn += 1;
    const months = (out && typeof out.timeMonths === 'number' && out.timeMonths > 0) ? out.timeMonths : 0;
    advanceTime(world, player, months);
    const prog = out?.realmChange ? ` ↪${out.realmChange}` : '';
    console.log(`[${REALM}] 回合${t} | ${player.realm} | 修为${player.cultivation}% | 连闭${world.closedStreak || 0}${prog}`);
    const ending = evaluateEndings(player, world);
    if (ending) { console.log(`[${REALM}] 结局: ${ending.title}`); break; }
  } catch (e) {
    errors++;
    console.log(`[${REALM}] 回合${t} 出错: ${e.message}`);
  }
}
console.log(`[${REALM}] 总结: 报错${errors} 提取失败${extractFails} 最终${player.realm} 修为${player.cultivation}%`);
