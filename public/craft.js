// ============================================================
//  craft.js —— 四艺与符箓（凡人修仙传 口径）
//
//  原文要点：
//   · 符箓画在符纸上、以法力催动，用一次就废（第 92 章 剑符）；
//   · 玉简是"书"：功法、阵法布置之法都录在玉简里，可买、可换、师父给（第 193、219、221 章）；
//   · 技艺靠练、靠人指点、靠照简摸索——韩立就是先照玉简布阵，再自己改良。
//
//  四艺：符箓、阵法、丹道、炼器。等级用"初窥门径"这一路的说法。
// ============================================================

export const CRAFT_NAMES = ['符箓', '阵法', '丹道', '炼器'];

// 五级造诣；每级 100 点经验
export const SKILL_LEVELS = ['未入门', '初窥门径', '略有小成', '登堂入室', '炉火纯青', '出神入化'];
export const LEVEL_EXP = 100;

export function skillLevelOf(exp = 0) {
  const e = Math.max(0, Number(exp) || 0);
  const level = Math.min(SKILL_LEVELS.length - 1, Math.floor(e / LEVEL_EXP));
  return {
    level,
    name: SKILL_LEVELS[level],
    exp: e,
    intoLevel: e % LEVEL_EXP,
    toNext: level >= SKILL_LEVELS.length - 1 ? 0 : LEVEL_EXP - (e % LEVEL_EXP),
  };
}

// 每级造诣给对应技艺的加成
export function craftBonus(exp = 0, skill = '') {
  const lv = skillLevelOf(exp).level;
  if (skill === '丹道') return { brew: lv * 0.02 };       // 成丹率
  if (skill === '炼器') return { forge: lv * 0.02 };      // 成器率
  if (skill === '阵法') return { breakForm: lv * 0.03, setCost: lv * 0.05 }; // 破阵率 / 布阵折扣
  if (skill === '符箓') return { draw: lv * 0.03, power: lv * 0.1 };        // 制符率 / 符威
  return {};
}

// 修习一次的进益：按天数与当前等级递减（越往上越难）
export function practiceGain(exp = 0, days = 3) {
  const lv = skillLevelOf(exp).level;
  const d = Math.max(1, Math.min(10, Math.floor(Number(days) || 3)));
  const base = d * 3;
  const decay = 1 / (1 + lv * 0.35);
  return Math.max(1, Math.round(base * decay));
}

// 玉简指点一次的进益（比自练多，且不受等级衰减那么狠）
export function studyGain(exp = 0, source = '玉简') {
  const lv = skillLevelOf(exp).level;
  const decay = 1 / (1 + lv * 0.2);
  const base = source === '师父' ? 60 : 40;
  return Math.max(1, Math.round(base * decay));
}

// ---------- 瓶颈与顿悟 ----------
// 第 9 章"只隔着薄薄一层纸，再加把劲就突破瓶颈"；第 15 章韩立遇练功瓶颈。
// 略有所成（2 级）起，经验会卡在 99，须顿悟或师承点化才过得去。
export const BOTTLENECK_LEVEL = 2;

export function expCapFor(exp = 0) {
  const lv = skillLevelOf(exp).level;
  return lv >= BOTTLENECK_LEVEL ? lv * LEVEL_EXP + LEVEL_EXP - 1 : Infinity;
}

export function isBottlenecked(exp = 0) {
  const lv = skillLevelOf(exp).level;
  return lv >= BOTTLENECK_LEVEL && Number(exp) % LEVEL_EXP === LEVEL_EXP - 1;
}

export function applyCraftExp(exp = 0, gain = 0) {
  const cap = expCapFor(exp);
  const next = Math.min(Number(exp) + Number(gain), cap);
  return { exp: next, capped: next < Number(exp) + Number(gain) };
}

// 师父能把人教到哪一级：登堂入室（3 级）为止，再往上得靠自己
export const MASTER_CAP_LEVEL = 3;

// ---------- 符箓 ----------
// 阶位：凡符 / 灵符 / 宝符 / 仙符；画符要符纸、朱砂（高阶加灵墨、妖血）
export const TALISMAN_TIERS = {
  凡符: { rank: 0, skill: 0, price: 30 },
  灵符: { rank: 1, skill: 1, price: 300 },
  宝符: { rank: 2, skill: 2, price: 3000 },
  仙符: { rank: 3, skill: 3, price: 30000 },
};

// effect：hp 立刻回血；damageTaken/deathMult/travelMult 为短时增益；cult 为修炼一击
export const TALISMANS = [
  { name: '疗伤符', tier: '凡符', effect: { hp: 40 }, materials: ['符纸', '朱砂'], desc: '画一道止血的符，贴在伤口上。' },
  { name: '金刚符', tier: '凡符', effect: { damageTaken: 0.85, months: 2 }, materials: ['符纸', '朱砂'], desc: '护身一层，能挡几下寻常法术。' },
  { name: '神行符', tier: '凡符', effect: { travelMult: 0.7, months: 2 }, materials: ['符纸', '朱砂'], desc: '贴腿而行，脚程快三成。' },
  { name: '火球符', tier: '灵符', effect: { deathMult: 0.8, months: 1 }, materials: ['符纸', '朱砂', '灵墨'], desc: '丢出去便是一团火。' },
  { name: '剑符', tier: '灵符', effect: { deathMult: 0.75, months: 1 }, materials: ['符纸', '朱砂', '灵墨'], desc: '符上画着一柄灰色小剑，催动时化光伤人（第 92 章）。' },
  { name: '雷符', tier: '灵符', effect: { deathMult: 0.7, months: 1 }, materials: ['符纸', '朱砂', '灵墨'], desc: '引一缕雷意入符，专克阴邪。' },
  { name: '回春符', tier: '宝符', effect: { hp: 150 }, materials: ['符纸', '朱砂', '灵墨', '妖血'], desc: '重伤时贴之，气血回得更快。' },
  { name: '遁地符', tier: '宝符', effect: { damageTaken: 0.7, months: 3 }, materials: ['符纸', '朱砂', '灵墨', '妖血'], desc: '遁入土中，追兵难及。' },
  { name: '封灵符', tier: '宝符', effect: { deathMult: 0.6, months: 2 }, materials: ['符纸', '朱砂', '灵墨', '妖血'], desc: '封住对方灵脉一瞬。' },
  { name: '仙符·太清', tier: '仙符', effect: { hp: 400, damageTaken: 0.6, months: 3 }, materials: ['符纸', '朱砂', '灵墨', '太清灵液'], desc: '太清一脉的镇派符，凡符师连看都看不懂。' },
];

const BY_NAME = new Map(TALISMANS.map((t) => [t.name, t]));

export function talismanByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  for (const t of TALISMANS) if (raw.includes(t.name)) return t;
  return null;
}

// 制符成功率：阶位基础率 + 符箓造诣加成
export function drawChance(talisman, skillExp = 0) {
  if (!talisman) return 0;
  const tier = TALISMAN_TIERS[talisman.tier] || TALISMAN_TIERS['凡符'];
  const base = [0.85, 0.6, 0.4, 0.2][tier.rank] ?? 0.3;
  return Math.max(0.05, Math.min(0.95, Math.round((base + craftBonus(skillExp, '符箓').draw) * 100) / 100));
}
