// 渡劫流程 + 装备稀有度/词条 检测：渡劫后期起，探索拿装备，评估成功率并尝试渡劫
import {
  buildGMMessages, buildExtractMessages, applyStateUpdates, parseLLMJSON,
  newPlayerState, newWorldState, advanceTime, evaluateEndings, breakthroughRate, attemptBreakthrough,
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
player.realm = '渡劫后期';
player.cultivation = 100;
player.maxHp = 10000; player.hp = 10000;
player.lifespan = 10000; player.spiritStones = 500;
player.morality = 40; player.reputation = 60;

const world = newWorldState();
world.era = '天劫将至';
world.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, cultGain: '1x', godMode: false, length: '标准' };
let history = [];

const actions = ['我探寻古修洞府，寻找渡劫用的护身法宝。', '我寻访能护我渡劫的机缘宝物。', '我遍访故友，求取护法与渡劫之物。'];

for (let t = 1; t <= 3; t++) {
  const text = actions[t - 1];
  try {
    const narrative = (await call(buildGMMessages(player, world, history, text), false)).trim();
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    world.turn += 1;
    const months = (out && typeof out.timeMonths === 'number' && out.timeMonths > 0) ? out.timeMonths : 0;
    advanceTime(world, player, months);
    const items = (out?.itemChanges || []).map((i) => `${i.name}${i.rarity ? `[${i.rarity}]` : ''}${i.affix ? `「${i.affix}」` : ''}`).join('、');
    console.log(`回合${t} 掉落: ${items || '无'}`);
  } catch (e) {
    console.log(`回合${t} 出错: ${e.message}`);
  }
}

// 展示已装备与成功率
const eq = (world.inventory || []).filter((it) => it.equipped);
console.log('已装备:', eq.map((it) => `${it.name}(${it.rarity || '凡品'}${it.affix ? '·' + it.affix : ''})`).join('、') || '无');
const rate = breakthroughRate(player, world, 'ascend');
console.log(`渡劫成功率: ${rate}%`);

// 尝试渡劫 3 次（各用独立副本，统计成败）
let win = 0, dead = 0, fail = 0;
for (let i = 0; i < 3; i++) {
  const p2 = JSON.parse(JSON.stringify(player));
  const w2 = JSON.parse(JSON.stringify(world));
  const r = attemptBreakthrough(p2, w2, 'ascend');
  if (r.success) win++;
  else if (r.death) dead++;
  else fail++;
}
console.log(`模拟渡劫3次: 成功${win} 失败${fail} 死亡${dead}`);
console.log('=== 渡劫检测结束 ===');
