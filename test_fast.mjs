// 快节奏单次调用（合并输出）联调
import { buildWorldGenMessages, buildGMCombinedMessages, applyStateUpdates, advanceTime, parseLLMJSON, newPlayerState, newWorldState } from './public/game.js';
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
world.settings.pace = '快';
let history = [];
{
  const seed = parseLLMJSON(await call(buildWorldGenMessages('random', {})));
  if (seed?.player) player.name = seed.player.name || player.name;
  world.era = seed?.era || '';
}
console.log('快节奏单次调用测试 | 玩家:', player.name);

const actions = ['我闭关修炼，冲击当前境界。', '我四处寻找机缘和传承。'];
for (let i = 0; i < actions.length; i++) {
  const raw = await call(buildGMCombinedMessages(player, world, history, actions[i]), true);
  const out = parseLLMJSON(raw);
  const narrative = out?.narrative || raw.trim();
  console.log(`\n回合${i + 1}: 有narrative=${typeof out?.narrative === 'string'} | 有stateUpdates=${!!out?.stateUpdates} | risk=${out?.risk ?? '-'} | timeMonths=${out?.timeMonths ?? '-'}`);
  console.log('  叙事:', narrative.slice(0, 50).replace(/\n/g, ' '));
  if (out) applyStateUpdates(player, world, out);
  history.push({ role: 'user', content: actions[i] });
  history.push({ role: 'assistant', content: narrative });
  advanceTime(world, player, (out && out.timeMonths > 0) ? out.timeMonths : 1);
  console.log('  境界:', player.realm, '| 修为:', player.cultivation, '| 灵石:', player.spiritStones, '| 寿元:', Math.round(player.lifespan));
}
console.log('\n完成');
