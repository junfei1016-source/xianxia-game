// 元婴期 6 回合定向检验：闭关递减 + GM 提醒 + 金丹→化神需机缘软墙
import {
  buildGMMessages, buildExtractMessages, applyStateUpdates, parseLLMJSON,
  newPlayerState, newWorldState, advanceTime, evaluateEndings,
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
player.name = '检验者';
player.realm = '元婴初期';
player.cultivation = 88;
player.maxHp = 1200; player.hp = 1200;
player.lifespan = 800; player.spiritStones = 100;
player.morality = 30; player.reputation = 50;

const world = newWorldState();
world.era = '魔道大兴，正道式微';
world.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, cultGain: '1x', godMode: false, length: '标准' };
let history = [];

const actions = [
  '我闭关修炼，运转功法冲击元婴中期。',
  '我继续闭关苦修，一心冲击瓶颈。',
  '我再次闭关，试图强行突破元婴。',
  '我外出游历，寻访能助我突破元婴的机缘（丹药、传承、顿悟）。',
  '我深入秘境寻宝，寻找突破机缘。',
  '机缘已得，我服下所得丹药并闭关，冲击元婴中期。',
];

console.log(`起点：${player.realm} · 修为${player.cultivation}% · 连闭${world.closedStreak || 0}回合`);
for (let t = 1; t <= 6; t++) {
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
    const prog = out?.realmChange ? ` ↪${out.realmChange}` : '';
    const items = (out?.itemChanges || []).map((i) => `${i.name}${i.delta > 0 ? '+' : ''}${i.delta}`).join('、');
    console.log(`\n回合${t} | ${player.realm} | 修为${player.cultivation}% | 连闭${world.closedStreak || 0} | ${world.date.year}年${world.date.month}月${world.date.day}日${prog}`);
    console.log(`  ↳ ${narrative.slice(0, 60).replace(/\n/g, ' ')}…`);
    if (items) console.log(`  掉落: ${items}`);
  } catch (e) {
    console.log(`回合${t} 出错: ${e.message}`);
  }
}
console.log('\n=== 检验结束 ===');
console.log('最终:', player.realm, '| 修为', player.cultivation + '%', '| 连闭', world.closedStreak || 0);
