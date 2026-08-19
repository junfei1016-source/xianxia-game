import {
  newPlayerState, stanceProfile, stanceGuide, buildGMMessages, buildGMCombinedMessages,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. stanceProfile 分档 ----------
const mk = (m, r) => ({ ...newPlayerState(), morality: m, reputation: r });

assert('正邪 30 → 正道', stanceProfile(mk(30, 50)).alignment === '正道');
assert('正邪 -30 → 魔道', stanceProfile(mk(-30, 50)).alignment === '魔道');
assert('正邪 29 → 中庸', stanceProfile(mk(29, 50)).alignment === '中庸');
assert('正邪 -29 → 中庸', stanceProfile(mk(-29, 50)).alignment === '中庸');
assert('声望 70 → 声名显赫', stanceProfile(mk(0, 70)).repLabel === '声名显赫');
assert('声望 20 → 默默无闻', stanceProfile(mk(0, 20)).repLabel === '默默无闻');
assert('声望 50 → 小有名气', stanceProfile(mk(0, 50)).repLabel === '小有名气');

// ---------- 2. stanceGuide 按阵营给差异化指引 ----------
const gZ = stanceGuide(mk(50, 80));
assert('正道指引：机缘趋善', gZ.includes('机缘趋善'));
assert('正道指引：魔道敌视', gZ.includes('魔道对你敌视'));
assert('正道高声望：赠礼让利', gZ.includes('赠礼让利'));
const gM = stanceGuide(mk(-50, 80));
assert('魔道指引：通缉', gM.includes('通缉'));
assert('魔道指引：黑市欢迎', gM.includes('黑市'));
assert('魔道高声望：追杀者', gM.includes('追杀者'));
const gN = stanceGuide(mk(0, 30));
assert('中庸指引：两不讨好', gN.includes('两不讨好'));
const gLow = stanceGuide(mk(0, 5));
assert('低声望指引：无人问津', gLow.includes('无人问津'));
assert('遭遇钩子：接或不接', gZ.includes('接或不接'));

// ---------- 3. 每回合 GM messages 注入立场指引 ----------
const p = mk(45, 75);
const w = { settings: { difficulty: '普通', pace: '慢', godMode: false, length: '标准' }, closedStreak: 0 };
const slow = buildGMMessages(p, w, [], '去城里转转');
assert('慢节奏 guide 注入立场处境', slow.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('立场处境') && m.content.includes('正道')));
const fast = buildGMCombinedMessages(p, w, [], '去城里转转');
assert('快节奏 guide 注入立场处境', fast.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('立场处境')));

// ---------- 4. 言出法随模式不注入（外挂模式无立场约束） ----------
const wGod = { settings: { difficulty: '普通', pace: '慢', godMode: true, length: '标准' }, closedStreak: 0 };
const god = buildGMMessages(p, wGod, [], '给我一万灵石');
assert('言出法随不注入立场处境', !god.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('立场处境')));

console.log(fails === 0 ? '\n✅ 立场处境测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
