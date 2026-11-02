// ============================================================
//  pills.js —— 丹药（凡人修仙传 的硬设定）
//
//  原文根据：
//   · 第 243 章：服丹太频，身体产生抗药性，丹药慢慢失去效用；
//   · 第 597—598 章：筑基期的丹药到了结丹期就无效——吸收效率追上了天地灵气，
//     除非换更有效的灵丹（高一个大境界以内有效）；
//   · 第 156 章：炼丹借玄阳之地的地肺之火，成丹率远高于真火；
//   · 第 397 章：买丹方、以妖丹配灵草批量炼丹，才解决抗药性问题。
//
//  所以丹药不是一个数值道具，而是：品阶 × 适用境界 × 抗药性 × 丹方材料。
//  这一层只做数据与纯函数，结算由 game.js 消费。
// ============================================================

// 大境界顺序（与 game.js 的 REALM_BASE 同名，避免循环依赖，这里本地维护）
const MAJORS = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
const MAJOR_RANK = Object.fromEntries(MAJORS.map((m, i) => [m, i]));

export function majorRank(realm) {
  const key = MAJORS.find((m) => String(realm || '').startsWith(m));
  return key === undefined ? 0 : MAJOR_RANK[key];
}

// grade 品阶；band 适用大境界（高于 band 一个大境界即失效）；kind 功效；
// hp/cult/life 为基准效果；healMonths 为给他人养伤可缩短的月数；price 参考价（下品灵石）
export const PILLS = [
  { id: 'zhixue', name: '止血散', grade: '凡品', band: '炼气', kind: '疗伤', hp: 15, price: 6, desc: '寻常伤药，止血生肌。' },
  { id: 'huichun', name: '回春丹', grade: '凡品', band: '筑基', kind: '疗伤', hp: 35, healMonths: 1, price: 15, desc: '坊市常见疗伤丹，重伤可缓。' },
  { id: 'shengji', name: '生肌丹', grade: '灵品', band: '金丹', kind: '疗伤', hp: 80, healMonths: 2, price: 120, desc: '断骨可续，需静养数日。' },
  { id: 'dahuan', name: '大还丹', grade: '玄品', band: '元婴', kind: '疗伤', hp: 200, healMonths: 3, price: 1200, desc: '起死回生的名丹，极难得。' },
  { id: 'juqi', name: '聚气丹', grade: '凡品', band: '炼气', kind: '聚气', cult: 3, price: 18, desc: '炼气期常备，聚气冲层。' },
  { id: 'ningyuan', name: '凝元丹', grade: '灵品', band: '筑基', kind: '聚气', cult: 6, price: 160, desc: '筑基修士的日常功课。' },
  { id: 'peiyuan', name: '培元丹', grade: '玄品', band: '金丹', kind: '聚气', cult: 10, price: 900, desc: '固本培元，结丹后仍有效用。' },
  { id: 'qingdu', name: '清毒丹', grade: '凡品', band: '筑基', kind: '解毒', hp: 10, price: 20, desc: '解寻常蛇虫之毒。' },
  { id: 'huadu', name: '化毒丹', grade: '灵品', band: '金丹', kind: '解毒', hp: 40, price: 200, desc: '可化阴毒，需以真元催开。' },
  { id: 'yanshou', name: '延寿丹', grade: '仙品', band: '元婴', kind: '延寿', life: 20, price: 60000, desc: '增寿二十载，有价无市。' },
  { id: 'zhuyan', name: '驻颜丹', grade: '玄品', band: '金丹', kind: '驻颜', price: 3000, desc: '容颜不老，对修为无益。' },
  { id: 'zhuji', name: '筑基丹', grade: '灵品', band: '炼气', kind: '破境', price: 1200, desc: '炼气圆满者服之，可增筑基之机（本作只作剧情与身价锚点）。' },
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

// 抗药性：服得越频越弱（原文第 243 章）。0 次 = 1.0，之后每次 ×0.75，最低 0.15。
export function resistanceFactor(times = 0) {
  const n = Math.max(0, Number(times) || 0);
  return Math.max(0.15, Math.round(Math.pow(0.75, n) * 1000) / 1000);
}

// 境界是否有效：丹药只对"不高于其适用境界"的人有用（原文第 598 章：筑基期丹药到结丹期失效）
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
