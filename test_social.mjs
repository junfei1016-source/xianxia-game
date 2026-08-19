// 正邪 / 声望功能联调 + 收益系数验证
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, applyStateUpdates,
  reputationMultiplier, parseLLMJSON, newPlayerState, newWorldState,
} from './public/game.js';

const BASE_URL = 'https://api.deepseek.com';
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
  let d = null; try { d = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (d?.error?.message || text));
  const c = d?.choices?.[0]?.message?.content;
  if (typeof c !== 'string' || !c.trim()) throw new Error('模型返回为空');
  return c;
}
async function call(messages, json = true) {
  for (let a = 1; a <= 3; a++) {
    try { const c = await callOnce(messages, json); if (c.trim()) return c; } catch (e) { if (a === 3) throw e; await sleep(2000 * a); }
  }
  throw new Error('模型调用失败');
}

// 收益系数（机械层）
console.log('=== 声望收益系数（机械层）===');
console.log('声望 0 →', reputationMultiplier(0).toFixed(2) + 'x', '| 50 →', reputationMultiplier(50).toFixed(2) + 'x', '| 100 →', reputationMultiplier(100).toFixed(2) + 'x');
const pl = newPlayerState(); pl.reputation = 0;
applyStateUpdates(pl, newWorldState(), { stateUpdates: { spiritStones: { delta: 100 } } });
console.log('声望 0 时领 100 灵石奖励 → 实得', pl.spiritStones);
const ph = newPlayerState(); ph.reputation = 100;
applyStateUpdates(ph, newWorldState(), { stateUpdates: { spiritStones: { delta: 100 } } });
console.log('声望 100 时领 100 灵石奖励 → 实得', ph.spiritStones);

// 正邪 / 声望提取（叙事层）
const player = newPlayerState();
const world = newWorldState();
let history = [];
{
  const seed = parseLLMJSON(await call(buildWorldGenMessages('random', {})));
  if (seed?.player) player.name = seed.player.name || player.name;
  world.era = seed?.era || '';
}
console.log('\n=== 正邪/声望 叙事提取 ===');
console.log('初始: 正邪', player.morality, '| 声望', player.reputation);

const actions = [
  '我看到几个地痞在欺负卖柴的老翁，上前仗义出手解围。',
  '我救下一个被山贼劫掠的商队，护送他们到安全处。',
  '我趁夜偷走了一个摊贩的钱袋。',
  '我恃强凌弱，强抢了一个落单散修的灵石。',
];
for (let i = 0; i < actions.length; i++) {
  const raw = await call(buildGMMessages(player, world, history, actions[i]), false);
  const narrative = raw.trim();
  let out = null;
  try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
  if (out) applyStateUpdates(player, world, out);
  history.push({ role: 'user', content: actions[i] });
  history.push({ role: 'assistant', content: narrative });
  const mo = out?.stateUpdates?.morality?.delta ?? 0;
  const re = out?.stateUpdates?.reputation?.delta ?? 0;
  console.log(`回合${i + 1}: 正邪delta=${mo} → ${player.morality} | 声望delta=${re} → ${player.reputation} | 叙事: ${narrative.slice(0, 30).replace(/\n/g, ' ')}…`);
}
console.log('\n最终: 正邪', player.morality, '| 声望', player.reputation);
