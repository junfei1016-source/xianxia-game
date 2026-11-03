// ============================================================
//  formations.js —— 阵法（凡人修仙传 口径）
//
//  原文要点：
//   · 阵旗、阵盘是"易携带好布置"的阵法类法器，但用它一般布不出厉害的禁法大阵（第 221 章）；
//   · 大阵要靠地脉、阵基，护山、封城、困妖都用得上；
//   · 阵法有困、杀、护、幻、传送、封印之分，破阵要找阵眼或以力破之；
//   · 高阶阵法极耗灵石，且对布阵者的修为有要求。
//
//  本模块只给"数据 + 纯函数"，布阵与否、花多少灵石由 game.js 结算。
// ============================================================

const MAJORS = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
function majorRank(realm) {
  const key = MAJORS.find((m) => String(realm || '').startsWith(m));
  return key === undefined ? 0 : MAJORS.indexOf(key);
}

// 等级越高，阵越强、越贵，对修为要求越高；五级起为"大阵"，需地脉阵基
export const FORMATION_TIERS = {
  一级: { rank: 1, minRealm: '炼气', price: 200, big: false },
  二级: { rank: 2, minRealm: '炼气', price: 800, big: false },
  三级: { rank: 3, minRealm: '筑基', price: 3000, big: false },
  四级: { rank: 4, minRealm: '筑基', price: 12000, big: false },
  五级: { rank: 5, minRealm: '金丹', price: 50000, big: true },
  六级: { rank: 6, minRealm: '金丹', price: 150000, big: true },
  七级: { rank: 7, minRealm: '元婴', price: 500000, big: true },
  八级: { rank: 8, minRealm: '化神', price: 1500000, big: true },
  九级: { rank: 9, minRealm: '炼虚', price: 5000000, big: true },
};

// effect：
//  cultMult     聚灵阵：修炼收益倍率
//  damageTaken  护山阵：受伤倍率（越小越硬）
//  deathMult    杀伐阵：致死倍率
//  interruptMult 幻阵：闭关被打断概率倍率
//  travelMult   传送阵：从本域出发的赶路天数倍率
export const FORMATIONS = [
  // 一级
  { name: '聚灵小阵', tier: '一级', type: '聚灵', effect: { cultMult: 1.08 }, desc: '引一缕地气入洞府，聊胜于无。' },
  { name: '迷魂小阵', tier: '一级', type: '幻术', effect: { interruptMult: 0.85 }, desc: '雾气打转，闲人走到跟前就迷糊。' },
  { name: '绊脚阵', tier: '一级', type: '困敌', effect: {}, desc: '藤蔓缠足，困得住凡人与低阶修士。' },
  // 二级
  { name: '金锁阵', tier: '二级', type: '困敌', effect: {}, desc: '金锁连环，入阵者转不出三步。' },
  { name: '土墙阵', tier: '二级', type: '护山', effect: { damageTaken: 0.92 }, desc: '厚土为墙，挡得几下法术。' },
  { name: '匿形阵', tier: '二级', type: '幻术', effect: { interruptMult: 0.75 }, desc: '把洞府藏进山势里，仇家寻不着。' },
  // 三级
  { name: '聚灵阵', tier: '三级', type: '聚灵', effect: { cultMult: 1.15 }, desc: '灵气汇聚成涡，修炼事半功倍。' },
  { name: '五行阵', tier: '三级', type: '杀伐', effect: { deathMult: 0.88 }, desc: '五行轮转，入阵者处处受制。' },
  { name: '迷仙阵', tier: '三级', type: '幻术', effect: { interruptMult: 0.6 }, desc: '连筑基修士也会在阵中打转。' },
  // 四级
  { name: '天雷阵', tier: '四级', type: '杀伐', effect: { deathMult: 0.8, damageTaken: 0.95 }, desc: '引天雷入阵，专克阴邪。' },
  { name: '护洞阵', tier: '四级', type: '护山', effect: { damageTaken: 0.85 }, desc: '洞府外墙，寻常修士破不开。' },
  // 五级（大阵）
  { name: '四象阵', tier: '五级', type: '杀伐', effect: { deathMult: 0.75, damageTaken: 0.9 }, desc: '青龙白虎朱雀玄武各镇一方，攻守兼备。' },
  { name: '传送阵', tier: '五级', type: '传送', effect: { travelMult: 0.5 }, desc: '两阵相感，万里可通——但极耗灵石。' },
  // 六级
  { name: '八卦阵', tier: '六级', type: '困敌', effect: { interruptMult: 0.5 }, desc: '八门金锁，入阵者困于门中。' },
  { name: '封灵阵', tier: '六级', type: '封印', effect: {}, desc: '封住一处灵脉或妖物，使其不能动。' },
  // 七级
  { name: '万剑阵', tier: '七级', type: '杀伐', effect: { deathMult: 0.68 }, desc: '万剑齐发，元婴修士也要避其锋。' },
  { name: '护山大阵', tier: '七级', type: '护山', effect: { damageTaken: 0.75, interruptMult: 0.6 }, desc: '一宗之根本，可挡同阶数人围攻。' },
  // 八级
  { name: '九曲迷仙阵', tier: '八级', type: '幻术', effect: { interruptMult: 0.35 }, desc: '九曲回环，连神识都探不到底。' },
  { name: '玄阴鬼阵', tier: '八级', type: '杀伐', effect: { deathMult: 0.6 }, desc: '阴煞聚鬼，正道见了要皱眉头。' },
  // 九级
  { name: '周天星斗大阵', tier: '九级', type: '综合', effect: { cultMult: 1.3, damageTaken: 0.7, deathMult: 0.6, interruptMult: 0.3 }, desc: '引周天星力为阵，传说中护界之阵。' },
];

const BY_NAME = new Map(FORMATIONS.map((f) => [f.name, f]));

export function formationByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  for (const f of FORMATIONS) if (raw.includes(f.name)) return f;
  return null;
}

export function formationTier(formation) {
  return formation ? FORMATION_TIERS[formation.tier] || null : null;
}

export function formationCost(formation) {
  const t = formationTier(formation);
  return t ? t.price : 0;
}

// 能不能布：修为要够（差一个大境界内可以勉强布，但威力打折——这里只判能不能）
export function canSetFormation(realm, formation) {
  const t = formationTier(formation);
  if (!t) return false;
  return majorRank(realm) >= majorRank(t.minRealm);
}

// 已布之阵的合计效果（同一效果取最强，不叠加）
export function formationEffects(formations = []) {
  const fx = { cultMult: 1, damageTaken: 1, deathMult: 1, interruptMult: 1, travelMult: 1 };
  for (const f of formations) {
    const def = formationByName(f.name);
    if (!def) continue;
    const e = def.effect || {};
    if (e.cultMult) fx.cultMult = Math.max(fx.cultMult, e.cultMult);
    if (e.damageTaken) fx.damageTaken = Math.min(fx.damageTaken, e.damageTaken);
    if (e.deathMult) fx.deathMult = Math.min(fx.deathMult, e.deathMult);
    if (e.interruptMult) fx.interruptMult = Math.min(fx.interruptMult, e.interruptMult);
    if (e.travelMult) fx.travelMult = Math.min(fx.travelMult, e.travelMult);
  }
  return fx;
}

// 阵旗阵盘这类"可携带"的阵只能到四级；五级以上是大阵，须借地脉
export function isPortable(formation) {
  const t = formationTier(formation);
  return !!t && !t.big;
}
