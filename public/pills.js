// ============================================================
//  pills.js —— 丹药与丹方（凡人修仙传 的硬设定）
//
//  原文根据：
//   · 第 243 章：服丹太频，身体产生抗药性，丹药慢慢失去效用；
//   · 第 597—598 章：筑基期的丹药到了结丹期就无效——吸收效率追上了天地灵气；
//   · 第 156 章：炼丹借玄阳之地的地肺之火，成丹率远高于真火；
//   · 第 397 章：买丹方、以妖丹配灵草批量炼丹，才解决抗药性问题。
//
//  丹分四类来源（tier）：
//   常见  —— 坊市有卖，丹方烂大街
//   上古  —— 上古遗府/残卷里才有，成丹难，药力强
//   残缺  —— 只余残页，须集齐才能炼
//   禁制  —— 魔道/禁术之丹，炼之损德
// ============================================================

const MAJORS = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
const MAJOR_RANK = Object.fromEntries(MAJORS.map((m, i) => [m, i]));

export function majorRank(realm) {
  const key = MAJORS.find((m) => String(realm || '').startsWith(m));
  return key === undefined ? 0 : MAJOR_RANK[key];
}

export const TIERS = {
  常见: { label: '常见', priceFactor: 1, chanceFactor: 1, desc: '坊市可得，丹方不稀奇' },
  上古: { label: '上古', priceFactor: 6, chanceFactor: 0.7, desc: '上古遗府所出，药力霸道，成丹难' },
  残缺: { label: '残缺', priceFactor: 3, chanceFactor: 0.5, desc: '只余残页，须集齐方能开炉' },
  禁制: { label: '禁制', priceFactor: 4, chanceFactor: 0.8, desc: '魔道禁丹，炼之损德、服之伤身' },
};

// materials 为炼丹所需：{name, qty}；chance 为基础成丹率（真火）
export const PILLS = [
  // ---- 疗伤 ----
  { id: 'zhixue', name: '止血散', grade: '凡品', band: '炼气', kind: '疗伤', hp: 15, price: 6, tier: '常见',
    chance: 0.9, materials: [{ name: '三七草', qty: 2 }], desc: '寻常伤药，止血生肌。' },
  { id: 'huichun', name: '回春丹', grade: '凡品', band: '筑基', kind: '疗伤', hp: 35, healMonths: 1, price: 15, tier: '常见',
    chance: 0.8, materials: [{ name: '回春草', qty: 3 }, { name: '灵泉水', qty: 1 }], desc: '坊市常见疗伤丹。' },
  { id: 'xugu', name: '续骨膏', grade: '灵品', band: '筑基', kind: '疗伤', hp: 50, healMonths: 1, price: 90, tier: '常见',
    chance: 0.65, materials: [{ name: '续骨花', qty: 2 }, { name: '妖骨粉', qty: 1 }], desc: '断骨可续，敷之如新。' },
  { id: 'shengji', name: '生肌丹', grade: '灵品', band: '金丹', kind: '疗伤', hp: 80, healMonths: 2, price: 120, tier: '常见',
    chance: 0.6, materials: [{ name: '生肌草', qty: 3 }, { name: '妖丹', qty: 1 }], desc: '断骨可续，需静养数日。' },
  { id: 'dahuan', name: '大还丹', grade: '玄品', band: '元婴', kind: '疗伤', hp: 200, healMonths: 3, price: 1200, tier: '上古',
    chance: 0.4, materials: [{ name: '千年血参', qty: 1 }, { name: '妖丹', qty: 2 }], desc: '起死回生的名丹，极难得。' },
  { id: 'jiuzhuan', name: '九转还魂丹', grade: '仙品', band: '化神', kind: '疗伤', hp: 500, healMonths: 6, price: 90000, tier: '上古',
    chance: 0.25, materials: [{ name: '九幽草', qty: 1 }, { name: '万年灵乳', qty: 1 }], desc: '魂飞魄散之际也能拉回来一线。' },

  // ---- 聚气 ----
  { id: 'juqi', name: '聚气丹', grade: '凡品', band: '炼气', kind: '聚气', cult: 3, price: 18, tier: '常见',
    chance: 0.85, materials: [{ name: '灵草', qty: 3 }], desc: '炼气期常备，聚气冲层。' },
  { id: 'ningyuan', name: '凝元丹', grade: '灵品', band: '筑基', kind: '聚气', cult: 6, price: 160, tier: '常见',
    chance: 0.6, materials: [{ name: '灵草', qty: 6 }, { name: '灵泉水', qty: 1 }], desc: '筑基修士的日常功课。' },
  { id: 'peiyuan', name: '培元丹', grade: '玄品', band: '金丹', kind: '聚气', cult: 10, price: 900, tier: '常见',
    chance: 0.5, materials: [{ name: '百年灵草', qty: 4 }, { name: '妖丹', qty: 1 }], desc: '固本培元，结丹后仍有效用。' },
  { id: 'xuanyuan', name: '玄元丹', grade: '地品', band: '元婴', kind: '聚气', cult: 15, price: 4000, tier: '上古',
    chance: 0.35, materials: [{ name: '玄元果', qty: 1 }, { name: '妖丹', qty: 3 }], desc: '元婴修士的进阶之资。' },
  { id: 'dayan', name: '大衍丹', grade: '仙品', band: '化神', kind: '聚气', cult: 30, price: 30000, tier: '上古',
    chance: 0.2, materials: [{ name: '大衍神木', qty: 1 }, { name: '万年灵乳', qty: 1 }], desc: '化神之后仍能精进的少数灵丹。' },

  // ---- 破境 ----
  { id: 'zhuji', name: '筑基丹', grade: '灵品', band: '炼气', kind: '破境', price: 1200, tier: '常见',
    chance: 0.5, materials: [{ name: '筑基灵药', qty: 3 }, { name: '妖丹', qty: 1 }], desc: '炼气圆满者服之，可增筑基之机。' },
  { id: 'jiejin', name: '结金丹', grade: '玄品', band: '筑基', kind: '破境', price: 6000, tier: '上古',
    chance: 0.3, materials: [{ name: '结金草', qty: 1 }, { name: '妖丹', qty: 3 }], desc: '结丹的关键一炉，十炉九空。' },
  { id: 'ningying', name: '凝婴丹', grade: '仙品', band: '金丹', kind: '破境', price: 50000, tier: '上古',
    chance: 0.2, materials: [{ name: '凝婴果', qty: 1 }, { name: '千年血参', qty: 1 }], desc: '结婴之资，可遇不可求。' },

  // ---- 延寿 / 驻颜 ----
  { id: 'yanshou', name: '延寿丹', grade: '仙品', band: '元婴', kind: '延寿', life: 20, price: 60000, tier: '上古',
    chance: 0.25, materials: [{ name: '万年灵乳', qty: 2 }], desc: '增寿二十载，有价无市。' },
  { id: 'xuming', name: '续命丹', grade: '玄品', band: '金丹', kind: '延寿', life: 5, price: 3000, tier: '常见',
    chance: 0.45, materials: [{ name: '续命草', qty: 2 }], desc: '延寿五年，聊胜于无。' },
  { id: 'zhuyan', name: '驻颜丹', grade: '玄品', band: '金丹', kind: '驻颜', price: 3000, tier: '常见',
    chance: 0.5, materials: [{ name: '驻颜花', qty: 2 }], desc: '容颜不老，对修为无益。' },

  // ---- 解毒 ----
  { id: 'qingdu', name: '清毒丹', grade: '凡品', band: '筑基', kind: '解毒', hp: 10, price: 20, tier: '常见',
    chance: 0.8, materials: [{ name: '解毒草', qty: 2 }], desc: '解寻常蛇虫之毒。' },
  { id: 'huadu', name: '化毒丹', grade: '灵品', band: '金丹', kind: '解毒', hp: 40, price: 200, tier: '常见',
    chance: 0.6, materials: [{ name: '化毒花', qty: 2 }, { name: '灵泉水', qty: 1 }], desc: '可化阴毒，需以真元催开。' },
  { id: 'bidu', name: '辟毒丹', grade: '玄品', band: '元婴', kind: '解毒', hp: 60, price: 800, tier: '上古',
    chance: 0.4, materials: [{ name: '辟毒草', qty: 1 }, { name: '妖丹', qty: 1 }], desc: '百毒不侵一时三刻。' },

  // ---- 洗髓 / 改骨 ----
  { id: 'xisui', name: '洗髓丹', grade: '灵品', band: '筑基', kind: '洗髓', cult: 4, price: 600, tier: '上古',
    chance: 0.35, materials: [{ name: '洗髓花', qty: 2 }, { name: '灵泉水', qty: 2 }], desc: '洗经伐髓，改易根骨。' },
  { id: 'yigu', name: '易骨丹', grade: '玄品', band: '金丹', kind: '洗髓', cult: 6, price: 2500, tier: '上古',
    chance: 0.3, materials: [{ name: '易骨草', qty: 1 }, { name: '妖骨粉', qty: 2 }], desc: '易骨换形，痛不欲生。' },

  // ---- 禁制（魔道） ----
  { id: 'shigu', name: '蚀骨丹', grade: '玄品', band: '金丹', kind: '禁制', hp: 30, price: 700, tier: '禁制',
    chance: 0.5, materials: [{ name: '蚀骨花', qty: 2 }, { name: '阴煞之气', qty: 1 }], desc: '炼化骨血，服之伤身，却能短时暴涨。' },
  { id: 'xuesha', name: '血煞丹', grade: '玄品', band: '元婴', kind: '禁制', cult: 12, price: 2000, tier: '禁制',
    chance: 0.4, materials: [{ name: '血煞石', qty: 1 }, { name: '生魂', qty: 1 }], desc: '以血煞入丹，进境飞快，业力缠身。' },

  // ---- 特殊 ----
  { id: 'huaxing', name: '化形丹', grade: '仙品', band: '元婴', kind: '特殊', price: 40000, tier: '上古',
    chance: 0.2, materials: [{ name: '化形果', qty: 1 }, { name: '妖王真血', qty: 1 }], desc: '妖族化形之资，人族服之无异。' },
  { id: 'taqing', name: '太清丹', grade: '仙品', band: '化神', kind: '聚气', cult: 20, price: 25000, tier: '上古',
    chance: 0.22, materials: [{ name: '太清灵液', qty: 1 }, { name: '万年灵乳', qty: 1 }], desc: '道门正宗丹方，清心明性。' },

  // ---- 残缺（只余残页，须集齐） ----
  { id: 'xuanyin', name: '玄阴丹', grade: '灵品', band: '筑基', kind: '聚气', cult: 8, price: 700, tier: '残缺',
    chance: 0.55, materials: [{ name: '玄阴草', qty: 2 }, { name: '阴煞之气', qty: 1 }], desc: '残卷所载，药性偏阴。' },
  { id: 'pozhang', name: '破障丹', grade: '玄品', band: '金丹', kind: '破境', price: 5000, tier: '残缺',
    chance: 0.4, materials: [{ name: '破障花', qty: 2 }, { name: '妖丹', qty: 1 }], desc: '专破瓶颈，可惜丹方只剩半卷。' },
];

const BY_NAME = new Map(PILLS.map((p) => [p.name, p]));

export function pillByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  // 只认"量词前缀/括号后缀"，不认随便包含——「百转培元丹」是另一种丹，不能算「培元丹」
  const cleaned = raw
    .replace(/^(一颗|一粒|一枚|一丸|两粒|两颗|三颗|三粒)/, '')
    .replace(/[（(][^）)]*[)）]/g, '')
    .trim();
  return BY_NAME.get(cleaned) || BY_NAME.get(raw) || null;
}

// 抗药性：服得越频越弱（第 243 章）。0 次 = 1.0，之后每次 ×0.75，最低 0.15。
export function resistanceFactor(times = 0) {
  const n = Math.max(0, Number(times) || 0);
  return Math.max(0.15, Math.round(Math.pow(0.75, n) * 1000) / 1000);
}

// 境界是否有效：丹药只对"不高于其适用境界"的人有用（第 598 章）
export function pillWorksFor(realm, pill) {
  if (!pill) return false;
  return majorRank(realm) <= majorRank(pill.band);
}

// 实际服下的效果（含抗药性折算）
export function pillEffect(realm, pill, timesUsed = 0) {
  if (!pill) return null;
  if (!pillWorksFor(realm, pill)) return { ...pill, works: false, factor: 0, hp: 0, cult: 0, life: 0 };
  const factor = resistanceFactor(timesUsed);
  return {
    ...pill,
    works: true,
    factor,
    hp: Math.round((pill.hp || 0) * factor),
    cult: Math.round((pill.cult || 0) * factor * 10) / 10,
    life: Math.round((pill.life || 0) * factor * 10) / 10,
    healMonths: Math.round((pill.healMonths || 0) * factor * 10) / 10,
  };
}

// 丹方：以丹名为键，含来源（tier）、残页要求、基础成丹率
export function recipeOf(pill) {
  if (!pill) return null;
  const t = TIERS[pill.tier] || TIERS.常见;
  const pieces = pill.tier === '残缺' ? 3 : 0;
  return {
    pill: pill.id,
    name: `${pill.name}丹方`,
    tier: pill.tier,
    pieces,
    chance: Math.round(pill.chance * t.chanceFactor * 100) / 100,
    materials: pill.materials || [],
    price: Math.round((pill.price || 0) * t.priceFactor * 0.3),
  };
}

// 成丹率：丹方基础率 × 火源（地火 ×1.25，真火 ×1）× 完整度（残缺未拼齐则 0）
export function brewChance(pill, opts = {}) {
  const r = recipeOf(pill);
  if (!r) return 0;
  if (opts.intact === false) return 0; // 残缺未拼齐：开不了炉
  const fire = opts.fire === '地火' ? 1.25 : 1;
  return Math.max(0.02, Math.min(0.95, Math.round(r.chance * fire * 100) / 100));
}
