// ============================================================
//  techniques.js —— 功法（凡人修仙传 口径）
//
//  原文要点：
//   · 长春功：木属性修仙"基础功法"，摊上标价两块低阶灵石（第 136 章）；
//   · 功法分品阶：基础、低阶、中阶、高阶、顶阶（第 149 章"低阶功法"、第 239 章"顶阶功法"）；
//   · 功法分层：基础功法练到七八层才够看，练到七层才有望筑基（第 106、134 章）；
//   · 灵根驳杂者（伪灵根）三四层就练不动（第 127 章）。
//
//  本模块只给数据与纯函数，修炼结算在 game.js。
// ============================================================

export const TECH_GRADES = {
  基础功法: { rank: 1, minRealm: '炼气', price: 200, mult: 1.0 },
  低阶功法: { rank: 2, minRealm: '炼气', price: 2000, mult: 1.2 },
  中阶功法: { rank: 3, minRealm: '筑基', price: 20000, mult: 1.5 },
  高阶功法: { rank: 4, minRealm: '金丹', price: 200000, mult: 2.0 },
  顶阶功法: { rank: 5, minRealm: '元婴', price: 2000000, mult: 3.0 },
};

export const TECH_TYPES = ['主修', '炼体', '神识', '剑诀', '御兽', '辅助'];

export const MAX_LAYER = 9;

// effect：cultMult 修炼倍率（按层数成长）；damageTaken 炼体减伤；deathMult 剑诀伤敌；sense 神识
export const TECHNIQUES = [
  { name: '长春功', grade: '基础功法', type: '主修', element: '木', desc: '木属性基础功法，最寻常的入门路子（第 136 章）。' },
  { name: '烈火诀', grade: '基础功法', type: '主修', element: '火', desc: '火属性基础功法，性烈，炼气修士多修。' },
  { name: '玄水诀', grade: '基础功法', type: '主修', element: '水', desc: '水属性基础功法，绵长耐久。' },
  { name: '庚金诀', grade: '基础功法', type: '主修', element: '金', desc: '金属性基础功法，锋锐伤身。' },
  { name: '厚土诀', grade: '基础功法', type: '主修', element: '土', desc: '土属性基础功法，厚重稳当。' },
  { name: '象甲功', grade: '低阶功法', type: '炼体', element: '土', desc: '以肉身硬抗刀兵，练成如披重甲。' },
  { name: '金刚诀', grade: '低阶功法', type: '炼体', element: '金', desc: '佛门一脉的炼体法，皮糙肉厚。' },
  { name: '匿踪术', grade: '低阶功法', type: '辅助', element: '水', desc: '收敛气息，藏形遁迹。' },
  { name: '御灵诀', grade: '中阶功法', type: '御兽', element: '木', desc: '与灵兽通意，驭兽如臂使指。' },
  { name: '焚天诀', grade: '中阶功法', type: '主修', element: '火', desc: '火道中阶功法，威力远胜基础。' },
  { name: '寒渊诀', grade: '中阶功法', type: '主修', element: '水', desc: '寒气入骨，可冻人经脉。' },
  { name: '大衍决', grade: '高阶功法', type: '神识', element: '无', desc: '专修神识的高阶功法，算力惊人。' },
  { name: '青元剑诀', grade: '高阶功法', type: '剑诀', element: '木', desc: '以木生火、以剑载道的高阶剑诀。' },
  { name: '玄阴经', grade: '高阶功法', type: '主修', element: '水', desc: '阴煞一脉的功法，正道修士避之不及。' },
  { name: '太清剑典', grade: '顶阶功法', type: '剑诀', element: '金', desc: '太清一脉的顶阶剑典，非嫡传不可得。' },
];

const BY_NAME = new Map(TECHNIQUES.map((t) => [t.name, t]));

export function techniqueByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  for (const t of TECHNIQUES) if (raw.includes(t.name)) return t;
  return null;
}

export function gradeOf(tech) {
  return tech ? TECH_GRADES[tech.grade] || TECH_GRADES['基础功法'] : null;
}

// 每层所需的"火候"经验
export function layerCost(layer = 1) {
  return Math.max(1, Number(layer) || 1) * 100;
}

// 升一层要的灵石：品阶越贵、层数越高越费
export function layerUpCost(tech, layer = 1) {
  const g = gradeOf(tech);
  return Math.round(g.price * (0.2 + 0.1 * (Math.max(1, layer) - 1)));
}

// 功法效果：修炼倍率随层数与品阶成长；炼体减伤、剑诀伤敌
export function techniqueEffect(tech, layer = 1) {
  const g = gradeOf(tech);
  const lv = Math.max(1, Math.min(MAX_LAYER, Number(layer) || 1));
  const base = 1 + 0.04 * lv * (g ? g.mult : 1);
  const out = { cultMult: 1 };
  if (tech.type === '主修' || tech.type === '辅助') out.cultMult = Math.round(base * 100) / 100;
  if (tech.type === '炼体') out.damageTaken = Math.max(0.5, 1 - 0.02 * lv * (g ? g.mult : 1));
  if (tech.type === '剑诀') out.deathMult = Math.max(0.4, 1 - 0.02 * lv * (g ? g.mult : 1));
  if (tech.type === '神识') out.breakForm = 0.01 * lv * (g ? g.mult : 1);
  return out;
}

// 主修功法的合计效果（多门功法：主修吃修炼，其余吃各自那一摊）
export function techniqueEffects(techniques = []) {
  const fx = { cultMult: 1, damageTaken: 1, deathMult: 1, breakForm: 0 };
  for (const t of techniques) {
    const def = techniqueByName(t.name);
    if (!def) continue;
    const e = techniqueEffect(def, t.layer || 1);
    if (e.cultMult) fx.cultMult = Math.max(fx.cultMult, e.cultMult);
    if (e.damageTaken) fx.damageTaken = Math.min(fx.damageTaken, e.damageTaken);
    if (e.deathMult) fx.deathMult = Math.min(fx.deathMult, e.deathMult);
    if (e.breakForm) fx.breakForm += e.breakForm;
  }
  return fx;
}
