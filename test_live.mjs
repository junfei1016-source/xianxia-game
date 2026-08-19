// 临时联调脚本：复刻 app.js 的真实调用链，多轮对话定位 bug
// 用法：$env:DSH_KEY='sk-...'; node test_live.mjs
import {
  buildWorldGenMessages, buildGMMessages, buildExtractMessages, buildSummaryMessages, applyStateUpdates,
  parseLLMJSON, newPlayerState, newWorldState,
} from './public/game.js';

const BASE_URL = process.env.DSH_BASE || 'https://api.deepseek.com';
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
const MODEL = process.env.DSH_MODEL || 'deepseek-chat';
const JSON_MODE = process.env.DSH_JSON !== '0';
const PROXY = process.env.DSH_PROXY || 'http://localhost:3000/api/chat';

if (!API_KEY) { console.error('缺少 Key'); process.exit(2); }
console.log('目标:', BASE_URL, '| 模型:', MODEL, '| JSON模式:', JSON_MODE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(messages, json) {
  const payload = { baseUrl: BASE_URL, apiKey: API_KEY, model: MODEL, messages, temperature: 0.8 };
  if (json && JSON_MODE) payload.response_format = { type: 'json_object' };
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* keep null */ }
  if (!res.ok) {
    const err = data?.error?.message || data?.error || text;
    const e = new Error(`HTTP ${res.status}: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
    e.status = res.status;
    throw e;
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型返回为空');
  return content;
}

async function call(messages, json = true) {
  let lastErr = null;
  let emptyFail = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const content = await callOnce(messages, json);
      if (content.trim()) return content;
      throw new Error('模型返回为空');
    } catch (e) {
      lastErr = e;
      if (e.message === '模型返回为空') {
        emptyFail = true;
        if (attempt < 3) {
          console.log(`    ↻ 空响应，重试 ${attempt}/3…`);
          await sleep(2000 * attempt);
        }
        continue;
      }
      const retryable = e.status === 429 || e.status >= 500;
      if (retryable && attempt < 3) {
        console.log(`    ↻ HTTP ${e.status}，重试 ${attempt}/3…`);
        await sleep(2000 * attempt);
        continue;
      }
      break;
    }
  }
  if (json && emptyFail) {
    console.log('    ↻ json 模式持续空响应，退回非 json 模式…');
    try {
      const content = await callOnce(messages, false);
      if (content.trim()) return content;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('模型调用失败');
}

const player = newPlayerState();
const world = newWorldState();
let history = [];

// ---- 世界生成 ----
console.log('\n=== 世界生成 ===');
try {
  const raw = await call(buildWorldGenMessages('random', {}));
  const seed = parseLLMJSON(raw);
  if (!seed) {
    console.log('❌ 世界生成 JSON 解析失败，raw 长度', raw.length);
    console.log('raw head:', JSON.stringify(raw.slice(0, 800)));
    process.exit(3);
  }
  if (seed.player) {
    player.name = seed.player.name || player.name;
    player.origin = seed.player.origin || '';
    player.backstory = seed.player.backstory || '';
  }
  world.era = seed.era || '';
  world.startingLocation = seed.startingLocation || null;
  world.factions = Array.isArray(seed.factions) ? seed.factions : [];
  const guide = seed.guideNpc;
  if (guide && guide.name) world.npcs.push({ name: guide.name, desc: guide.desc || '', relation: guide.relation || '' });
  console.log('✅ 创世成功:', player.name, '|', world.era);
  console.log('   开局钩子:', seed.openingHook);
} catch (e) {
  console.log('❌ 创世失败:', e.message);
  process.exit(4);
}

// ---- 多轮对话 ----
const inputs = [
  '我环顾四周，观察这是什么地方。',
  '我向引路人打听附近的局势和机遇。',
  '我开始打坐修炼，尝试提升修为。',
  '我去附近转转，看看有什么际遇。',
  '我继续修炼，并打听突破炼气期的法门。',
  '我尝试寻找一门适合自己的功法。',
  '我盘点一下自己的处境，决定下一步计划。',
  '我再次修炼，冲击更高境界。',
  '我前往万剑冢，探索其中机缘。',
  '我在途中遇到危险，设法应对。',
  '我继续修炼，巩固炼气初期的修为。',
  '我打听渡劫飞升的传说与条件。',
];

for (let i = 0; i < inputs.length; i++) {
  const text = inputs[i];
  console.log(`\n=== 回合 ${i + 1} ===`);
  console.log('玩家:', text);
  try {
    const raw = await call(buildGMMessages(player, world, history, text), false); // 叙事（非 JSON）
    const narrative = raw.trim();
    let out = null;
    try { out = parseLLMJSON(await call(buildExtractMessages(narrative, player, world), true)) || null; } catch (e) { out = null; }
    if (out) applyStateUpdates(player, world, out);
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });
    // 长期记忆压缩（与 app.js 一致）
    if (history.length > 16) {
      const overflow = history.slice(0, history.length - 16);
      try {
        const summary = await call(buildSummaryMessages(overflow), false);
        world.memory = (world.memory ? world.memory + '\n' : '') + summary.trim();
        history = history.slice(overflow.length);
        console.log('    🧠 记忆压缩：' + overflow.length + ' 条 → 剧情记忆（现 ' + world.memory.length + ' 字）');
      } catch (e) {
        console.log('    ⚠ 记忆压缩失败：' + e.message);
      }
    }
    console.log('叙事:', narrative.slice(0, 60).replace(/\n/g, ' ') + (narrative.length > 60 ? '…' : ''));
    console.log('状态: 境界=' + player.realm, '气血=' + player.hp, '灵石=' + player.spiritStones,
      '正邪=' + player.morality, '声望=' + player.reputation, '修为=' + player.cultivation);
    console.log('世界: NPC=' + world.npcs.length, '地点=' + world.locations.length, '物品=' + world.items.length,
      '功法=' + world.skills.length, '事件=' + world.events.length, '目标=' + JSON.stringify(world.goal));
    if (out.realmChange) console.log('   突破 →', out.realmChange);
  } catch (e) {
    console.log('❌ 回合出错:', e.message);
  }
}
console.log('\n=== 联调结束 ===');
