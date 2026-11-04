// ============================================================
//  treasures.js —— 法宝（凡人修仙传 口径）
//
//  原文层级：
//   · 法器：炼气修士所用，最低阶；
//   · 法宝：下品 / 中品 / 上品 / 极品；
//   · 古宝：上古遗府的旧物，威力大但认主不易（第 707 章 紫铖兜）；
//   · 本命法宝：以精血祭炼、与心神相连（韩立 青竹蜂云剑）；
//   · 灵宝 / 通天灵宝：虚天鼎 即通天灵宝（第 641 章）；
//   · 玄天之宝：混沌万灵榜上的通灵之宝（第 1359 章 玄天斩灵剑）。
//
//  **阶位定死，名字管够**：九阶的数值与门槛是规则；名录只是"常见样例"，
//  同阶可以有无数个名字。模型可以从名录里挑，也可以自造同阶之物（须带器型）。
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

// 器型决定用法：攻击型按阶位降致死，防御型按阶位减伤，奇物只叙事/辅助
export const ATTACK_TYPES = new Set(['飞剑', '剑', '刃', '钉', '扇', '梭', '锤', '剪', '锥', '鞭', '针', '刀', '枪']);
export const DEFENSE_TYPES = new Set(['盾', '幡', '网', '镜', '塔', '钟', '印', '珠', '环', '甲', '罩', '丝', '旗', '鼎', '葫芦']);

// 名录：同阶多名，名字只是皮；阶位与词条由表定。
export const TREASURES = [
  // ---------- 法器（炼气）----------
  { name: '青叶飞剑', tier: '法器', type: '飞剑', affix: '锋芒·剑走轻灵' },
  { name: '铁精盾', tier: '法器', type: '盾', affix: '护体·挡得三击' },
  { name: '玄铁钉', tier: '法器', type: '钉', affix: '锋芒·破甲' },
  { name: '赤火珠', tier: '法器', type: '珠', affix: '护体·避火' },
  { name: '竹节剑', tier: '法器', type: '剑', affix: '锋芒·轻捷' },
  { name: '黄铜环', tier: '法器', type: '环', affix: '护体·缠斗' },
  { name: '木傀儡', tier: '法器', type: '奇物', affix: '隐匿·代主受过' },
  { name: '火球符', tier: '法器', type: '奇物', affix: '锋芒·一次之威' },
  { name: '青石盾', tier: '法器', type: '盾', affix: '护体·顽石' },
  { name: '铁线鞭', tier: '法器', type: '鞭', affix: '锋芒·缠敌' },

  // ---------- 下品法宝（筑基）----------
  { name: '青蛟旗', tier: '下品法宝', type: '旗', affix: '护体·御敌' },
  { name: '玄龟盾', tier: '下品法宝', type: '盾', affix: '护体·金刚' },
  { name: '定风珠', tier: '下品法宝', type: '珠', affix: '镇心·定神' },
  { name: '金砖', tier: '下品法宝', type: '印', affix: '锋芒·斩敌' },
  { name: '赤铜镜', tier: '下品法宝', type: '镜', affix: '护体·照影' },
  { name: '黑铁印', tier: '下品法宝', type: '印', affix: '锋芒·镇压' },
  { name: '白骨钉', tier: '下品法宝', type: '钉', affix: '锋芒·阴毒破甲' },
  { name: '火鸦扇', tier: '下品法宝', type: '扇', affix: '锋芒·焚敌' },
  { name: '青丝网', tier: '下品法宝', type: '网', affix: '护体·困敌' },
  { name: '泥傀儡', tier: '下品法宝', type: '奇物', affix: '隐匿·替身' },
  { name: '青铜钟', tier: '下品法宝', type: '钟', affix: '护体·震慑' },
  { name: '玄铁鞭', tier: '下品法宝', type: '鞭', affix: '锋芒·裂甲' },

  // ---------- 中品法宝（筑基）----------
  { name: '银丝网', tier: '中品法宝', type: '网', affix: '护体·困敌' },
  { name: '天雷竹', tier: '中品法宝', type: '奇物', affix: '破劫·抗雷' },
  { name: '玄铁飞剑', tier: '中品法宝', type: '飞剑', affix: '锋芒·锐利' },
  { name: '紫竹箫', tier: '中品法宝', type: '奇物', affix: '镇心·清音' },
  { name: '玄阴幡', tier: '中品法宝', type: '幡', affix: '护体·聚阴' },
  { name: '冰蚕丝', tier: '中品法宝', type: '丝', affix: '护体·韧性' },
  { name: '火麟盾', tier: '中品法宝', type: '盾', affix: '护体·御火' },
  { name: '金蛇锥', tier: '中品法宝', type: '锥', affix: '锋芒·穿刺' },
  { name: '土行珠', tier: '中品法宝', type: '珠', affix: '护体·遁地' },
  { name: '青木印', tier: '中品法宝', type: '印', affix: '护体·回春' },
  { name: '白玉环', tier: '中品法宝', type: '环', affix: '镇心·守意' },
  { name: '雷公锤', tier: '中品法宝', type: '锤', affix: '锋芒·雷击' },

  // ---------- 上品法宝（金丹）----------
  { name: '金蚨子母刃', tier: '上品法宝', type: '刃', affix: '锋芒·斩敌破甲' },
  { name: '元磁神山', tier: '上品法宝', type: '印', affix: '护体·金刚' },
  { name: '青竹蜂云剑', tier: '上品法宝', type: '飞剑', affix: '锋芒·剑气纵横，悟道·养剑养神' },
  { name: '天鬼幡', tier: '上品法宝', type: '幡', affix: '锋芒·噬血' },
  { name: '紫电锤', tier: '上品法宝', type: '锤', affix: '锋芒·雷击破甲' },
  { name: '混元珠', tier: '上品法宝', type: '珠', affix: '护体·混元一气' },
  { name: '玄铁塔', tier: '上品法宝', type: '塔', affix: '护体·镇压' },
  { name: '碧玉葫芦', tier: '上品法宝', type: '葫芦', affix: '护体·收纳' },
  { name: '赤焰旗', tier: '上品法宝', type: '旗', affix: '锋芒·焚敌' },
  { name: '冰魄针', tier: '上品法宝', type: '针', affix: '锋芒·透骨' },
  { name: '金蚕丝', tier: '上品法宝', type: '丝', affix: '护体·缚敌' },
  { name: '落魂钟', tier: '上品法宝', type: '钟', affix: '镇心·摄魂' },

  // ---------- 极品法宝（金丹）----------
  { name: '七焰扇', tier: '极品法宝', type: '扇', affix: '锋芒·焚敌' },
  { name: '寒髓镜', tier: '极品法宝', type: '镜', affix: '护体·照破幻术' },
  { name: '金蛟剪', tier: '极品法宝', type: '剪', affix: '锋芒·断金' },
  { name: '紫金葫芦', tier: '极品法宝', type: '葫芦', affix: '护体·收纳万物' },
  { name: '玄龟甲', tier: '极品法宝', type: '甲', affix: '护体·金身' },
  { name: '天罡印', tier: '极品法宝', type: '印', affix: '锋芒·镇压' },
  { name: '玄铁重剑', tier: '极品法宝', type: '剑', affix: '锋芒·重剑无锋' },
  { name: '九环刀', tier: '极品法宝', type: '刀', affix: '锋芒·连斩' },
  { name: '火云罩', tier: '极品法宝', type: '罩', affix: '护体·焚敌' },
  { name: '冰魄神光', tier: '极品法宝', type: '奇物', affix: '锋芒·冻敌' },

  // ---------- 古宝（元婴）----------
  { name: '紫铖兜', tier: '古宝', type: '网', affix: '护体·困敌' },
  { name: '太乙五烟罗', tier: '古宝', type: '罩', affix: '护体·五烟护体' },
  { name: '玄阴罗', tier: '古宝', type: '网', affix: '护体·缚敌' },
  { name: '紫罗极火罩', tier: '古宝', type: '罩', affix: '锋芒·焚敌' },
  { name: '元磁神光', tier: '古宝', type: '奇物', affix: '锋芒·磁光断兵' },
  { name: '玄龟古甲', tier: '古宝', type: '甲', affix: '护体·不坏' },

  // ---------- 灵宝（元婴）----------
  { name: '灵犀珠', tier: '灵宝', type: '珠', affix: '镇心·通灵' },
  { name: '九幽幡', tier: '灵宝', type: '幡', affix: '锋芒·九幽摄魂' },
  { name: '天音钟', tier: '灵宝', type: '钟', affix: '镇心·荡魔' },
  { name: '玄天镜', tier: '灵宝', type: '镜', affix: '护体·照破万法' },
  { name: '紫霄环', tier: '灵宝', type: '环', affix: '锋芒·雷环' },
  { name: '混元幡', tier: '灵宝', type: '幡', affix: '护体·混元' },
  { name: '太虚塔', tier: '灵宝', type: '塔', affix: '护体·镇岳' },
  { name: '玄阴葫芦', tier: '灵宝', type: '葫芦', affix: '护体·收纳' },

  // ---------- 通天灵宝（化神）----------
  { name: '虚天鼎', tier: '通天灵宝', type: '鼎', affix: '护体·镇岳' },
  { name: '乾蓝鼎', tier: '通天灵宝', type: '鼎', affix: '锋芒·冰焰' },
  { name: '太虚神鼎', tier: '通天灵宝', type: '鼎', affix: '护体·太虚' },
  { name: '玄天锁', tier: '通天灵宝', type: '奇物', affix: '护体·锁天' },
  { name: '紫霄神雷塔', tier: '通天灵宝', type: '塔', affix: '锋芒·神雷' },
  { name: '混元金斗', tier: '通天灵宝', type: '奇物', affix: '护体·收纳乾坤' },

  // ---------- 玄天之宝（大乘）----------
  { name: '玄天斩灵剑', tier: '玄天之宝', type: '飞剑', affix: '锋芒·斩灵' },
  { name: '掌天瓶', tier: '玄天之宝', type: '奇物', affix: '长青·催灵' },
  { name: '玄天如意', tier: '玄天之宝', type: '奇物', affix: '护体·如意随心' },
  { name: '混沌葫芦', tier: '玄天之宝', type: '葫芦', affix: '护体·收纳混沌' },
  { name: '太初剑', tier: '玄天之宝', type: '飞剑', affix: '锋芒·太初' },
];

const BY_NAME = new Map(TREASURES.map((t) => [t.name, t]));

export function treasureByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  // 名字里包含名录中的某件（如「青竹蜂云剑（仿）」），取最长的匹配，避免误配短名
  let best = null;
  for (const t of TREASURES) {
    if (raw.includes(t.name) && (!best || t.name.length > best.name.length)) best = t;
  }
  return best;
}

// 某阶位的全部名录（供提示词或奇遇抽取）
export function treasuresOfTier(tier) {
  return TREASURES.filter((t) => t.tier === tier);
}

// 名录目录：按阶位分组，注入提示词用。约 700 字，比逐个列 field 省得多。
export function treasureCatalog() {
  return Object.keys(TREASURE_TIERS)
    .map((tier) => `${tier}（${TREASURE_TIERS[tier].minRealm}）：${treasuresOfTier(tier).map((t) => t.name).join('、')}`)
    .join('；');
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

// 法宝五行：用于炼器配材与"多宝相冲"。按器名关键字推断，认不出就记"无"。
const ELEMENT_HINTS = [
  ['雷', /雷|电|霆/],
  ['火', /火|焰|炎|赤|焰/],
  ['水', /寒|冰|水|泉|雪|霜/],
  ['木', /木|竹|草|藤|叶|青/],
  ['金', /金|铜|铁|银|钢|刃|剑|刀|针|钉|剪|锤/],
  ['土', /山|石|岩|土|甲|龟|鼎|塔|钟|印|环/],
  ['阴', /阴|鬼|幽|魂|煞/],
];
export function treasureElement(treasure) {
  if (!treasure) return '无';
  if (treasure.element) return treasure.element;
  const name = String(treasure.name || '');
  for (const [el, re] of ELEMENT_HINTS) if (re.test(name)) return el;
  return '无';
}

// 法宝实际威力：阶位威力 × 驱动系数 × 本命加成（1.25） × 五行相冲折扣（0.5）
export function treasurePower(item, realm) {
  if (!item || !item.tier || !TREASURE_TIERS[item.tier]) return null;
  const tier = TREASURE_TIERS[item.tier];
  const factor = wieldFactor(realm, item.tier);
  const bonded = item.bonded ? 1.25 : 1;
  const clash = item.conflict ? 0.5 : 1;
  return Math.round(tier.mult * factor * bonded * clash * 100) / 100;
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
