// ============================================================
//  treasures.js —— 法宝（凡人修仙传 口径）
//
//  原文层级：
//   · 法器：炼气修士所用，最低阶；
//   · 法宝：下品 / 中品 / 上品 / 极品，筑基起才能真正驱动（第 156、397 章一带）；
//   · 古宝：上古遗府的旧物，威力大但认主不易（第 707 章 紫铖兜）；
//   · 本命法宝：以精血祭炼、与心神相连（韩立 青竹蜂云剑）；
//   · 灵宝 / 通天灵宝：虚天鼎 即通天灵宝（第 641 章）；
//   · 玄天之宝：混沌万灵榜上的通灵之宝（第 1359 章 玄天斩灵剑）。
//
//  规则要点：
//   1) 修为不够，法宝驱动不了（差一个大境界只能发挥一半，再低则完全无用）；
//   2) 本命法宝只能有一件，祭炼要耗精血与灵石，但威力更大且不易被夺；
//   3) 越是高阶，越不流通——古宝以上基本买不到。
// ============================================================

const MAJORS = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];

function majorRank(realm) {
  const key = MAJORS.find((m) => String(realm || '').startsWith(m));
  return key === undefined ? 0 : MAJORS.indexOf(key);
}

// rank 越大越强；minRealm 是"能完全驱动"的最低大境界；tradable 表示能否在坊市买卖
export const TREASURE_TIERS = {
  法器: { rank: 0, minRealm: '炼气', mult: 1.00, ascendBonus: 0, price: 20, tradable: true },
  下品法宝: { rank: 1, minRealm: '筑基', mult: 1.15, ascendBonus: 3, price: 200, tradable: true },
  中品法宝: { rank: 2, minRealm: '筑基', mult: 1.25, ascendBonus: 6, price: 800, tradable: true },
  上品法宝: { rank: 3, minRealm: '金丹', mult: 1.40, ascendBonus: 10, price: 3000, tradable: true },
  极品法宝: { rank: 4, minRealm: '金丹', mult: 1.55, ascendBonus: 14, price: 12000, tradable: true },
  古宝: { rank: 5, minRealm: '元婴', mult: 1.75, ascendBonus: 20, price: 40000, tradable: false },
  灵宝: { rank: 6, minRealm: '元婴', mult: 1.90, ascendBonus: 24, price: 120000, tradable: false },
  通天灵宝: { rank: 7, minRealm: '化神', mult: 2.20, ascendBonus: 30, price: 600000, tradable: false },
  玄天之宝: { rank: 8, minRealm: '大乘', mult: 2.60, ascendBonus: 40, price: 0, tradable: false },
};

// type 决定用法：剑/刃/钉/扇/梭 主攻，盾/幡/网/镜/塔/钟/印/珠 主防，其余为奇物
export const ATTACK_TYPES = new Set(['飞剑', '刃', '钉', '扇', '梭']);
export const DEFENSE_TYPES = new Set(['盾', '幡', '网', '镜', '塔', '钟', '印', '珠']);

export const TREASURES = [
  // 法器（炼气）
  { name: '青叶飞剑', tier: '法器', type: '飞剑', affix: '锋芒·剑走轻灵', desc: '青竹削成的飞剑，炼气弟子人手一柄。' },
  { name: '铁精盾', tier: '法器', type: '盾', affix: '护体·挡得三击', desc: '铁精所铸的小盾，挡得住寻常法术。' },
  { name: '玄铁钉', tier: '法器', type: '钉', affix: '锋芒·破甲', desc: '三寸长的黑钉，专破护体灵光。' },
  { name: '赤火珠', tier: '法器', type: '珠', affix: '护体·避火', desc: '内蕴火气的珠子，能挡一时火法。' },

  // 下品法宝（筑基）
  { name: '青蛟旗', tier: '下品法宝', type: '幡', affix: '护体·御敌', desc: '旗面绘蛟，祭起时黑气如幕。' },
  { name: '玄龟盾', tier: '下品法宝', type: '盾', affix: '护体·金刚', desc: '玄龟甲炼成，硬接同阶飞剑。' },
  { name: '定风珠', tier: '下品法宝', type: '珠', affix: '镇心·定神', desc: '风中不摇，可定心神与身法。' },
  { name: '金砖', tier: '下品法宝', type: '印', affix: '锋芒·斩敌', desc: '看着像块金砖，砸下来却很疼。' },

  // 中品法宝（筑基）
  { name: '银丝网', tier: '中品法宝', type: '网', affix: '护体·困敌', desc: '银丝织成，网住便难以脱身。' },
  { name: '天雷竹', tier: '中品法宝', type: '奇物', affix: '破劫·抗雷', desc: '雷击木所化，渡劫时可挡一道天雷。' },
  { name: '玄铁飞剑', tier: '中品法宝', type: '飞剑', affix: '锋芒·锐利', desc: '玄铁打就，斩金断玉。' },

  // 上品法宝（金丹）
  { name: '金蚨子母刃', tier: '上品法宝', type: '刃', affix: '锋芒·斩敌破甲', desc: '母刃藏子刃，出手便是两处伤。' },
  { name: '元磁神山', tier: '上品法宝', type: '印', affix: '护体·金刚不减', desc: '一座小山压在头顶，重若千钧。' },
  { name: '青竹蜂云剑', tier: '上品法宝', type: '飞剑', affix: '锋芒·剑气纵横，悟道·养剑养神', desc: '韩立的本命飞剑，七十二口青竹蜂云剑。' },

  // 极品法宝（金丹）
  { name: '七焰扇', tier: '极品法宝', type: '扇', affix: '锋芒·焚敌', desc: '一扇七焰，寻常法宝近不得身。' },
  { name: '寒髓镜', tier: '极品法宝', type: '镜', affix: '护体·照破幻术', desc: '寒髓为镜，可照破幻术与隐匿。' },

  // 古宝（元婴）
  { name: '紫铖兜', tier: '古宝', type: '网', affix: '护体·困敌', desc: '蛮荒时期的古宝，单论困敌之能冠绝一时。' },

  // 通天灵宝（化神）
  { name: '虚天鼎', tier: '通天灵宝', type: '钟', affix: '护体·镇岳', desc: '通天灵宝，鼎中藏乾蓝冰焰，非化神不可开启。' },

  // 玄天之宝（大乘）
  { name: '玄天斩灵剑', tier: '玄天之宝', type: '飞剑', affix: '锋芒·斩灵', desc: '混沌万灵榜排名前三的玄天之宝，出世必引血雨腥风。' },
  { name: '掌天瓶', tier: '玄天之宝', type: '奇物', affix: '长青·催灵', desc: '韩立所得的小瓶，能催熟灵药，来历不明。' },
];

const BY_NAME = new Map(TREASURES.map((t) => [t.name, t]));

export function treasureByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  for (const t of TREASURES) {
    if (raw.includes(t.name)) return t;
  }
  return null;
}

export function tierOf(treasure) {
  return treasure ? TREASURE_TIERS[treasure.tier] || null : null;
}

// 修为是否驱动得动：够 = 1；差一个大境界 = 0.5（勉强驱动）；再低 = 0（无法驱动）
export function wieldFactor(realm, tierName) {
  const tier = TREASURE_TIERS[tierName];
  if (!tier) return 1;
  const need = majorRank(tier.minRealm);
  const have = majorRank(realm);
  if (have >= need) return 1;
  if (have === need - 1) return 0.5;
  return 0;
}

// 法宝实际威力：阶位威力 × 驱动系数 × 本命加成（1.25）
export function treasurePower(item, realm) {
  if (!item || !item.tier || !TREASURE_TIERS[item.tier]) return null;
  const tier = TREASURE_TIERS[item.tier];
  const factor = wieldFactor(realm, item.tier);
  const bonded = item.bonded ? 1.25 : 1;
  return Math.round(tier.mult * factor * bonded * 100) / 100;
}

// 祭炼本命法宝的代价：三成气血 + 三成价（本命不流通，按阶位价折算）
export function refineCost(treasure) {
  const tier = tierOf(treasure);
  if (!tier) return null;
  return { hpFraction: 0.3, stones: Math.round(tier.price * 0.3) };
}

// 能否祭炼为本命：金丹以上、且不是法器
export function canRefine(realm, treasure) {
  const tier = tierOf(treasure);
  if (!tier) return false;
  return tier.rank >= 1 && majorRank(realm) >= majorRank('金丹');
}
