// ============================================================
//  app.js —— 引擎层：状态管理、对话循环、存档、记忆、UI 渲染
//  规则全部来自 game.js（"天道"、通关规则、成就规则）
// ============================================================
import {
  newPlayerState,
  newWorldState,
  QUESTIONNAIRE,
  DIFFICULTY_LEVELS,
  DIFFICULTIES,
  PACE_LEVELS,
  TURN_LIMITS,
  CULT_GAIN_LEVELS,
  LENGTH_LEVELS,
  ITEM_KINDS,
  ITEM_KIND_ORDER,
  kindFromText,
  gradeMult,
  ERA_LEVELS,
  ERA_TYPES,
  eraTypeFromText,
  ORIGINS,
  originTypeFromText,
  buildWorldGenMessages,
  buildGMMessages,
  buildGMCombinedMessages,
  buildSummaryMessages,
  buildExtractMessages,
  applyStateUpdates,
  advanceTime,
  migrateQuestDeadlines,
  expireQuestDeadlines,
  questDeadlineInfo,
  enforceEraTimeline,
  addChronicleEvent,
  reputationMultiplier,
  factionAlignment,
  stanceProfile,
  REALM_LADDER,
  realmIndex,
  realmMajor,
  relationCultMult,
  bondOf,
  linkIsKnown,
  factionCultMult,
  breakthroughRate,
  attemptBreakthrough,
  tribulationDeathProb,
  evaluateEndings,
  evaluateAchievements,
  achievementDesc,
  parseLLMJSON,
  updateFarmLog,
  noteInvestigation,
  rollSeclusionInterrupt,
  farmMult,
  affixLabels,
  equipItem,
  isFunctionalTreasure,
  activeHas,
  GAME_VERSION,
  npcInsightStage,
  skyOf,
  rumorsFor,
  tickRumors,
  perceptionTier,
} from './game.js';

import { ensureWorldGeo, startingFactions, regionById } from './world.js';

const $ = (id) => document.getElementById(id);

// 状态栏：境界 + 当前区域（区域来自世界骨架，旧档没有坐标时自动省掉）
function statusLine() {
  const region = world && world.geo ? regionById(world.geo.regionId) : null;
  return '进行中 · ' + player.realm + (region ? ' · ' + region.name : '');
}

// ---------- 配置 ----------
const CONFIG_KEY = 'xianxia_config_v1';
const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
  temperature: 0.8,
  jsonMode: true,
};
let config = { ...DEFAULTS };

// ---------- 存档 ----------
const SAVE_KEY = 'xianxia_saves_v1';
const AUTO_SLOT = 'auto';
const MEMORY_LIMIT = 20; // 历史消息超过此数，就把更早的压缩进长期记忆

let mode = 'random'; // random | questionnaire
const answers = { origin: '随机', personality: '随机', ambition: '随机' };
const gameOptions = { difficulty: '普通', pace: '慢', turnLimit: 0, eraType: '随机', cultGain: '1x', godMode: false, length: '标准' };

// ---------- 自动演示 ----------
const DEMO_ACTIONS = [
  '我环顾四周，观察这里的情况。',
  '我向身边的人打听附近的局势和机缘。',
  '我开始打坐修炼，提升修为。',
  '我四处寻找机缘和传承。',
  '我打听有没有什么委托或悬赏可接。',
  '我冒险前往附近的一处险地探索。',
  '我盘点自己的处境，决定下一步计划。',
  '我继续闭关苦修，冲击修为瓶颈。',
  '我尝试用灵石购买丹药辅助修炼。',
  '我向当铺掌柜索要一笔灵石，看他给不给。',
];

// 演示智能体：用 AI 生成策略性行动（与 DM 用同一模型，即 config.model）
const DEMO_BRAIN_PROMPT = `你是一个"武侠·修仙"开放世界文字游戏里的玩家，正在扮演一位修士，目标是通过修炼、寻找机缘，最终渡劫飞升成仙。

根据"当前状态"和"最近发生"的事，输出一句你的下一步行动（第一人称，20~50字，直接写动作，不要任何解释或前缀）。

行动要：
- 有策略、符合修仙者的目标（提升修为、寻找机缘、完成任务、应对危险）。
- 随机应变：修为圆满就寻机缘破境；缺灵石就接委托或做买卖；遇到危险要懂得避让或应对；有未了之事就去处理。
- 早期（凡人、炼气阶段）以修炼提升修为为主，至少每 2~3 回合就闭关修炼一次；但探索、任务、奇遇、越级杀敌同样能变强，可穿插进行，不必一味闭关。
- 闭关时直接说明时长（如"闭关修炼三个月"），一次闭关可跨越数月、一次顶多次，不必逐回合修炼。
- 可主动挑战境界高于自己的强敌（越级杀敌）：成功可得高级功法/法宝/武器、加速成长，但要权衡生死风险。
- 不要一直重复同一件事，也不要空口索要逆天之物。

示例：
"我继续闭关修炼，冲击当前境界的瓶颈。"
"我四处打听附近有没有机缘或委托可接。"
"我去坊市把没用的东西卖掉，换灵石买几枚疗伤丹。"`;

function strategyHint() {
  const c = player.cultivation || 0;
  if (c < 100) return `\n【当前修为 ${c}%，尚未圆满，应优先闭关修炼提升修为。】`;
  return `\n【修为已圆满，处于瓶颈，应寻找机缘（丹药/传承/顿悟）以破境。】`;
}
function ensureCultivation(action) {
  const PRODUCTIVE = ['修炼', '闭关', '打坐', '吐纳', '参悟', '练功', '凝气', '引气', '突破', '运功', '周天', '冲击', '探索', '探险', '寻宝', '秘境', '遗迹', '奇遇', '机缘', '任务', '委托', '悬赏', '打听', '挑战', '猎杀', '击杀', '冒险', '越级'];
  if ((player.cultivation || 0) >= 100) return action; // 瓶颈期交给智能体寻机缘
  if (!action || PRODUCTIVE.some((w) => action.includes(w))) return action;
  return '我闭关修炼，运转功法提升修为。';
}

async function generateDemoAction() {
  const snapshot = JSON.stringify({ player, world: { era: world.era, goal: world.goal, turn: world.turn } });
  const recent = history.slice(-6).map((m) => (m.role === 'user' ? '你：' : '世界：') + m.content).join('\n');
  const messages = [
    { role: 'system', content: DEMO_BRAIN_PROMPT },
    { role: 'user', content: `当前状态：${snapshot}\n最近发生：\n${recent}${strategyHint()}\n\n请给出你的下一步行动（一句话，20~50字）：` },
  ];
  const action = await callLLM(messages, false);
  return ensureCultivation(action.trim());
}

let autoDemo = false;
let autoTimer = null;

let player = newPlayerState();
let world = newWorldState();
let history = []; // [{role, content}] 近期对话，发给 LLM
let log = [];     // [{kind:'gm'|'player'|'sys', text}] 用于渲染与存档回放
let playing = false;
let busy = false;
let lastTurnState = null; // 每回合开始前的快照（身死道消可回退一个回合）
let pendingEnding = null;  // 已触发的结局（弹窗收起后可用「结局回顾」重新打开）

// ---------- 工具 ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 配置读写 ----------
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    if (saved) config = { ...DEFAULTS, ...saved };
  } catch { /* ignore */ }
}
function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
function syncConfigToUI() {
  $('baseUrl').value = config.baseUrl;
  $('apiKey').value = config.apiKey;
  $('model').value = config.model;
  $('jsonMode').checked = config.jsonMode;
  $('tempSelect').value = String(config.temperature);
}
function syncConfigFromUI() {
  config.baseUrl = $('baseUrl').value.trim();
  config.apiKey = $('apiKey').value.trim();
  config.model = $('model').value.trim();
  config.jsonMode = $('jsonMode').checked;
  saveConfig();
}

// ---------- LLM 调用（空响应退避重试 + 非JSON兜底）----------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callOnce(messages, json) {
  const payload = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    messages,
    temperature: config.temperature,
  };
  if (json && config.jsonMode) payload.response_format = { type: 'json_object' };

  const res = await fetch('api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = data?.error?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(typeof raw === 'string' ? raw : JSON.stringify(raw));
    err.status = res.status;
    throw err;
  }
  const content = data?.choices?.[0]?.message?.content;
  // DeepSeek json 模式在连续请求时会偶发返回空白 content：视为"空"，触发重试
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型返回为空');
  return content;
}

// 流式调用：边生成边回调 onDelta(delta)，最终返回完整文本
async function callStream(messages, onDelta) {
  const payload = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    messages,
    temperature: config.temperature,
    stream: true,
  };
  const res = await fetch('api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw new Error('流式响应失败');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          full += delta;
          if (onDelta) onDelta(delta);
        }
      } catch { /* 忽略不完整片段 */ }
    }
  }
  return full;
}

async function callLLM(messages, json = true) {
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
          $('topStatus').textContent = '等待模型响应…（重试 ' + attempt + '/3）';
          await sleep(2000 * attempt);
        }
        continue;
      }
      const retryable = e.status === 429 || e.status >= 500;
      if (retryable && attempt < 3) {
        $('topStatus').textContent = '服务繁忙，重试 ' + attempt + '/3…';
        await sleep(2000 * attempt);
        continue;
      }
      break;
    }
  }

  // json 模式多次空返回时，退回非 json 再补一次（非 json 更稳定，避免对话卡死）
  if (json && emptyFail) {
    try {
      const content = await callOnce(messages, false);
      if (content.trim()) return content;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('模型调用失败');
}

// ---------- 状态提取（非JSON叙事兜底时补状态）----------
async function extractStateFromNarrative(narrative) {
  try {
    const raw2 = await callLLM(buildExtractMessages(narrative, player, world), true);
    return parseLLMJSON(raw2) || null;
  } catch {
    return null;
  }
}

// ---------- 渲染（纯渲染，不改 log）----------
function typewrite(el, text) {
  el.textContent = '';
  const scroll = $('chatScroll');
  const chunk = Math.max(2, Math.ceil(text.length / 60)); // 约 1 秒内逐字显现
  let i = 0;
  const step = () => {
    i += chunk;
    if (i >= text.length) {
      el.textContent = text;
      scroll.scrollTop = scroll.scrollHeight;
      return;
    }
    el.textContent = text.slice(0, i);
    scroll.scrollTop = scroll.scrollHeight;
    setTimeout(step, 16);
  };
  step();
}

function renderMsg(kind, text, animate = false, cls = '') {
  const scroll = $('chatScroll');
  if (kind === 'sys') {
    const div = document.createElement('div');
    div.className = 'sys' + (cls ? ' ' + cls : '');
    div.textContent = text;
    scroll.appendChild(div);
  } else {
    const div = document.createElement('div');
    div.className = 'msg ' + (kind === 'gm' ? 'gm' : 'player');
    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = kind === 'gm' ? '天道 · GM' : '你';
    const body = document.createElement('div');
    body.className = 'msg-body';
    if (animate) typewrite(body, text);
    else body.textContent = text;
    div.appendChild(label);
    div.appendChild(body);
    scroll.appendChild(div);
  }
  if (!animate) scroll.scrollTop = scroll.scrollHeight;
}
function appendChat(role, text) {
  log.push({ kind: role, text });
  renderMsg(role, text, role === 'gm'); // GM 叙事走打字机，玩家消息直接显示
}
// 流式消息：先建空消息框，边生成边 update，finish 时写入 log
function renderMsgStream(kind) {
  const scroll = $('chatScroll');
  const div = document.createElement('div');
  div.className = 'msg ' + (kind === 'gm' ? 'gm' : 'player');
  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = kind === 'gm' ? '天道 · GM' : '你';
  const body = document.createElement('div');
  body.className = 'msg-body';
  div.appendChild(label);
  div.appendChild(body);
  scroll.appendChild(div);
  let text = '';
  return {
    update(delta) {
      text += delta;
      body.textContent = text;
      scroll.scrollTop = scroll.scrollHeight;
    },
    finish() {
      log.push({ kind, text });
      return text;
    },
  };
}
function appendSystem(text, cls) {
  log.push({ kind: 'sys', text, cls: cls || '' });
  renderMsg('sys', text, false, cls);
}

// ---------- 回合变化提示（小字 + 右侧红点）----------
// 深拷贝整局状态：死亡后「回退一个回合」的存档点
function snapshotState() {
  return {
    player: JSON.parse(JSON.stringify(player)),
    world: JSON.parse(JSON.stringify(world)),
    log: log.map((m) => ({ ...m })),
    history: history.map((m) => ({ ...m })),
  };
}
// 记录本回合开始前的关键状态：用于对比变化 → 小字提示与红点
function captureTurnState() {
  const inv = (world.inventory || []).map((it) => ({
    name: it.name,
    qty: it.qty || 0,
    equipped: !!it.equipped,
    kind: it.kind || kindFromText(it.name, it.desc),
  }));
  const quests = (world.quests || []).map((q) => ({ title: q.title, status: q.status }));
  const codexLen = (world.items || []).length + (world.skills || []).length + (world.npcs || []).length + (world.locations || []).length + (world.factions || []).length;
  return {
    realm: player.realm,
    goal: JSON.stringify(world.goal || {}),
    goalCompleted: world.flags.goalCompleted === true,
    morality: player.morality,
    reputation: player.reputation,
    maxHp: player.maxHp,
    inv,
    quests,
    factions: (world.factions || []).map((f) => f.name),
    eventsLen: (world.events || []).length,
    codexLen,
    achLen: (world.achievements || []).length,
    deathImminent: !!world.flags.deathImminent,
  };
}
// 对比本回合变化：小字提示（物品/任务/正邪/声望）+ 对应标签红点
function applyTurnNotices(before) {
  const notices = [];
  const dots = { quest: false, bag: false, equip: false, chronicle: false, codex: false, achieve: false };
  const EQUIP_KINDS = ['法宝', '武器', '衣物'];

  // 物品增减 / 装备状态变化
  const beforeInv = Object.create(null);
  for (const it of before.inv) beforeInv[it.name] = it;
  const seen = new Set();
  for (const it of world.inventory || []) {
    seen.add(it.name);
    const kind = it.kind || kindFromText(it.name, it.desc);
    const prev = beforeInv[it.name];
    const qty = it.qty || 0;
    const prevQty = prev ? prev.qty : 0;
    if (qty > prevQty) {
      notices.push({ text: `获得「${it.name}」×${qty - prevQty}${it.rarity && it.rarity !== '凡品' ? '（' + it.rarity + '）' : ''}`, cls: 'gain' });
      if (EQUIP_KINDS.includes(kind)) dots.equip = true;
      else dots.bag = true;
    } else if (qty < prevQty) {
      notices.push({ text: `失去「${it.name}」×${prevQty - qty}`, cls: 'lose' });
    } else if (prev && !!it.equipped !== !!prev.equipped) {
      notices.push({ text: `${it.equipped ? '装备' : '卸下'}「${it.name}」`, cls: 'equip' });
      dots.equip = true;
    }
  }
  for (const name of Object.keys(beforeInv)) {
    if (!seen.has(name)) notices.push({ text: `失去「${name}」×${beforeInv[name].qty}`, cls: 'lose' });
  }

  // 任务新增 / 状态变化
  const beforeQ = new Map(before.quests.map((q) => [q.title, q.status]));
  for (const q of world.quests || []) {
    const prev = beforeQ.get(q.title);
    if (prev === undefined) {
      notices.push({ text: `新任务：「${q.title}」`, cls: 'quest' });
      dots.quest = true;
    } else if (prev !== q.status) {
      notices.push({ text: `任务「${q.title}」${questStatusLabel(q.status)}`, cls: q.status === 'failed' ? 'lose' : 'quest' });
      dots.quest = true;
    }
  }

  // 目标提示只依据引擎实际落地的状态，不使用模型自报的 goalNote。
  if (JSON.stringify(world.goal || {}) !== before.goal || (world.flags.goalCompleted === true) !== before.goalCompleted) {
    const goal = world.goal || {};
    const completed = world.flags.goalCompleted === true && !before.goalCompleted;
    const detail = [goal.desc || goal.type, goal.status].filter(Boolean).join(' · ');
    notices.push({ text: `【目标${completed ? '达成' : '更新'}】${detail || '目标状态已更新'}`, cls: 'quest' });
    dots.quest = true;
  }

  // 新势力（AI/玩家提到或遇见的江湖势力 → 已建档进图鉴）
  const beforeF = new Set(before.factions || []);
  for (const f of world.factions || []) {
    if (!beforeF.has(f.name)) {
      notices.push({ text: `新势力：「${f.name}」已收录图鉴`, cls: 'quest' });
      dots.codex = true;
    }
  }

  // 正邪 / 声望变化
  const m = player.morality - before.morality;
  if (m > 0) notices.push({ text: `正邪 +${m}（当前 ${player.morality} · ${moralityLabel(player.morality)}）`, cls: 'gain' });
  else if (m < 0) notices.push({ text: `正邪 ${m}（当前 ${player.morality} · ${moralityLabel(player.morality)}）`, cls: 'lose' });
  const r = player.reputation - before.reputation;
  if (r > 0) notices.push({ text: `声望 +${r}（当前 ${player.reputation}）`, cls: 'gain' });
  else if (r < 0) notices.push({ text: `声望 ${r}（当前 ${player.reputation}）`, cls: 'lose' });

  // 事迹 / 图鉴 / 成就 红点
  if ((world.events || []).length > before.eventsLen) dots.chronicle = true;
  const codexNow = (world.items || []).length + (world.skills || []).length + (world.npcs || []).length + (world.locations || []).length;
  if (codexNow > before.codexLen) dots.codex = true;
  if ((world.achievements || []).length > before.achLen) dots.achieve = true;

  // 突破伐毛洗髓：气血上限提升，当前气血同步充盈
  if (player.maxHp > before.maxHp) {
    notices.push({ text: `突破伐毛洗髓：气血上限提升至 ${player.maxHp}，当前气血同步充盈（${player.hp}/${player.maxHp}）`, cls: 'gain' });
  }

  // 生死一线（濒死）：进入与解除都要大声告诉玩家
  const imminentNow = !!world.flags.deathImminent;
  if (imminentNow && !before.deathImminent) {
    notices.push({ text: '☠【生死一线】你已命悬一线！下一回合务必设法脱险（逃命/服丹/呼救/破财免灾），否则恐身死道消。', cls: 'lose' });
  } else if (!imminentNow && before.deathImminent) {
    notices.push({ text: '✅ 你从鬼门关前捡回一条命，濒死状态解除。', cls: 'gain' });
  }

  for (const n of notices) appendSystem(n.text, n.cls);
  for (const [tab, on] of Object.entries(dots)) if (on) setTabDot(tab, true);
}
function setTabDot(name, on) {
  const dot = document.querySelector(`.tab-dot[data-dot="${name}"]`);
  if (dot) dot.classList.toggle('hidden', !on);
}
function clearAllDots() {
  document.querySelectorAll('.tab-dot').forEach((d) => d.classList.add('hidden'));
}

// ---------- 状态面板渲染 ----------
function bar(v, max = 100) {
  const pct = Math.max(0, Math.min(100, Math.round((v / max) * 100)));
  return `<span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>`;
}
function moralityLabel(v) {
  if (v >= 30) return '正道';
  if (v <= -30) return '魔道';
  return '中庸';
}
// 江湖地位：正邪+声望的处境展示（NPC 态度/物价/遭遇都会随此变化）
function stanceTag(st) {
  const cls = st.alignment === '正道' ? 'align-righteous' : (st.alignment === '魔道' ? 'align-demonic' : 'align-neutral');
  return `<span class="faction-align ${cls}">${esc(st.alignment)}</span><span class="faction-rel rel-neutral">${esc(st.repLabel)}</span>`;
}
function stanceTip(st) {
  const parts = {
    '正道': '正派敬重、物价让利、机缘趋善；魔道敌视，谨防暗害。',
    '魔道': '正道通缉盘查、物价抬升；黑市与魔道势力欢迎，掠夺更丰。',
    '中庸': '正魔两不讨好，NPC 态度全看声望。',
  };
  const rep = st.rep === 'high' ? '声望显赫：人人给三分薄面、争相结交。' : (st.rep === 'low' ? '声望低微：被轻视、抬价、甚至拒之门外。' : '小有名气：态度中立，需经营名声。');
  return `正邪 ${st.morality}（${st.alignment}）· 声望 ${st.reputation}。${parts[st.alignment]}${rep}`;
}
// 难度行悬停：把本档难度的实际数值讲清楚
function diffTip(s) {
  const d = DIFFICULTIES[s.difficulty] || DIFFICULTIES['普通'];
  return `难度 ${s.difficulty}：受伤×${d.damageMult}、灵石收益×${d.gainMult}、突破/渡劫成功率${d.breakBonus >= 0 ? '+' : ''}${d.breakBonus}%、高危行为坠入濒死 ${Math.round(d.deathHigh * 100)}%、致命行为坠入濒死 ${Math.round(d.deathLethal * 100)}%（濒死≠死亡，有一回合脱险机会）。节奏 ${s.pace}：${s.pace === '快' ? '成长 2 倍速、机缘更密集。' : '循序渐进。'}修为增益 ${s.cultGain || '1x'}：直接放大每回合修为成长。`;
}
// 本局概览：策略玩家视角的飞升进度 + 前置条件清单
function overviewHtml() {
  const p = player;
  const s = world.settings || {};
  const total = REALM_LADDER.length;
  const idx = realmIndex(p.realm);
  const prog = Math.max(0, Math.min(100, Math.round(((idx + (p.cultivation || 0) / 100) / (total - 1)) * 100)));
  const checks = [];
  if (world.flags && world.flags.deathImminent) {
    checks.push({ label: '状态', ok: false, detail: '☠ 生死一线（濒死）：下一回合务必设法脱险' });
  }
  const atTrib = String(p.realm).startsWith('渡劫');
  checks.push({ label: '境界（渡劫期）', ok: atTrib, detail: atTrib ? p.realm : `当前 ${p.realm}，距渡劫还差 ${realmIndex('渡劫初期') - idx} 阶` });
  const heart = (p.morality || 0) >= 30 || (p.reputation || 0) >= 50;
  checks.push({ label: '道心', ok: heart, detail: `正邪 ${p.morality} · 声望 ${p.reputation}（正邪≥30 或 声望≥50）` });
  const guard = (world.inventory || []).some((it) => it.equipped && (it.kind === '法宝' || it.kind === '衣物'));
  checks.push({ label: '护身法宝/衣物', ok: guard, detail: guard ? '已装备' : '未装备（渡劫更凶险）' });
  const dharma = (world.npcs || []).some((n) => /道侣|双修|拜师|师徒/.test(n.relation || ''));
  checks.push({ label: '护法之人', ok: dharma, detail: dharma ? '有人护法（成功率+10%）' : '无道侣/师徒护法' });
  const limit = s.turnLimit || 0;
  if (limit > 0) {
    const left = Math.max(0, limit - (world.turn || 0));
    checks.push({ label: '回合预算', ok: left > 0, detail: `剩 ${left}/${limit} 回合` });
  }
  const rows = checks.map((c) => `<div class="ov-row ${c.ok ? 'ok' : 'no'}"><span class="ov-name">${c.label}</span><span class="ov-detail">${c.ok ? '✓' : '✗'} ${esc(c.detail)}</span></div>`).join('');
  return `
    <div class="overview">
      <div class="ov-head"><span class="ov-title">本局概览 · 飞升进度</span><span class="ov-turn">第 ${world.turn || 0} 回合</span></div>
      <div class="ov-progress">${bar(prog)}<span class="ov-pct">${prog}%</span></div>
      <div class="ov-rows">${rows}</div>
    </div>`;
}
// 天时三行：只给征兆，不给时代名；境界越低看到越少
function skyRowsHtml(p, world, tipFn) {
  const sky = skyOf(p, world);
  const tipText = sky.tier === 0
    ? '你还看不出个子丑寅卯，只觉得有些不对——多经历些事，或等修为高些，才看得明白。'
    : sky.tier === 1
      ? '筑基之后，你能从天色、货价与人流里看出些门道了。'
      : '元婴之后，天色、地气、人心在你眼里都藏不住：哪句是虚的，你一听就知道。';
  const labels = [];
  if (sky.sky) labels.push(['天时', sky.sky]);
  if (sky.market) labels.push(['市面', sky.market]);
  if (sky.people) labels.push(['人事', sky.people]);
  if (!labels.length) labels.push(['天时', sky.vague]);
  const rows = labels.map(([k, v]) => `<div class="stat-row" ${tipFn(tipText)}><dt>${k}</dt><dd>${esc(v)}</dd></div>`);
  const rumors = rumorsFor(p, world).slice(-2)
    .map((x) => `<div class="stat-row"><dt>传闻</dt><dd>${esc(x)}</dd></div>`);
  return rows.join('') + rumors.join('');
}

function renderStatus() {
  const p = player;
  const s = world.settings || {};
  const repBonus = Math.round((reputationMultiplier(p.reputation) - 1) * 100);
  const ri = realmIndex(p.realm);
  const st = stanceProfile(p);
  const MAJORS = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'];
  const curMajor = p.realm === '飞升' ? '飞升' : realmMajor(p.realm);
  const ladder = MAJORS.map((m) => {
    const cls = m === curMajor ? 'cur' : (MAJORS.indexOf(m) < MAJORS.indexOf(curMajor) ? 'past' : '');
    return `<span class="rl-step ${cls}">${m}</span>`;
  }).join('<span class="rl-sep">·</span>');
  const relMult = relationCultMult(world.npcs);
  const facMult = factionCultMult(world.factions);
  const relBonus = Math.round((relMult * facMult - 1) * 100);
  const tip = (t) => `data-tip="${esc(t)}"`;
  $('statusPanel').innerHTML = `
    <div class="realm-ladder">${ladder}</div>
    <div class="stat-row" ${tip('你的名字与出身')}><dt>姓名</dt><dd>${esc(p.name)}</dd></div>
    <div class="stat-row" ${tip(`当前境界：${p.realm}（第 ${ri + 1}/${REALM_LADDER.length} 阶）。境界阶梯（大境）：${MAJORS.join(' → ')}。修为圆满后需机缘（丹药/传承/顿悟/磨砺）破境，不可一步登天。`)}><dt>境界</dt><dd>${esc(p.realm)}</dd></div>
    <div class="stat-row" ${tip('当前境界的修炼进度（0~100%）。到 100% 后进入瓶颈，需机缘（丹药/传承/顿悟/磨砺）才能突破。')}><dt>修为进度</dt><dd>${bar(p.cultivation)} ${p.cultivation}%</dd></div>
    <div class="stat-row" ${tip('关系与势力的修炼加成：道侣+25%、师徒+20%、挚友/结义+10%（取最高一档）；每个结盟势力+5%（上限+15%）。')}><dt>关系·势力</dt><dd>${relBonus > 0 ? '+' + relBonus + '%' : '无加成'}</dd></div>
    <div class="stat-row" ${tip(`气血：${p.hp}/${p.maxHp}。受伤会降低气血，归零则身死道消；气血上限随境界提升。`)}><dt>气血</dt><dd>${bar(p.hp, p.maxHp)} ${p.hp}/${p.maxHp}</dd></div>
    <div class="stat-row" ${tip('剩余寿元。随境界提升而延长、随时间流逝而消耗；寿元耗尽则坐化。')}><dt>寿元</dt><dd>${Math.round(p.lifespan)} 岁</dd></div>
    <div class="stat-row" ${tip('游戏内时间（年/月/日）。短场景不流逝时间，闭关、赶路、等待会推进时间并消耗寿元。')}><dt>时间</dt><dd>第 ${esc(world.date?.year || 1)} 年 ${esc(world.date?.month || 1)} 月 ${esc(world.date?.day || 1)} 日</dd></div>
    ${skyRowsHtml(p, world, tip)}
    <div class="stat-row" ${tip('通用货币，可购买丹药、法宝、功法等。获得收益受声望与正邪分来源加成。')}><dt>灵石</dt><dd>${p.spiritStones}</dd></div>
    <div class="stat-row" ${tip(`正邪：${p.morality}（${moralityLabel(p.morality)}）。≥30 正道、≤-30 魔道、中间中庸。正道行善收益高、机缘好但掠夺打折；魔道反之，且被正道通缉。`)}><dt>正邪</dt><dd>${p.morality > 0 ? '+' : ''}${p.morality} ${moralityLabel(p.morality)}</dd></div>
    <div class="stat-row" ${tip(`声望：${p.reputation}。越高 NPC 越敬重、收益越高（当前 ${repBonus >= 0 ? '+' : ''}${repBonus}%）。`)}><dt>声望</dt><dd>${bar(p.reputation)} ${p.reputation}（收益 ${repBonus >= 0 ? '+' : ''}${repBonus}%）</dd></div>
    <div class="stat-row" ${tip(stanceTip(st))}><dt>江湖地位</dt><dd>${stanceTag(st)}</dd></div>
    ${overviewHtml()}
    <div class="stat-row" ${tip('当前回合数。若设了通关回合上限，超时未飞升将失败。')}><dt>回合</dt><dd>第 ${world.turn || 0} 回合</dd></div>
    <div class="stat-row" ${tip(diffTip(s))}><dt>难度 · 节奏</dt><dd>${esc(s.difficulty || '普通')} · ${esc(s.pace || '慢')} · ${esc(s.cultGain || '1x')}</dd></div>
    ${world.flags.qiDeviation ? '<div class="stat-row qi-dev"><dt>状态</dt><dd>走火入魔（修炼受阻）</dd></div>' : ''}
    ${breakBtns()}
  `;
}

// ---------- 突破 / 渡劫 ----------
function breakBtns() {
  if (!playing) return '';
  const p = player;
  if ((p.cultivation || 0) < 100) return '';
  if (p.realm === '渡劫后期') {
    return `<div class="break-btns"><button class="item-btn break-btn" data-break="ascend" type="button">渡劫飞升</button></div>`;
  }
  if (/后期$/.test(p.realm)) {
    return `<div class="break-btns"><button class="item-btn break-btn" data-break="major" type="button">突破大境界</button></div>`;
  }
  return '';
}
function breakAdvice(player, world, kind) {
  const adv = [];
  const eq = (world.inventory || []).filter((it) => it.equipped);
  if (!eq.some((it) => it.kind === '法宝' || it.kind === '衣物')) adv.push('缺少护身法宝/衣物');
  if (!(world.npcs || []).some((n) => /道侣|双修|拜师|师徒/.test(n.relation || ''))) adv.push('无道侣/师傅护法');
  if ((player.morality || 0) < 30 && (player.reputation || 0) < 50) adv.push('道心不稳（正邪/声望不足）');
  if (kind === 'ascend' && player.realm !== '渡劫后期') adv.push('境界不足（需渡劫后期）');
  return adv;
}
let breakKind = 'major';
function openBreakModal(kind) {
  if (!playing || busy) return;
  breakKind = kind;
  const rate = breakthroughRate(player, world, kind);
  const adv = breakAdvice(player, world, kind);
  const level = rate >= 75 ? '低' : (rate >= 45 ? '中' : '高');
  $('breakTitle').textContent = kind === 'ascend' ? '渡劫飞升' : '大境界突破';
  const deathPct = kind === 'ascend' ? Math.round(tribulationDeathProb(rate, world.settings && world.settings.difficulty) * 100) : 0;
  $('breakBody').innerHTML = `
    <div class="break-rate">成功率 <b class="${rate >= 45 ? 'gold' : 'danger'}">${rate}%</b> · 风险 <b>${level}</b>${kind === 'ascend' ? ` · 失败致死率约 <b>${deathPct}%</b>` : ''}</div>
    ${adv.length ? `<ul class="break-advice">${adv.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p>万事俱备，只待一搏。</p>'}
    <p class="muted">失败可能走火入魔、修为受损；渡劫失败更可能身死道消${kind === 'ascend' && deathPct > 0 ? '（神品·逆天改命词条可免死一次，词条将消耗）' : ''}。</p>`;
  $('breakModal').classList.remove('hidden');
}
function confirmBreak() {
  $('breakModal').classList.add('hidden');
  lastTurnState = snapshotState(); // 渡劫失败身死道消也可回退
  const res = attemptBreakthrough(player, world, breakKind);
  renderAll();
  saveGame(AUTO_SLOT);
  appendSystem(`【${breakKind === 'ascend' ? '渡劫' : '突破'}】成功率${res.rate}% → ${res.note}`);
  if (res.success && breakKind === 'ascend') {
    const ending = evaluateEndings(player, world);
    if (ending) showEnding(ending);
  } else if (res.death) {
    const ending = evaluateEndings(player, world);
    if (ending) showEnding(ending);
  }
}
function questStatusLabel(s) {
  return { active: '进行中', completed: '已完成', failed: '已失败', cancelled: '已放弃' }[s] || s;
}
function renderQuest() {
  const item = (q) => {
    const deadline = questDeadlineInfo(q, world);
    let deadlineDescription = deadline.text;
    if (q.status !== 'active') {
      if (deadline.deadlineDate) {
        const date = deadline.deadlineDate;
        deadlineDescription = `${date.year}年${date.month}月${date.day}日`;
      } else if (deadline.pending) {
        deadlineDescription = `${deadline.text.replace('待确认', '未确认')}（任务已结束）`;
      }
    }
    const deadlineText = [q.timeNode, deadlineDescription].filter(Boolean).filter((text, index, all) => all.indexOf(text) === index).join(' · ');
    return `
    <div class="quest q-${q.status}">
      <div class="quest-head">
        <span class="quest-tag">${q.type === 'main' ? '主线' : '支线'}</span>
        <span class="quest-title">${esc(q.title)}</span>
        <span class="quest-status">${questStatusLabel(q.status)}</span>
        ${q.type === 'side' && q.status === 'active' ? `<button class="quest-cancel" data-cancel="${esc(q.title)}" type="button" title="放弃此任务">取消</button>` : ''}
      </div>
      ${q.objective ? `<div class="quest-line"><b>目标</b>：${esc(q.objective)}</div>` : ''}
      ${q.timeNode || deadline.deadlineDate || deadline.pending ? `<div class="quest-line"><b>期限</b>：${esc(deadlineText)}</div>` : ''}
      ${q.failureReason ? `<div class="quest-line"><b>失败原因</b>：${esc(q.failureReason)}</div>` : ''}
      ${q.reward ? `<div class="quest-line"><b>奖励</b>：${esc(q.reward)}</div>` : ''}
    </div>`;
  };
  const mains = world.quests.filter((q) => q.type === 'main' && q.status === 'active');
  const sides = world.quests.filter((q) => q.type === 'side' && q.status === 'active');
  const ended = world.quests.filter((q) => q.status !== 'active');
  let html = '';
  if (mains.length) html += '<div class="quest-group">主线</div>' + mains.map(item).join('');
  if (sides.length) html += '<div class="quest-group">支线</div>' + sides.map(item).join('');
  if (ended.length) html += `<details class="quest-ended"><summary>已结束（${ended.length}）</summary>` + ended.map(item).join('') + '</details>';
  $('questPanel').innerHTML = html || '<div class="empty">暂无任务</div>';
}
function kindCls(kind) {
  return { '丹药': 'pill', '法宝': 'treasure', '武器': 'weapon', '衣物': 'cloth', '天材地宝': 'elixir', '材料': 'mat' }[kind] || 'mat';
}

// 背包：丹药 / 天材地宝 / 材料（可折叠分组）
function renderBag() {
  const inv = world.inventory || [];
  const kinds = ['丹药', '天材地宝', '材料'];
  const groups = {};
  for (const it of inv) {
    const kind = it.kind || kindFromText(it.name, it.desc);
    if (kinds.includes(kind)) (groups[kind] = groups[kind] || []).push(it);
  }
  let html = '';
  for (const kind of kinds) {
    const list = groups[kind];
    if (!list || !list.length) continue;
    html += `<details class="bag-group" open><summary>${kind}（${list.length}）</summary>`;
    for (const it of list) {
      const action = ITEM_KINDS[kind].action === 'use' ? `<button class="item-btn" data-use="${esc(it.name)}" type="button">使用</button>` : '';
      html += `
        <div class="bag-item" data-item="${esc(it.name)}">
          <div class="bag-head">
            <b class="codex-name bag-link" data-item="${esc(it.name)}" title="查看图鉴">${esc(it.name)}</b>
            <span class="item-kind kind-${kindCls(kind)}">${kind}</span>
            <span class="bag-qty">×${it.qty}</span>
            ${action}
            <button class="item-btn item-btn-discard" data-discard="${esc(it.name)}" type="button" title="丢弃">弃</button>
          </div>
          ${it.desc ? `<div class="bag-desc">${esc(it.desc)}</div>` : ''}
        </div>`;
    }
    html += `</details>`;
  }
  $('bagPanel').innerHTML = html || '<div class="empty">背包空空如也</div>';
}

// 装备：法宝 / 武器 / 衣物（已装备置顶 + 可折叠分组）
function gradeTip(grade) {
  const m = gradeMult(grade);
  return `品阶：${grade}（修炼倍率 ${m}x）。品阶由低到高：基础 1.0x → 玄阶 1.3x → 地阶 1.6x → 天阶 2.0x → 仙阶 2.5x。品阶越高，装备带来的修炼加成越强。`;
}
// 统一生成物品的说明标签（品类/品阶/稀有度/词条）
function tagSpans(it) {
  const kind = it.kind || kindFromText(it.name, it.desc);
  const parts = [`<span class="item-kind kind-${kindCls(kind)}">${esc(kind)}</span>`];
  if (it.grade) parts.push(`<span class="skill-grade" data-tip="${esc(gradeTip(it.grade))}">${esc(it.grade)}</span>`);
  if (it.rarity && it.rarity !== '凡品') {
    const rarityCls = { '灵品': 'ling', '玄品': 'xuan', '仙品': 'xian', '神品': 'shen' }[it.rarity] || 'fan';
    parts.push(`<span class="rarity-tag rarity-${rarityCls}" data-tip="稀有度：${esc(it.rarity)}（获得难度越高，加成越强）">${esc(it.rarity)}</span>`);
  }
  // 词条三分流：机械词条（金色，带效果说明）vs 叙事词条（灰色，无数值效果）
  if (it.affix) {
    const labels = affixLabels(it.affix);
    if (labels.length) {
      parts.push(labels.map((l) => `<span class="affix-tag mech" data-tip="机械词条「${esc(l.label)}」：${esc(l.desc)}">${esc(l.label)}</span>`).join(''));
    } else {
      parts.push(`<span class="affix-tag narrative" data-tip="叙事词条（趣味描述，无数值效果）：${esc(it.affix)}">${esc(it.affix)}</span>`);
    }
  }
  return parts.join('');
}
function equipItemRow(it) {
  const kind = it.kind || kindFromText(it.name, it.desc);
  const isFunc = isFunctionalTreasure(it);
  const equipLabel = it.equipped ? '卸下' : (kind === '衣物' ? '穿戴' : '装备');
  const equipBtn = isFunc
    ? '<span class="perm-tag" title="功能法宝常驻生效，无需装备">常驻生效</span>'
    : `<button class="item-btn" data-equip="${esc(it.name)}" type="button">${equipLabel}</button>`;
  return `
    <div class="bag-item" data-item="${esc(it.name)}">
      <div class="bag-head">
        <b class="codex-name bag-link" data-item="${esc(it.name)}" title="查看图鉴">${esc(it.name)}</b>
        <span class="bag-actions">
          ${equipBtn}
          <button class="item-btn item-btn-discard" data-discard="${esc(it.name)}" type="button" title="丢弃">弃</button>
        </span>
      </div>
      <div class="bag-tags">${tagSpans(it)}</div>
      ${it.desc ? `<div class="bag-desc">${esc(it.desc)}</div>` : ''}
      ${it.equipped ? '<div class="bag-desc equipped-note">已装备（加成生效）</div>' : ''}
    </div>`;
}
function renderEquip() {
  const inv = world.inventory || [];
  const kindOf = (it) => it.kind || kindFromText(it.name, it.desc);
  const weapons = inv.filter((it) => kindOf(it) === '武器');
  const clothes = inv.filter((it) => kindOf(it) === '衣物');
  const treasures = inv.filter((it) => kindOf(it) === '法宝');
  const funcs = treasures.filter(isFunctionalTreasure);
  const mainTreasures = treasures.filter((it) => !isFunctionalTreasure(it));
  const weaponSlots = 1 + (activeHas(world.inventory, 'dualWield') ? 1 : 0);
  const treasureSlots = 1 + (activeHas(world.inventory, 'multiTreasure') ? 1 : 0);
  const group = (title, list) => {
    const eq = list.filter((it) => it.equipped);
    const uneq = list.filter((it) => !it.equipped);
    let h = `<details class="bag-group" open><summary>${title}（${list.length}）</summary>`;
    if (eq.length) h += `<div class="equipped-group">${eq.map(equipItemRow).join('')}</div>`;
    h += uneq.map(equipItemRow).join('');
    h += '</details>';
    return h;
  };
  let html = '';
  html += `<div class="slot-info">武器槽 ${weapons.filter((t) => t.equipped).length}/${weaponSlots}${weaponSlots > 1 ? '（双持）' : ''} · 法宝槽 ${mainTreasures.filter((t) => t.equipped).length}/${treasureSlots}${treasureSlots > 1 ? '（多宝）' : ''}${funcs.length ? ` · 功能法宝 ${funcs.length} 件常驻生效` : ''}</div>`;
  if (mainTreasures.length) html += group('法宝（修行 · 战斗）', mainTreasures);
  if (weapons.length) html += group('武器', weapons);
  if (clothes.length) html += group('衣物', clothes);
  if (funcs.length) html += `<details class="bag-group perm-group" open><summary>功能法宝 · 常驻生效（${funcs.length}）</summary><p class="hint">功能法宝无需装备即常驻生效、不占法宝槽、不提供修炼倍率。</p>${funcs.map(equipItemRow).join('')}</details>`;
  $('equipPanel').innerHTML = html || '<div class="empty">尚未获得装备</div>';
}

function useItem(name) {
  if (busy || !playing) return;
  sendTurn(`我使用【${name}】`);
}
function toggleEquip(name) {
  const it = (world.inventory || []).find((t) => t.name === name);
  if (!it) return;
  if (isFunctionalTreasure(it)) { appendSystem('【功能法宝】此物常驻生效，无需装备。'); return; }
  if (!it.equipped) equipItem(world, it); // 槽位规则统一（双持/多宝）
  else it.equipped = false;
  renderAll();
  saveGame(AUTO_SLOT);
  appendSystem(`【装备】${name} ${it.equipped ? '已装备' : '已卸下'}。`);
}
function discardItem(name) {
  const it = (world.inventory || []).find((t) => t.name === name);
  if (!it) return;
  if (!window.confirm(`确定丢弃【${name}】×${it.qty} 吗？`)) return;
  world.inventory = world.inventory.filter((t) => t.name !== name);
  renderAll();
  saveGame(AUTO_SLOT);
  appendSystem(`你丢弃了【${name}】。`);
}

function subjectType(subject) {
  if (subject === player.name) return 'player';
  const name = typeof subject === 'string' ? subject : '';
  const unsafeNames = ['__proto__', 'constructor', 'prototype'];
  const aliases = world.aliasMap;
  const descriptor = aliases && typeof aliases === 'object' && !Array.isArray(aliases) && !unsafeNames.includes(name)
    ? Object.getOwnPropertyDescriptor(aliases, name)
    : null;
  const alias = descriptor && descriptor.value;
  const resolved = typeof alias === 'string' && alias.trim() && !unsafeNames.includes(alias.trim()) ? alias : name;
  if (world.npcs.some((n) => n.name === resolved)) return 'person';
  if (world.locations.some((l) => l.name === resolved)) return 'place';
  if (world.factions.some((f) => f.name === resolved)) return 'faction';
  if (world.quests && world.quests.some((q) => q.title === resolved)) return 'goal';
  if (world.goal && typeof world.goal.type === 'string' && world.goal.type && (resolved === world.goal.type || resolved.includes(world.goal.type))) return 'goal';
  return 'other';
}
let chronicleView = 'stage'; // 'stage'=按阶段 | 'thread'=按脉络
function renderChronicle() {
  const events = world.events || [];
  const toggle = `
    <div class="chronicle-view">
      <button type="button" data-view="stage" class="cv-btn ${chronicleView === 'stage' ? 'active' : ''}">按阶段</button>
      <button type="button" data-view="thread" class="cv-btn ${chronicleView === 'thread' ? 'active' : ''}">按脉络</button>
    </div>`;
  if (!events.length) {
    $('chroniclePanel').innerHTML = toggle + '<div class="empty">暂无事迹</div>';
    return;
  }
  const str = (v) => (v && v !== 'undefined' && v !== 'null' ? v : '');
  const item = (e) => {
    const t = e.turn ? (e.date ? `第${e.turn}回合 · ${esc(e.date)}` : `第${e.turn}回合`) : '—';
    const subject = str(e.subject) || str(e.name);
    const subjEl = subject ? `<span class="chronicle-subject ${'type-' + subjectType(subject)}">${esc(subject)}</span>` : '';
    const rel = str(e.relation);
    const relTag = rel ? `<span class="chronicle-rel">${esc(rel)}</span>` : '';
    const isNew = e.turn && (world.turn || 0) - e.turn <= 5 ? '<span class="chronicle-new">新</span>' : '';
    return `<div class="chronicle-item"><div class="chronicle-time">${t}${isNew}</div><div class="chronicle-body">${subjEl} <b>${esc(str(e.title))}</b>${relTag}${str(e.desc) ? '：' + esc(str(e.desc)) : ''}</div></div>`;
  };
  let html = toggle;
  if (chronicleView === 'stage') {
    // 按境界阶段分组（大折叠栏）
    const stageGroups = Object.create(null);
    for (const e of events) {
      const stage = str(e.stage) || '早期';
      if (!stageGroups[stage]) stageGroups[stage] = [];
      stageGroups[stage].push(e);
    }
    const stages = Object.keys(stageGroups).sort((a, b) => {
      if (a === '早期') return -1;
      if (b === '早期') return 1;
      return realmIndex(a) - realmIndex(b);
    });
    for (const stage of stages) {
      const list = stageGroups[stage].sort((a, b) => (a.turn || 0) - (b.turn || 0));
      html += `<details class="chronicle-group chronicle-stage"><summary><span class="stage-name">${esc(stage)}</span><span class="chronicle-count">（${list.length}）</span></summary>${list.map(item).join('')}</details>`;
    }
  } else {
    // 按主体脉络：人物/势力/地点/目标 → 各自时间线，读一个角色的完整故事
    const typeOrder = { player: 0, person: 1, faction: 2, place: 3, goal: 4, other: 5 };
    const threads = Object.create(null);
    for (const e of events) {
      const s = str(e.subject) || str(e.name) || '未名';
      if (!threads[s]) threads[s] = { subject: s, type: subjectType(s), list: [] };
      threads[s].list.push(e);
    }
    const entries = Object.values(threads).sort((a, b) => {
      const ta = typeOrder[a.type] ?? 5;
      const tb = typeOrder[b.type] ?? 5;
      if (ta !== tb) return ta - tb;
      const fa = Math.min(...a.list.map((x) => x.turn || 0));
      const fb = Math.min(...b.list.map((x) => x.turn || 0));
      return fa - fb;
    });
    for (const th of entries) {
      const list = th.list.sort((a, b) => (a.turn || 0) - (b.turn || 0));
      const body = list.map(item).join('');
      html += `<details class="chronicle-group chronicle-thread"${list.length <= 3 ? ' open' : ''}><summary><span class="chronicle-subject ${'type-' + th.type}">${esc(th.subject)}</span><span class="chronicle-count">（${list.length}）</span></summary>${body}</details>`;
    }
  }
  $('chroniclePanel').innerHTML = html;
}

function openChronicle(subject) {
  switchTab('chronicle');
  const groups = document.querySelectorAll('#chroniclePanel .chronicle-group');
  for (const g of groups) {
    const subj = g.querySelector('.chronicle-subject');
    if (subj && subj.textContent === subject) {
      g.open = true;
      g.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
  }
}

function openCodexItem(itemName) {
  switchTab('codex');
  const groups = document.querySelectorAll('#codexPanel .codex-group');
  for (const g of groups) {
    const summary = g.querySelector('summary');
    if (summary && summary.textContent.includes('物品')) {
      g.open = true;
      break;
    }
  }
  const items = document.querySelectorAll('#codexPanel .codex-item');
  for (const item of items) {
    const nameEl = item.querySelector('.codex-name');
    if (nameEl && nameEl.textContent === itemName) {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.classList.add('flash-gold');
      setTimeout(() => item.classList.remove('flash-gold'), 1200);
      break;
    }
  }
}

function renderCodex() {
  const itemLine = (x, withRelation) => {
    const rel = withRelation && x.relation
      ? (() => {
          const b = bondOf(x);
          return `<span class="codex-rel" data-tip="关系：${esc(x.relation)}；恩${b.debt} · 怨${b.grudge} · 信${b.trust} · 需${b.need}">（${esc(x.relation)}）</span>`;
        })()
      : '';
    const desc = x.desc ? '：' + esc(x.desc) : '';
    const stage = withRelation ? npcInsightStage(x) : '';
    const persLabel = x.trait || x.personality;
    const condText = x.condition && x.condition.state ? '伤情：' + x.condition.state + '（调养中）' : '';
    const detail = [
      x.desire ? '想要：' + x.desire : '',
      x.taboo ? '忌讳：' + x.taboo : '',
      x.speech ? '口吻：' + x.speech : '',
      condText,
    ].filter(Boolean).join('；');
    const linkText = withRelation
      ? (world.npcLinks || [])
          .filter((l) => l && linkIsKnown(l) && (l.a === x.name || l.b === x.name))
          .map((l) => `${l.a === x.name ? l.b : l.a}（${l.type}）`)
          .join('、')
      : '';
    const pers = withRelation
      ? (stage === 'insight'
          ? `<span class="npc-pers" data-tip="真实性格（深交后揭示）：${esc(persLabel)}${detail ? '；' + esc(detail) : ''}${linkText ? '；关系网：' + esc(linkText) : ''}">${esc(persLabel)}</span>`
          : (stage === 'acquaintance'
              ? `<span class="npc-pers temp" data-tip="初识气质（第一印象，未必是真性情）：${esc(x.temperament)}${linkText ? '；关系网：' + esc(linkText) : ''}">${esc(x.temperament)}</span>`
              : `<span class="npc-pers unknown" data-tip="尚未深交，真性情未明——多多往来，方能看清此人">性格未明</span>`))
      : '';
    const gradeTag = !withRelation && x.grade ? `<span class="skill-grade">${esc(x.grade)}</span>` : '';
    const nameEl = withRelation
      ? `<b class="codex-name codex-link" data-subject="${esc(x.name)}" title="点击查看事迹">${esc(x.name)}</b>`
      : `<b class="codex-name">${esc(x.name)}</b>`;
    return `<div class="codex-item">${nameEl}${rel}${pers}${gradeTag}${desc}</div>`;
  };
  const alignTag = (f) => {
    const a = factionAlignment(f);
    const cls = a === '正道' ? 'align-righteous' : (a === '魔道' ? 'align-demonic' : 'align-neutral');
    return `<span class="faction-align ${cls}" title="阵营立场">${esc(a)}</span>`;
  };
  const typeTag = (f) => (f.type ? `<span class="faction-type" title="势力类型">${esc(f.type)}</span>` : '');
  const factionTag = (rel) => {
    const r = rel || '中立';
    const cls = r === '结盟' ? 'rel-ally' : (r === '敌对' ? 'rel-hostile' : 'rel-neutral');
    return `<span class="faction-rel ${cls}" title="与你的关系">${esc(r)}</span>`;
  };
  const factionLine = (f) => {
    const known = !!(world.knownSecrets && f.id && world.knownSecrets[f.id] === 'revealed');
    const badge = known ? `<span class="faction-type" title="你已查明这家势力的底细">底细已明</span>` : '';
    return `<div class="codex-item"><b class="codex-name">${esc(f.name)}</b>${alignTag(f)}${typeTag(f)}${factionTag(f.relation)}${badge}${f.desc ? '：' + esc(f.desc) : ''}</div>`;
  };
  // 势力分层：重要的常驻展示；只是耳闻/久未提及的收进折叠组，避免图鉴冗杂
  const IMPORTANT_TURNS = 15;
  const factionIsImportant = (f) => {
    if (f.relation === '结盟' || f.relation === '敌对') return true;
    if (f.seeded) return true;
    if ((world.events || []).some((e) => e.subject === f.name)) return true;
    if (f.notedTurn && (world.turn || 0) - f.notedTurn <= IMPORTANT_TURNS) return true;
    return false;
  };
  const factions = world.factions || [];
  const majorFactions = factions.filter(factionIsImportant);
  const minorFactions = factions.filter((f) => !factionIsImportant(f));
  const factionGroup = () => {
    const body = majorFactions.length ? majorFactions.map(factionLine).join('') : '<div class="codex-item muted">无</div>';
    let html = `<details class="codex-group"${majorFactions.length <= 6 ? ' open' : ''}><summary>势力（${factions.length}）</summary>${body}</details>`;
    if (minorFactions.length) {
      html += `<details class="codex-group"><summary>耳闻势力（${minorFactions.length}）</summary>${minorFactions.map(factionLine).join('')}</details>`;
    }
    return html;
  };
  // 物品条目：名字 + 说明标签 + 描述
  const itemCodexLine = (x) => `<div class="codex-item"><b class="codex-name">${esc(x.name)}</b><span class="codex-tags">${tagSpans(x)}</span>${x.desc ? '：' + esc(x.desc) : ''}</div>`;
  const group = (title, arr, renderFn) => {
    const body = arr.length ? arr.map(renderFn).join('') : '<div class="codex-item muted">无</div>';
    const open = arr.length <= 6 ? ' open' : '';
    return `<details class="codex-group"${open}><summary>${title}（${arr.length}）</summary>${body}</details>`;
  };
  $('codexPanel').innerHTML = `
    <div class="stat-row"><dt>世道</dt><dd>${esc(world.era || '未明')}</dd></div>
    ${(rumorsFor(player, world).length ? `<div class="codex-item"><b class="codex-name">传闻</b>${rumorsFor(player, world).map((x) => `<div class="codex-sub">· ${esc(x)}</div>`).join('')}</div>` : '')}
    ${factionGroup()}
    ${group('相识之人', world.npcs, (x) => itemLine(x, true))}
    ${group('地点', world.locations, (x) => itemLine(x, false))}
    ${group('物品', world.items, itemCodexLine)}
    ${group('功法', world.skills, (x) => itemLine(x, false))}
  `;
}
function renderAll() {
  renderStatus();
  renderQuest();
  renderBag();
  renderEquip();
  renderChronicle();
  renderCodex();
  renderAchievements();
  syncHotControls();
}
// ---------- 热切换：言出法随 / 大势（随时生效，引擎每回合实时读取）----------
function syncHotControls() {
  const g = $('godToggleBtn');
  if (g) {
    const on = playing ? !!(world.settings && world.settings.godMode) : !!gameOptions.godMode;
    g.textContent = on ? '开' : '关';
    g.classList.toggle('on', on);
  }
  const e = $('eraSelect');
  if (e) {
    const cur = playing ? (world.eraType || '乱世') : gameOptions.eraType;
    if (ERA_LEVELS.includes(cur)) e.value = cur;
  }
}
function toggleGodMode() {
  const target = playing ? world.settings : gameOptions;
  target.godMode = !target.godMode;
  if (playing) {
    saveGame(AUTO_SLOT);
    renderAll();
    appendSystem(target.godMode ? '✨ 言出法随已开启：心想事成，天地随你心意而动。' : '⚖ 言出法随已关闭：天道重归其常，因果自会流转。');
  } else {
    renderGameOptions();
  }
  syncHotControls();
}
function switchEraManually(v) {
  if (!ERA_TYPES[v]) return;
  if (playing) {
    world.eraType = v;
    world.era = ERA_TYPES[v].label;
    world.eraDeadline = undefined; // 切走旧期限；若切到秘境将启，下回合自动按默认设期
    saveGame(AUTO_SLOT);
    renderAll();
    // 调试用：不给玩家念时代名，只说天色变了
    appendSystem('🌌 天时似有变，且看下一回合天色与市面。', 'quest');
  } else {
    gameOptions.eraType = v;
    renderGameOptions();
  }
  syncHotControls();
}
function renderAchievements() {
  const el = $('achievementList');
  if (!el) return;
  el.innerHTML = world.achievements.length
    ? world.achievements.map((t) => `<li class="ach" data-tip="${esc(achievementDesc(t))}">${esc(t)}</li>`).join('')
    : '<li class="empty">暂无成就</li>';
}

// ---------- 成就检测 ----------
function flashAchieve() {
  const tab = document.querySelector('.tab[data-tab="achieve"]');
  const pane = $('pane-achieve');
  [tab, pane].forEach((el) => {
    if (!el) return;
    el.classList.remove('flash-gold');
    void el.offsetWidth;
    el.classList.add('flash-gold');
  });
}

function checkAchievements() {
  const got = evaluateAchievements(player, world);
  if (got.length) {
    world.achievements.push(...got);
    got.forEach((t) => appendSystem('🏆 达成成就：「' + t + '」'));
    renderAchievements();
    flashAchieve();
  }
}

// ---------- 记忆压缩 ----------
async function maybeCompressMemory() {
  if (history.length <= MEMORY_LIMIT) return;
  const overflow = history.slice(0, history.length - MEMORY_LIMIT);
  if (!overflow.length) return;
  try {
    $('topStatus').textContent = '整理记忆…';
    const summary = await callLLM(buildSummaryMessages(overflow), false);
    world.memory = (world.memory ? world.memory + '\n' : '') + summary.trim();
    history = history.slice(overflow.length);
  } catch (e) {
    appendSystem('记忆整理失败（不影响继续游戏）：' + e.message);
  }
}

// ---------- 存档/读档 ----------
function loadSaves() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch { return {}; }
}
function saveGame(slot) {
  try {
    const saves = loadSaves();
    saves[slot] = {
      player, world, history, log, mode, answers,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
    renderSaveSlots();
    return true;
  } catch (e) {
    appendSystem('存档失败：' + e.message);
    return false;
  }
}
function loadGame(slot) {
  const saves = loadSaves();
  const s = saves[slot];
  if (!s) { appendSystem('该存档位为空'); return; }
  player = { ...newPlayerState(), ...s.player };
  world = { ...newWorldState(), ...s.world };
  migrateQuestDeadlines(world); // 兼容旧回合期限；读档只迁移，不执行超时判罚
  ensureWorldGeo(world); // 旧档补区域坐标（幂等，不改数值、不判罚）
  history = Array.isArray(s.history) ? s.history : [];
  log = Array.isArray(s.log) ? s.log : [];
  mode = s.mode || 'random';
  Object.assign(answers, s.answers || {});
  playing = true;
  lastTurnState = null;
  pendingEnding = null;
  clearAllDots();
  const ro = $('endingReopenBtn');
  if (ro) ro.classList.add('hidden');

  $('chatScroll').innerHTML = '';
  log.forEach((m) => renderMsg(m.kind, m.text, false, m.cls || ''));
  setMode(mode);
  renderAll();
  $('topStatus').textContent = statusLine();
  setBusy(false);
}
function renderSaveSlots() {
  const el = $('saveSlots');
  if (!el) return;
  const saves = loadSaves();
  let html = '';
  for (const slot of ['1', '2', '3']) {
    const s = saves[slot];
    const info = s ? `${esc(s.player?.name || '?')} · ${new Date(s.savedAt).toLocaleString()}` : '（空）';
    html += `
      <div class="save-row">
        <span class="save-label">档位 ${slot}</span>
        <span class="save-info">${info}</span>
        <button type="button" class="mini" data-act="save" data-slot="${slot}">存</button>
        <button type="button" class="mini" data-act="load" data-slot="${slot}">读</button>
      </div>`;
  }
  el.innerHTML = html;
}
function refreshContinue() {
  const has = !!loadSaves()[AUTO_SLOT];
  $('continueBtn').classList.toggle('hidden', !has);
  $('landingContinueBtn').classList.toggle('hidden', !has);
}

// ---------- 新游戏 ----------
async function startGame() {
  if (!config.apiKey) { alert('请先在左侧填写 API Key'); return; }
  if (busy) return;
  busy = true;
  setBusy(true);
  $('topStatus').textContent = '创世中…';

  // 清空上一局
  $('chatScroll').innerHTML = '';
  log = [];
  lastTurnState = null;
  pendingEnding = null;
  clearAllDots();
  const ro0 = $('endingReopenBtn');
  if (ro0) ro0.classList.add('hidden');
  appendSystem('正在为你开辟一方新天地…');

  try {
    let seed = null;
    for (let i = 0; i < 3 && !seed; i++) {
      const raw = await callLLM(buildWorldGenMessages(mode, answers, gameOptions.eraType));
      seed = parseLLMJSON(raw);
      if (!seed && i < 2) await sleep(2000 * (i + 1));
    }
    if (!seed) throw new Error('世界生成返回无法解析，请重试');

    player = newPlayerState();
    world = newWorldState();
    migrateQuestDeadlines(world);
    world.settings = { difficulty: gameOptions.difficulty, pace: gameOptions.pace, turnLimit: gameOptions.turnLimit, cultGain: gameOptions.cultGain, godMode: gameOptions.godMode, length: gameOptions.length };
    history = [];

    if (seed.player) {
      player.name = seed.player.name || player.name;
      player.origin = seed.player.origin || '';
      player.backstory = seed.player.backstory || '';
      if (typeof seed.player.spiritStones === 'number') player.spiritStones = seed.player.spiritStones;
    }
    // 出身加成（问卷自选或从出身文本推断）
    const originType = ORIGINS[answers.origin] ? answers.origin : originTypeFromText(player.origin);
    const ob = ORIGINS[originType] || ORIGINS['散修'];
    player.morality = Math.max(-100, Math.min(100, player.morality + (ob.morality || 0)));
    player.reputation = Math.max(0, Math.min(100, player.reputation + (ob.reputation || 0)));
    player.spiritStones += ob.spiritStones || 0;
    if (ob.skill) world.skills.push({ name: ob.skill, desc: '出身所得', grade: '基础' });
    world.era = seed.era || '';
    world.eraType = (gameOptions.eraType !== '随机') ? gameOptions.eraType : (seed.eraType || eraTypeFromText(world.era));
    world.startingLocation = seed.startingLocation || null;
    world.factions = Array.isArray(seed.factions) ? seed.factions.map((f) => ({ ...f, alignment: f.alignment || factionAlignment(f), seeded: true, notedTurn: 0 })) : [];
    // 世界骨架：开局落在固定世界的某个区域，势力取本地既有势力，距离与物价由规则表兜底
    const geo = ensureWorldGeo(world, { preferredName: seed.startingLocation && seed.startingLocation.name });
    const homeRegion = regionById(geo.regionId);
    if (homeRegion) {
      world.startingLocation = { name: homeRegion.name, desc: homeRegion.desc };
      world.factions = startingFactions(homeRegion.id);
    }
    const guide = seed.guideNpc;
    if (guide && guide.name) {
      world.npcs.push({ name: guide.name, desc: guide.desc || '', relation: guide.relation || '' });
    }

    playing = true;

    const parts = [];
    parts.push(`【世道】${world.era}`);
    for (const line of skyOf(player, world).lines) parts.push(`【天时】${line}`);
    parts.push(`【你的出身】${player.name}，${player.origin}${player.backstory ? '。' + player.backstory : ''}`);
    if (world.startingLocation) parts.push(`【起始之地】${world.startingLocation.name}：${world.startingLocation.desc}`);
    if (guide && guide.name) parts.push(`【引路人】${guide.name}（${guide.relation || '关系未明'}）：${guide.desc}`);
    if (seed.openingHook) parts.push(`\n${seed.openingHook}`);
    appendChat('gm', parts.join('\n'));
    appendSystem(`模式：${gameOptions.godMode ? '言出法随' : '正常'} · 难度：${gameOptions.difficulty} · 节奏：${gameOptions.pace} · 篇幅：${gameOptions.length} · 修为增益：${gameOptions.cultGain} · 通关回合上限：${gameOptions.turnLimit > 0 ? gameOptions.turnLimit + ' 回合' : '无限制'}`);

    renderAll();
    saveGame(AUTO_SLOT);
    refreshContinue();
    $('topStatus').textContent = statusLine();
  } catch (e) {
    appendSystem('创世失败：' + e.message);
    $('topStatus').textContent = '未开始';
  } finally {
    busy = false;
    setBusy(false);
  }
}

// ---------- 对话回合 ----------
// 生成叙事 + 状态（快节奏单次调用，慢节奏两段式）
async function generateTurn(text, onDelta) {
  const fast = (world.settings && world.settings.pace) === '快';
  if (fast) {
    // 快节奏：单次调用（叙事+状态），失败再退回两段式
    try {
      const raw = await callLLM(buildGMCombinedMessages(player, world, history, text), true);
      const out = parseLLMJSON(raw);
      if (out && typeof out.narrative === 'string' && out.narrative.trim()) {
        return { narrative: out.narrative, out };
      }
    } catch { /* 落入两段式兜底 */ }
  }
  // 两段式：叙事-only + 提取状态（慢节奏默认；快节奏兜底）。慢节奏可流式输出。
  let raw = null;
  if (onDelta) {
    try {
      raw = await callStream(buildGMMessages(player, world, history, text), onDelta);
      if (!raw.trim()) raw = null;
    } catch { raw = null; }
  }
  if (!raw) {
    raw = await callLLM(buildGMMessages(player, world, history, text), false);
    if (onDelta) onDelta(raw); // 流式失败兜底：一次性补全
  }
  const narrative = raw.trim();
  const out = await extractStateFromNarrative(narrative);
  return { narrative, out };
}

function showStateValidation(report) {
  const issues = Array.isArray(report.issues) ? report.issues.slice(0, 10) : [];
  if (report.out !== null && !issues.length) return;
  const details = [...new Set(issues.map((issue) => issue.message).filter((message) => typeof message === 'string').map((message) => message.trim().replace(/[。；;]+$/u, '')).filter(Boolean))].join('；');
  const result = report.out === null
    ? '本回合状态提案被拒绝，未结算状态或推进日期'
    : '部分状态提案已拒绝或归一化，合法内容仍按规则结算';
  appendSystem(`⚠【状态校验】${result}。${details ? details + '。' : ''}叙事可能与实际结算有出入，请以状态面板和存档为准。`, 'quest');
}

async function sendTurn(forcedText) {
  const input = $('input');
  const text = (typeof forcedText === 'string' && forcedText.trim()) ? forcedText.trim() : input.value.trim();
  if (!text || busy || !playing) return;
  input.value = '';
  lastTurnState = snapshotState();      // 死亡回退存档点（回退到本回合行动之前）
  const farmBefore = lastTurnState.world;
  const turnBefore = captureTurnState(); // 本回合变化提示用
  const farmStreak = updateFarmLog(world, text); // 记录本回合行动（重复刷取软墙）
  noteInvestigation(world, text); // 玩家开始查某家势力时，才把底细的线索交给 GM
  rollSeclusionInterrupt(world, player, text); // 闭关先掷一次：仇家/心魔会不会上门
  appendChat('player', text);

  busy = true;
  setBusy(true);
  $('topStatus').textContent = '天道推演中…';
  try {
    const fast = (world.settings && world.settings.pace) === '快';
    let live = null;
    let narrative, rawOut;
    if (!fast) {
      // 慢节奏：流式打字机渲染叙事
      live = renderMsgStream('gm');
      ({ narrative, out: rawOut } = await generateTurn(text, (d) => live.update(d)));
      live.finish();
    } else {
      ({ narrative, out: rawOut } = await generateTurn(text));
      appendChat('gm', narrative);
    }
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: narrative });

    const validation = {};
    const combatNote = applyStateUpdates(player, world, rawOut, validation);
    const out = validation.out;
    if (combatNote) appendSystem(combatNote); // 半透明战斗结算
    showStateValidation(validation);
    if (out !== null) {
      if (player.realm !== turnBefore.realm) {
        // 境界突破：全屏金光一闪 + 阶梯高亮 + 提示
        const flash = $('breakFlash');
        if (flash) { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
        const ladder = document.querySelector('#statusPanel .realm-ladder');
        if (ladder) { ladder.classList.remove('flash-gold'); void ladder.offsetWidth; ladder.classList.add('flash-gold'); }
        appendSystem(`✦ 境界突破：${player.realm} ✦`);
      }
      world.turn += 1;
      const months = (out && Number.isFinite(out.timeMonths) && out.timeMonths > 0) ? out.timeMonths : 0;
      advanceTime(world, player, months);
      for (const note of world.lastRegionQiEvents || []) appendSystem(note, 'quest'); // 地脉枯荣
      const eraNote = enforceEraTimeline(world, out); // 大势时间轴：期限到必演变
      if (eraNote) appendSystem(eraNote, 'quest');
      checkQuestDeadlines();
      checkAchievements();
      tickRumors(world, player); // 传闻：隔几回合冒一条，旧的到时候应验或被戳破
    } else {
      // 请求前的防刷记录也属于状态；拒绝整份提案时只恢复这两个字段，保留校验诊断。
      for (const key of ['recentActions', 'farmStreak']) {
        if (Object.prototype.hasOwnProperty.call(farmBefore, key)) world[key] = JSON.parse(JSON.stringify(farmBefore[key]));
        else delete world[key];
      }
    }
    renderAll();
    if (out !== null) applyTurnNotices(turnBefore); // 仅依据已接受提案产生的真实差分提示
    if (out !== null && farmStreak >= 2 && (world.settings && world.settings.godMode !== true)) {
      appendSystem(`⚠ 重复行动第 ${farmStreak} 次：本回合收益 ×${farmMult(farmStreak)}（换种玩法会恢复）`, 'lose');
    }
    if (out !== null) await maybeCompressMemory();

    const ending = out === null ? null : evaluateEndings(player, world);
    if (ending) {
      showEnding(ending);
      return;
    }

    saveGame(AUTO_SLOT);
    $('topStatus').textContent = statusLine();
  } catch (e) {
    appendSystem('出错了：' + e.message);
    $('topStatus').textContent = statusLine();
  } finally {
    busy = false;
    setBusy(false);
  }
}

// ---------- 自动演示 ----------
async function startAutoDemo() {
  if (busy) return;
  autoDemo = true;
  $('demoBtn').classList.add('on');
  $('demoBtn').textContent = '停止演示';
  appendSystem('🎬 自动演示开始：AI 将替你连续行动，你可随时点「停止演示」接管。');
  if (!playing) {
    await startGame();
    if (!playing) { stopAutoDemo(); return; }
  }
  autoDemoLoop();
}
function demoDelay() {
  const el = $('demoSpeed');
  const v = parseInt(el && el.value, 10);
  return Number.isFinite(v) && v >= 500 ? v : 3000;
}
function autoDemoLoop() {
  if (!autoDemo) return;
  autoTimer = setTimeout(async () => {
    if (!autoDemo) return;
    if (playing && !busy) {
      let action = '';
      try {
        action = await generateDemoAction();
      } catch {
        action = DEMO_ACTIONS[Math.floor(Math.random() * DEMO_ACTIONS.length)]; // 生成失败回退随机池
      }
      if (action) {
        $('input').value = action;
        await sendTurn();
      }
    }
    autoDemoLoop();
  }, demoDelay());
}
function stopAutoDemo() {
  autoDemo = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  const b = $('demoBtn');
  if (b) { b.classList.remove('on'); b.textContent = '自动演示'; }
}

// ---------- 弹窗动画 ----------
function animateModal(id) {
  const modal = $(id);
  const card = modal && modal.querySelector('.modal-card');
  if (!card) return;
  card.style.animation = 'none';
  void card.offsetWidth; // 触发回流，重新播放动画
  card.style.animation = '';
}
function openHelp() {
  $('helpModal').classList.remove('hidden');
  animateModal('helpModal');
}
function showNotice(title, text) {
  $('noticeTitle').textContent = title;
  $('noticeText').textContent = text;
  $('noticeModal').classList.remove('hidden');
  animateModal('noticeModal');
}
function cancelQuest(title) {
  const q = world.quests.find((t) => t.title === title);
  if (!q || q.status !== 'active') return;
  q.status = 'cancelled';
  addChronicleEvent(world, player, q.title, '已放弃', '你主动放弃了此任务', '');
  renderAll();
  showNotice('已放弃任务', `你主动放弃了「${q.title}」。你的选择可能已改变故事的走向……`);
}
function checkQuestDeadlines() {
  const expired = expireQuestDeadlines(player, world);
  if (expired.length) {
    expired.forEach((q) => appendSystem(`⏰ 任务「${q.title}」已超时失败。${q.failureReason || ''}`));
    showNotice('任务超时', expired.map((q) => `「${q.title}」：${q.failureReason || questDeadlineInfo(q, world).text}`).join('\n'));
  }
}

// ---------- 结局 ----------
function showEnding(ending) {
  pendingEnding = ending;
  playing = false;
  stopAutoDemo();
  const saves = loadSaves();
  delete saves[AUTO_SLOT];
  localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
  renderSaveSlots();
  refreshContinue();

  $('topStatus').textContent = '结局 · ' + ending.title;
  $('endingTitle').textContent = ending.title;
  $('endingBadge').textContent = ending.win ? '通关达成 · 主目标' : '本局终章';
  $('endingBadge').className = 'modal-badge ' + (ending.win ? 'win' : 'lose');
  $('endingText').textContent = ending.text;

  // 只有「身死道消」且存在回退点才给回退选项
  const rb = $('endingRollbackBtn');
  if (rb) rb.classList.toggle('hidden', !(ending.id === 'death' && lastTurnState));
  const cb = $('endingCloseBtn');
  if (cb) cb.classList.remove('hidden');
  const ro = $('endingReopenBtn');
  if (ro) ro.classList.add('hidden');
  const es = $('endingExportStatus');
  if (es) { es.classList.add('hidden'); es.textContent = ''; }

  $('endingModal').classList.remove('hidden');
  animateModal('endingModal');
  appendSystem('—— 结局：' + ending.title + ' ——');
}

// 身死道消：回退到本回合行动之前，换一种活法
function rollbackOneTurn() {
  const s = lastTurnState;
  if (!s) { appendSystem('没有可回退的存档点'); return; }
  const deadTitle = pendingEnding ? pendingEnding.title : '身死道消';
  lastTurnState = null;
  pendingEnding = null;
  player = s.player;
  world = s.world;
  migrateQuestDeadlines(world);
  ensureWorldGeo(world); // 回退档同样补区域坐标，保持可玩
  log = s.log;
  history = s.history;
  playing = true;
  busy = false;
  $('endingModal').classList.add('hidden');
  const ro = $('endingReopenBtn');
  if (ro) ro.classList.add('hidden');
  $('chatScroll').innerHTML = '';
  log.forEach((m) => renderMsg(m.kind, m.text, false, m.cls || ''));
  renderAll();
  clearAllDots();
  setBusy(false);
  saveGame(AUTO_SLOT);
  refreshContinue();
  $('topStatus').textContent = statusLine();
  appendSystem(`⏪ 已回退一个回合：若未回退，此身已「${deadTitle}」。仙途未绝，换个选择再试。`);
}

// ---------- 日志导出（玩家反馈意见用，不含 API Key）----------
function buildLogText() {
  const s = world.settings || {};
  const L = [];
  const push = (v) => L.push(String(v));
  push('============================================');
  push('法言天地 · 本局游戏日志（玩家反馈用）');
  push('============================================');
  push('导出时间：' + new Date().toLocaleString());
  push('游戏版本：v' + GAME_VERSION);
  push('结局：' + (pendingEnding ? pendingEnding.title + (pendingEnding.win ? '（通关）' : '（本局终章）') : '进行中'));
  push('玩家：' + player.name + (player.origin ? ' · ' + player.origin : ''));
  push('境界：' + player.realm + ' · 修为 ' + (player.cultivation || 0) + '%');
  push(`正邪 ${player.morality}（${moralityLabel(player.morality)}）· 声望 ${player.reputation} · 灵石 ${player.spiritStones} · 寿元 ${Math.round(player.lifespan)} · 气血 ${player.hp}/${player.maxHp}`);
  push(`回合 ${world.turn || 0} · 难度 ${s.difficulty || '普通'} · 节奏 ${s.pace || '慢'} · 修为增益 ${s.cultGain || '1x'} · 篇幅 ${s.length || '标准'}${s.turnLimit ? ' · 回合上限 ' + s.turnLimit : ''}${s.godMode ? ' · 言出法随' : ''}`);
  push(`游戏日期：${world.date?.year || 1}年${world.date?.month || 1}月${world.date?.day || 1}日`);
  push('世道：' + (world.era || '未明'));
  push('天时：' + skyOf(player, world).lines.join(' / '));
  const _rumors = rumorsFor(player, world);
  if (_rumors.length) push('传闻：' + _rumors.join('；'));
  push('--------------------------------------------');
  push('【完整对话记录】');
  for (const m of log) {
    if (m.kind === 'gm') push('[天道] ' + m.text);
    else if (m.kind === 'player') push('[你] ' + m.text);
    else push('(系统) ' + m.text);
  }
  push('--------------------------------------------');
  push('【世界状态快照】');
  push('势力：' + ((world.factions || []).map((f) => `${f.name}(${factionAlignment(f)}${f.relation ? '/' + f.relation : ''}${f.type ? '/' + f.type : ''})`).join('、') || '无'));
  push('相识之人：' + ((world.npcs || []).map((n) => `${n.name}${n.relation ? '(' + n.relation + ')' : ''}`).join('、') || '无'));
  push('地点：' + ((world.locations || []).map((l) => l.name).join('、') || '无'));
  push('功法：' + ((world.skills || []).map((x) => `${x.name}${x.grade ? '[' + x.grade + ']' : ''}`).join('、') || '无'));
  push('背包：' + ((world.inventory || []).map((it) => `${it.name}×${it.qty || 1}${it.rarity && it.rarity !== '凡品' ? '[' + it.rarity + ']' : ''}`).join('、') || '空'));
  push('任务：');
  if (!(world.quests || []).length) push('  无');
  for (const q of world.quests || []) {
    const deadline = questDeadlineInfo(q, world);
    push(`  ${q.title}（${questStatusLabel(q.status)}） · 期限参考（相对导出时游戏日期）：${deadline.text || '无明确截止日期'}${q.timeNode ? ' · 原期限：' + q.timeNode : ''}${q.failureReason ? ' · 失败原因：' + q.failureReason : ''}`);
  }
  push('成就：' + ((world.achievements || []).join('、') || '无'));
  push('誓愿/目标：' + JSON.stringify(world.goal || {}));
  push('玩家效果诉求：' + ((world.effectRequests || []).map((r) => `${r.name}（${r.desc}）`).join('、') || '无'));
  push('状态校验记录（最近30次问题回合，每次最多10项；不含模型原文或输入值）：');
  const validationLog = Array.isArray(world.validationLog) ? world.validationLog.slice(-30) : [];
  if (!validationLog.length) push('  无');
  for (const entry of validationLog) {
    const turn = Number.isSafeInteger(entry.turn) && entry.turn >= 0 ? entry.turn : '?';
    const result = entry.result === 'rejected' ? '整份拒绝' : '部分拒绝或归一化';
    const issues = Array.isArray(entry.issues) ? entry.issues.slice(0, 10) : [];
    push(`  第${turn}回合 · ${result}`);
    for (const issue of issues) push(`    ${issue.code} · ${issue.path}`);
  }
  push('事迹：');
  for (const e of world.events || []) {
    push(`  第${e.turn || '?'}回合 ${e.date || ''} ${e.stage || ''} ${e.subject || ''} - ${e.title || ''}${e.desc ? '：' + e.desc : ''}${e.relation ? '（' + e.relation + '）' : ''}`);
  }
  push('--------------------------------------------');
  push('【JSON 快照（供开发者排查）】');
  push(JSON.stringify({ player, world, log, settings: s }, null, 2));
  push('--------------------------------------------');
  push('玩家反馈意见（请写在下方）：');
  push('');
  return L.join('\n');
}
// 导出：优先保存到桌面（服务端接口）；失败则退回浏览器下载
async function exportGameLog(statusEl) {
  const content = buildLogText();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `法言天地-日志-${stamp}.txt`;
  const report = (text, ok) => {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.classList.remove('hidden');
      statusEl.classList.toggle('err', !ok);
    } else {
      appendSystem(text, ok ? 'gain' : 'lose');
      if (ok) showNotice('日志已导出', text);
    }
  };
  try {
    const res = await fetch('api/export-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.path) {
      report(`✅ 已导出到桌面：${data.path}`, true);
      return;
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  } catch (e) {
    // 兜底：浏览器下载（默认下载目录）
    try {
      const blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      report(`✅ 已通过浏览器下载日志（${filename}，位于下载目录）。桌面导出不可用：${e?.message || e}`, true);
    } catch (e2) {
      report('❌ 导出失败：' + (e2?.message || e2), false);
    }
  }
}

// ---------- 忙状态 ----------
function setBusy(b) {
  $('startBtn').disabled = b;
  $('sendBtn').disabled = b || !playing;
  $('input').disabled = b || !playing;
}

// ---------- 出身问卷 ----------
function renderQuestionnaire() {
  for (const [key, options] of Object.entries(QUESTIONNAIRE)) {
    const group = document.querySelector(`.q-group[data-key="${key}"]`);
    const chipsEl = group.querySelector('.chips');
    chipsEl.innerHTML = '';
    ['随机', ...options].forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (i === 0 ? ' active' : '');
      b.textContent = opt;
      b.onclick = () => {
        chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
        answers[key] = opt;
      };
      chipsEl.appendChild(b);
    });
  }
}

function setMode(m) {
  mode = m;
  $('modeRandom').classList.toggle('active', m === 'random');
  $('modeQuestionnaire').classList.toggle('active', m === 'questionnaire');
  $('questionnaire').classList.toggle('hidden', m !== 'questionnaire');
}

// ---------- 游戏选项 chips（难度/节奏/回合上限）----------
function renderChips(containerId, options, selected, onChange) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = '';
  options.forEach((opt) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (opt === selected ? ' active' : '');
    b.textContent = opt;
    b.onclick = () => {
      el.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      onChange(opt);
    };
    el.appendChild(b);
  });
}
function renderGameOptions() {
  renderChips('modeChips', ['正常', '言出法随'], gameOptions.godMode ? '言出法随' : '正常', (v) => { gameOptions.godMode = v === '言出法随'; });
  renderChips('difficultyChips', DIFFICULTY_LEVELS, gameOptions.difficulty, (v) => { gameOptions.difficulty = v; });
  renderChips('paceChips', PACE_LEVELS, gameOptions.pace, (v) => { gameOptions.pace = v; });
  const turnLabels = TURN_LIMITS.map((n) => (n === 0 ? '无限制' : n + ' 回合'));
  const curTurnLabel = gameOptions.turnLimit === 0 ? '无限制' : gameOptions.turnLimit + ' 回合';
  renderChips('turnLimitChips', turnLabels, curTurnLabel, (label) => {
    gameOptions.turnLimit = label === '无限制' ? 0 : parseInt(label);
  });
  renderChips('cultGainChips', CULT_GAIN_LEVELS, gameOptions.cultGain, (v) => { gameOptions.cultGain = v; });
  renderChips('lengthChips', LENGTH_LEVELS, gameOptions.length, (v) => { gameOptions.length = v; });
  // 「天下大势」已从明面撤下：时代不再由玩家选择，也不显示名字（见 skyOf / 传闻）
}

// ---------- 标签页切换 ----------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['status', 'quest', 'bag', 'equip', 'chronicle', 'codex', 'achieve'].forEach((n) => {
    const pane = $('pane-' + n);
    if (pane) pane.classList.toggle('hidden', n !== name);
  });
  setTabDot(name, false); // 打开过的标签清除红点
}

// ---------- 事件绑定 ----------
function bindEvents() {
  $('startBtn').onclick = startGame;
  $('sendBtn').onclick = sendTurn;
  $('demoBtn').onclick = () => (autoDemo ? stopAutoDemo() : startAutoDemo());
  $('demoMenuBtn').onclick = () => $('demoPanel').classList.toggle('hidden');
  $('tempSelect').onchange = () => { config.temperature = parseFloat($('tempSelect').value); saveConfig(); };
  $('continueBtn').onclick = () => loadGame(AUTO_SLOT);
  $('enterBtn').onclick = () => $('landing').classList.add('hidden');
  $('helpBtn').onclick = openHelp;
  $('helpTopBtn').onclick = openHelp;
  $('helpCloseBtn').onclick = () => $('helpModal').classList.add('hidden');
  $('landingContinueBtn').onclick = () => { $('landing').classList.add('hidden'); loadGame(AUTO_SLOT); };
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTurn();
    }
  });
  $('modeRandom').onclick = () => setMode('random');
  $('modeQuestionnaire').onclick = () => setMode('questionnaire');
  $('restartBtn').onclick = () => location.reload();
  $('saveSlots').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const slot = btn.dataset.slot;
    if (btn.dataset.act === 'save') {
      if (!playing) { appendSystem('当前没有进行中的游戏，无法存档'); return; }
      if (saveGame(slot)) appendSystem('已存档到档位 ' + slot);
    } else {
      loadGame(slot);
    }
  });
  ['baseUrl', 'apiKey'].forEach((id) => $(id).addEventListener('input', syncConfigFromUI));
  $('model').addEventListener('change', syncConfigFromUI);
  $('jsonMode').addEventListener('change', syncConfigFromUI);
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  $('codexPanel').addEventListener('click', (e) => {
    const el = e.target.closest('[data-subject]');
    if (el) openChronicle(el.getAttribute('data-subject'));
  });
  $('questPanel').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (btn) cancelQuest(btn.getAttribute('data-cancel'));
  });
  $('chroniclePanel').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    chronicleView = btn.dataset.view;
    renderChronicle();
  });
  const handleBagClick = (e) => {
    const useBtn = e.target.closest('[data-use]');
    if (useBtn) { useItem(useBtn.getAttribute('data-use')); return; }
    const equipBtn = e.target.closest('[data-equip]');
    if (equipBtn) { toggleEquip(equipBtn.getAttribute('data-equip')); return; }
    const discardBtn = e.target.closest('[data-discard]');
    if (discardBtn) { discardItem(discardBtn.getAttribute('data-discard')); return; }
    const el = e.target.closest('[data-item]');
    if (el) openCodexItem(el.getAttribute('data-item'));
  };
  $('bagPanel').addEventListener('click', handleBagClick);
  $('equipPanel').addEventListener('click', handleBagClick);
  $('statusPanel').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-break]');
    if (btn) openBreakModal(btn.getAttribute('data-break'));
  });
  $('breakConfirmBtn').onclick = confirmBreak;
  $('breakCancelBtn').onclick = () => $('breakModal').classList.add('hidden');
  $('noticeCloseBtn').onclick = () => $('noticeModal').classList.add('hidden');
  $('endingRollbackBtn').onclick = rollbackOneTurn;
  $('endingCloseBtn').onclick = () => {
    $('endingModal').classList.add('hidden');
    const ro = $('endingReopenBtn');
    if (ro) ro.classList.remove('hidden'); // 收起后可随时重新打开做选择
  };
  $('endingReopenBtn').onclick = () => {
    $('endingModal').classList.remove('hidden');
    const ro = $('endingReopenBtn');
    if (ro) ro.classList.add('hidden');
  };
  $('endingExportBtn').onclick = () => exportGameLog($('endingExportStatus'));
  $('exportLogBtn').onclick = () => {
    if (!playing) { appendSystem('当前没有进行中的游戏，无法导出'); return; }
    exportGameLog(null);
  };
  $('godToggleBtn').onclick = toggleGodMode;
  $('eraSelect').onchange = () => switchEraManually($('eraSelect').value);
}

// ---------- 标题页星点 ----------
function spawnStars() {
  const landing = $('landing');
  if (!landing || landing.querySelector('.stars')) return;
  const container = document.createElement('div');
  container.className = 'stars';
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.className = 'star';
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.top = (Math.random() * 100).toFixed(2) + '%';
    const size = (Math.random() * 1.5 + 0.8).toFixed(1);
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
    s.style.animationDuration = (3 + Math.random() * 4).toFixed(2) + 's';
    container.appendChild(s);
  }
  landing.appendChild(container);
}

// ---------- 通用悬停提示（JS 定位，避免被滚动面板裁剪）----------
let tooltipEl = null;
function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
function showTooltip(el) {
  const text = el.getAttribute('data-tip');
  if (!text) return;
  const t = getTooltip();
  t.textContent = text;
  t.style.display = 'block';
  const r = el.getBoundingClientRect();
  const tw = t.offsetWidth || 270;
  let left = r.left - tw - 10;
  if (left < 6) left = r.right + 10;
  const th = t.offsetHeight || 40;
  let top = r.top + r.height / 2 - th / 2;
  top = Math.max(6, Math.min(top, window.innerHeight - th - 6));
  t.style.left = left + 'px';
  t.style.top = top + 'px';
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}
function bindTooltip() {
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) showTooltip(el);
    else hideTooltip();
  });
  document.addEventListener('mouseout', (e) => {
    if (!e.target.closest('[data-tip]')) hideTooltip();
  });
}

// ---------- 初始化 ----------
function init() {
  // 调试入口：?dev=1 才露出"世道底子"下拉（正常玩法看不到时代名）
  try {
    if (new URLSearchParams(location.search).get('dev') === '1') {
      const row = $('devEraRow');
      if (row) row.classList.remove('hidden');
    }
  } catch { /* 忽略 */ }
  loadConfig();
  syncConfigToUI();
  renderQuestionnaire();
  setMode('random');
  bindEvents();
  bindTooltip();
  renderGameOptions();
  renderSaveSlots();
  renderAchievements();
  refreshContinue();
  setBusy(false);
  renderAll();
  spawnStars();
  const gv = $('gameVersion');
  if (gv) gv.textContent = 'v' + GAME_VERSION;
}

init();
