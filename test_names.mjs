// 快速验证：NPC 是否获得姓名而非身份代称
import { buildWorldGenMessages, buildGMMessages, buildExtractMessages, applyStateUpdates, parseLLMJSON, newPlayerState, newWorldState } from './public/game.js';
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
  const guide = seed?.guideNpc;
  if (guide && guide.name) world.npcs.push({ name: guide.name, desc: guide.desc || '', relation: guide.relation || '' });
}
console.log('开局引路人:', world.npcs.map((n) => n.name).join('、'));

const actions = [
  '我向镇上的老樵夫打听附近的情况。',
  '我遇到一个青衫道人，向他请教修炼之法。',
  '我去当铺，向掌柜打听有没有什么委托。',
  '我又回去找那位老樵夫，问他后来怎么样了。',
];
for (let i = 0; i < actions.length; i++) {
  const raw = await call(buildGMMessages(player, world, history, actions[i]), false);
  const narrative = raw.trim();
  let out = null;
  try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
  if (out) applyStateUpdates(player, world, out);
  history.push({ role: 'user', content: actions[i] });
  history.push({ role: 'assistant', content: narrative });
  console.log(`回合${i + 1} 新增NPC:`, (out?.newNpcs || []).map((n) => n.name).join('、') || '（无）');
  console.log('  叙事片段:', narrative.slice(0, 50).replace(/\n/g, ' '));
}
console.log('\n最终相识之人:', world.npcs.map((n) => n.name).join('、'));
