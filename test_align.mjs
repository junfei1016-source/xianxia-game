// 分来源收益联调：正道行为 vs 掠夺行为，验证 gainType 提取 + 加成
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, applyStateUpdates,
  parseLLMJSON, newPlayerState, newWorldState, reputationMultiplier, moralityGainMultiplier,
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

const player = newPlayerState();
const world = newWorldState();
world.settings.difficulty = '困难';
let history = [];
{
  const seed = parseLLMJSON(await call(buildWorldGenMessages('random', {})));
  if (seed?.player) player.name = seed.player.name || player.name;
  world.era = seed?.era || '';
}

const cases = [
  { label: '正道(80) 帮人得谢礼', morality: 80, action: '我仗义救下一个被困的商队，对方感激地赠我灵石作谢礼。' },
  { label: '魔道(-80) 拦路抢劫', morality: -80, action: '我拦路打劫一个落单的商旅，抢走了他的灵石。' },
];

for (const c of cases) {
  player.morality = c.morality;
  const before = player.spiritStones;
  const raw = await call(buildGMMessages(player, world, history, c.action), false);
  const narrative = raw.trim();
  let out = null;
  try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
  const rawDelta = out?.stateUpdates?.spiritStones?.delta ?? 0;
  if (out) applyStateUpdates(player, world, out);
  history.push({ role: 'user', content: c.action });
  history.push({ role: 'assistant', content: narrative });
  const gainType = out?.gainType || 'neutral';
  console.log(`\n[${c.label}]`);
  console.log('  叙事:', narrative.slice(0, 40).replace(/\n/g, ' '), '…');
  console.log('  gainType:', gainType, '| 原始delta:', rawDelta, '| 正邪:', player.morality, '| 声望:', player.reputation);
  console.log('  灵石:', before, '→', player.spiritStones, '| 加成系数: 声望', reputationMultiplier(player.reputation).toFixed(2), '× 正邪', moralityGainMultiplier(c.morality, gainType, 0.3).toFixed(2));
}
console.log('\n完成');
