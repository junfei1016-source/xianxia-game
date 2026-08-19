// 受控通关演示：从「渡劫后期」走完渡劫→飞升，验证 v4-flash 下规则引擎触发「飞升成仙」
import {
  buildGMMessages, buildExtractMessages, applyStateUpdates, parseLLMJSON,
  newPlayerState, newWorldState, evaluateEndings,
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
player.name = '云归尘';
player.origin = '北荒散修';
player.realm = '渡劫后期';
player.cultivation = 90;
player.lifespan = 10000;
player.maxHp = 10000;
player.hp = 10000;
player.spiritStones = 5000;
player.morality = 30;
player.reputation = 80;

const world = newWorldState();
world.era = '魔道大兴，正道式微';
world.goal = { type: '飞升成仙', desc: '渡劫飞升，位列仙班', status: '进行中' };

let history = [];
console.log('初始境界:', player.realm, '| 目标:', world.goal.type);

const actions = [
  '我寻一处荒山绝顶，静坐调息，将毕生修为运转至巅峰，准备迎接天劫。',
  '天劫降临，雷云压顶，我全力抵挡天雷，誓要渡过此劫。',
  '我拼尽最后一丝力气，硬抗最后一道天雷，若渡过便可飞升。',
  '我渡过天劫，试着接引飞升仙光，霞举飞升。',
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
    console.log('  叙事:', narrative.slice(0, 100).replace(/\n/g, ' '));
    console.log('  提取 stateUpdates:', JSON.stringify(out?.stateUpdates || {}), '| realmChange:', out?.realmChange || '-');
    console.log('  当前境界:', player.realm);
    const ending = evaluateEndings(player);
    if (ending) {
      console.log('\n════════ 结局触发 ════════');
      console.log('结局:', ending.title, '| 主目标(飞升)达成:', ending.win);
      console.log(ending.text);
      break;
    }
  } catch (e) {
    console.log('  出错:', e.message);
  }
  await sleep(1500);
}

console.log('\n=== 演示结束 ===');
console.log('最终境界:', player.realm, '| 是否飞升:', player.realm === '飞升');
