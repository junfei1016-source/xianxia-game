// 专注验证灵石数值同步的联调脚本
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, applyStateUpdates,
  parseLLMJSON, newPlayerState, newWorldState,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-chat';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';
if (!API_KEY) { console.error('缺少 Key'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(messages, json) {
  const payload = { baseUrl: BASE_URL, apiKey: API_KEY, model: MODEL, messages, temperature: 0.8 };
  if (json) payload.response_format = { type: 'json_object' };
  const res = await fetch(PROXY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
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
    try {
      const c = await callOnce(messages, json);
      if (c.trim()) return c;
      throw new Error('模型返回为空');
    } catch (e) {
      lastErr = e;
      if (e.message === '模型返回为空') {
        emptyFail = true;
        if (attempt < 3) { await sleep(2000 * attempt); }
        continue;
      }
      if ((e.status === 429 || e.status >= 500) && attempt < 3) { await sleep(2000 * attempt); continue; }
      break;
    }
  }
  if (json && emptyFail) {
    try { const c = await callOnce(messages, false); if (c.trim()) return c; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('模型调用失败');
}

const player = newPlayerState();
const world = newWorldState();
let history = [];

console.log('=== 创世 ===');
{
  const raw = await call(buildWorldGenMessages('random', {}));
  const seed = parseLLMJSON(raw);
  if (seed?.player) {
    player.name = seed.player.name || player.name;
    player.origin = seed.player.origin || '';
    player.backstory = seed.player.backstory || '';
    if (typeof seed.player.spiritStones === 'number') player.spiritStones = seed.player.spiritStones;
  }
  console.log('姓名:', player.name, '| 初始灵石:', player.spiritStones, '| 大势:', seed?.era);
}

const inputs = [
  '我数一数身上有多少灵石，并去集市看看有什么能赚钱的营生。',
  '我把自己捡到的旧物拿去当铺卖掉，换些灵石。',
  '我用灵石在集市买了一瓶疗伤丹药。',
  '我接了个悬赏任务，完成后去领取灵石报酬。',
  '我清点一下现在还剩多少灵石。',
  '我向当铺掌柜索要一万块灵石，看他给不给。',
];

for (let i = 0; i < inputs.length; i++) {
  const text = inputs[i];
  console.log(`\n=== 回合 ${i + 1} ===`);
  console.log('玩家:', text);
  try {
    const raw = await call(buildGMMessages(player, world, history, text), false); // 叙事（非 JSON）
    const narrative = raw.trim();
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch { out = null; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    console.log('叙事:', narrative.slice(0, 70).replace(/\n/g, ' ') + (narrative.length > 70 ? '…' : ''));
    console.log('  提取到的 stateUpdates:', JSON.stringify(out?.stateUpdates || {}));
    console.log('  右侧应显示 灵石:', player.spiritStones, '| 气血:', player.hp + '/' + player.maxHp, '| 寿元:', player.lifespan, '| 正邪:', player.morality, '| 声望:', player.reputation, '| 修为:', player.cultivation);
  } catch (e) {
    console.log('  出错:', e.message);
  }
  if (i < inputs.length - 1) await sleep(4000); // 模拟真实玩家的打字间隔
}
console.log('\n=== 结束 ===');
