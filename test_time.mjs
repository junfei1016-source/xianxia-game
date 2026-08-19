// 快速联调：时间流逝（timeMonths 提取 + 日期推进 + 寿元消耗）
import { buildWorldGenMessages, buildGMMessages, buildExtractMessages, applyStateUpdates, advanceTime, parseLLMJSON, newPlayerState, newWorldState } from './public/game.js';
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
let history = [];
{
  const seed = parseLLMJSON(await call(buildWorldGenMessages('random', {})));
  if (seed?.player) player.name = seed.player.name || player.name;
  world.era = seed?.era || '';
}
console.log('初始:', player.name, '| 寿元', player.lifespan, '| 时间 第', world.date.year, '年', world.date.month, '月');

const actions = ['我闭关修炼三个月，冲击当前境界。', '我继续闭关苦修，一晃又是一年。'];
for (let i = 0; i < actions.length; i++) {
  const raw = await call(buildGMMessages(player, world, history, actions[i]), false);
  const narrative = raw.trim();
  let out = null;
  try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
  if (out) applyStateUpdates(player, world, out);
  history.push({ role: 'user', content: actions[i] });
  history.push({ role: 'assistant', content: narrative });
  world.turn += 1;
  const months = (out && typeof out.timeMonths === 'number' && out.timeMonths > 0) ? out.timeMonths : 1;
  advanceTime(world, player, months);
  console.log(`回合${i + 1}: timeMonths=${out?.timeMonths ?? '默认1'} | 时间 第${world.date.year}年${world.date.month}月 | 寿元${Math.round(player.lifespan)} | 修为${player.cultivation}%`);
}
console.log('完成');
