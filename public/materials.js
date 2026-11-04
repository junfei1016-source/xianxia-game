// ============================================================
//  materials.js —— 材料（凡人修仙传 口径）
//
//  原文里的材料不是"背包里的字符串"，它至少带四样性质：
//   1) 年份/药龄：十年为凡、百年为灵、五百年为玄、千年为仙、万年为神；
//   2) 五行属性：草木多木属，灵液属水，矿石属金土，阴煞属阴；
//   3) 用途：炼丹（灵草灵果灵液妖丹）、炼器（矿石妖骨妖皮灵木）、制符（灵木灵液）；
//   4) 毒性/凶险：阴煞、血煞、生魂一类，炼丹损德、服之伤身。
//  韩立靠掌天瓶催熟灵药，本质就是"把十年份催成百年份"——年份即品阶。
// ============================================================

// 年份 → 品阶：这是材料最硬的一条规则
export const MATERIAL_TIERS = {
  凡品: { rank: 0, minYear: 0, price: 10 },
  灵品: { rank: 1, minYear: 100, price: 200 },
  玄品: { rank: 2, minYear: 500, price: 2000 },
  仙品: { rank: 3, minYear: 1000, price: 30000 },
  神品: { rank: 4, minYear: 5000, price: 400000 },
};

export const MATERIAL_KINDS = {
  灵草: '炼丹', 灵花: '炼丹', 灵果: '炼丹', 灵液: '炼丹',
  妖丹: '炼丹炼器', 妖骨: '炼器', 妖皮: '炼器', 妖血: '炼丹炼器',
  矿石: '炼器', 灵木: '炼器制符', 奇物: '多用途',
};

// element：五行；year：药龄；toxic：有毒/阴煞；regions：常见产地
export const MATERIALS = [
  // ---- 凡品（十年上下）----
  { name: '灵草', kind: '灵草', year: 10, element: '木', regions: ['qingwu', 'luoxia', 'dayan', 'zijin', 'jiangguo' ], desc: '最常见的灵草，十年药性。' },
  { name: '三七草', kind: '灵草', year: 5, element: '木', regions: ['qingwu', 'zijin' ], desc: '止血的凡药，修士也常备。' },
  { name: '解毒草', kind: '灵草', year: 30, element: '木', regions: ['qingwu', 'luoxia', 'zijin', 'kuixing' ], desc: '解寻常蛇虫之毒。' },
  { name: '灵泉水', kind: '灵液', tier: '凡品', year: 0, element: '水', regions: ['qingwu', 'luoxia', 'hanyuan', 'zijin', 'kuixing' ], desc: '含灵气的地泉，炼丹常用。' },
  { name: '玄铁', kind: '矿石', tier: '凡品', year: 0, element: '金', regions: ['dayan', 'chisha', 'zijin', 'jiuguo' ], desc: '打制法器的寻常精铁。' },
  { name: '赤铜', kind: '矿石', tier: '凡品', year: 0, element: '金', regions: ['dayan', 'chisha', 'jiuguo' ], desc: '炼器的基础铜料。' },
  { name: '妖皮', kind: '妖皮', tier: '凡品', year: 0, element: '无', regions: ['wanyao', 'xingyun', 'kuixing' ], desc: '低阶妖兽的皮，可制护甲。' },

  // ---- 灵品（百年）----
  { name: '百年灵草', kind: '灵草', year: 100, element: '木', regions: ['qingwu', 'luoxia', 'dayan', 'jiangguo', 'jiuguo', 'kuixing' ], desc: '百年药性，可入筑基丹方。' },
  { name: '回春草', kind: '灵草', year: 120, element: '木', regions: ['qingwu', 'luoxia', 'zijin' ], desc: '疗伤丹的主药。' },
  { name: '续骨花', kind: '灵花', year: 150, element: '木', regions: ['dayan'], desc: '续骨膏的主药。' },
  { name: '化毒花', kind: '灵花', year: 200, element: '木', regions: ['chisha', 'xingyun'], desc: '化毒丹的主药，微毒。', toxic: true },
  { name: '洗髓花', kind: '灵花', year: 300, element: '木', regions: ['hanyuan'], desc: '洗髓丹的主药，极难得。' },
  { name: '筑基灵药', kind: '灵草', year: 200, element: '木', regions: ['qingwu', 'dayan'], desc: '筑基丹的三味主药之一。' },
  { name: '妖丹', kind: '妖丹', tier: '灵品', year: 0, element: '无', regions: ['wanyao', 'hanyuan', 'xingyun', 'jiuguo', 'wubian', 'kuixing' ], desc: '妖兽内丹，炼丹炼器的通用引子。' },
  { name: '妖骨粉', kind: '妖骨', tier: '灵品', year: 0, element: '无', regions: ['wanyao', 'xingyun', 'kuixing' ], desc: '妖骨磨粉，续骨与炼器都用。' },
  { name: '寒铁', kind: '矿石', tier: '玄品', year: 0, element: '水', regions: ['hanyuan', 'wubian', 'kuixing' ], desc: '海底寒铁，性阴寒。' },
  { name: '灵玉', kind: '矿石', tier: '灵品', year: 0, element: '土', regions: ['guixu', 'dayan', 'dajin' ], desc: '储灵之物，制符炼器皆可。' },
  { name: '符纸', kind: '灵木', year: 0, element: '木', regions: ['qingwu', 'luoxia', 'dayan'], desc: '以灵木纤维抄成，画符的底子（第 92 章）。' },
  { name: '朱砂', kind: '矿石', year: 0, element: '火', regions: ['dayan', 'chisha', 'jiangguo', 'dajin' ], desc: '画符的颜料，性阳。' },
  { name: '灵墨', kind: '灵液', year: 0, element: '水', regions: ['luoxia', 'guixu'], desc: '掺了灵气的墨，高阶符箓要用。' },

  // ---- 玄品（五百年）----
  { name: '生肌草', kind: '灵草', year: 550, element: '木', regions: ['hanyuan'], desc: '生肌丹的主药。' },
  { name: '玄元果', kind: '灵果', year: 600, element: '木', regions: ['guixu', 'dajin' ], desc: '玄元丹的主药。' },
  { name: '结金草', kind: '灵草', year: 800, element: '金', regions: ['xingyun'], desc: '结金丹不可缺的一味。' },
  { name: '续命草', kind: '灵草', year: 600, element: '木', regions: ['luoxia', 'guixu'], desc: '续命丹的主药。' },
  { name: '驻颜花', kind: '灵花', year: 700, element: '木', regions: ['qingqiu', 'luoxia'], desc: '驻颜丹的主药。' },
  { name: '辟毒草', kind: '灵草', year: 650, element: '木', regions: ['wanyao'], desc: '辟毒丹的主药。' },
  { name: '易骨草', kind: '灵草', year: 750, element: '木', regions: ['xingyun'], desc: '易骨丹的主药。' },
  { name: '玄阴草', kind: '灵草', year: 600, element: '阴', regions: ['chisha'], desc: '玄阴丹的主药，性阴。', toxic: true },
  { name: '破障花', kind: '灵花', year: 850, element: '木', regions: ['hanyuan', 'guixu'], desc: '破障丹的主药。' },
  { name: '蚀骨花', kind: '灵花', year: 900, element: '阴', regions: ['chisha'], desc: '禁丹主药，蚀骨腐血。', toxic: true },
  { name: '阴煞之气', kind: '奇物', tier: '玄品', year: 0, element: '阴', regions: ['chisha', 'xingyun', 'jiangguo' ], desc: '阴煞凝聚之物，禁丹引子。', toxic: true },
  { name: '血煞石', kind: '矿石', tier: '玄品', year: 0, element: '阴', regions: ['xingyun'], desc: '浸血之石，炼禁丹用。', toxic: true },
  { name: '雷击木', kind: '灵木', tier: '玄品', year: 0, element: '雷', regions: ['wanyao', 'xingyun'], desc: '遭天雷劈过的灵木，制符与炼器皆佳。' },
  { name: '星砂', kind: '矿石', tier: '玄品', year: 0, element: '金', regions: ['xingyun'], desc: '陨星碎砂，炼器上品。' },

  // ---- 仙品（千年）----
  { name: '千年血参', kind: '灵草', year: 1000, element: '木', regions: ['wanyao', 'hanyuan'], desc: '大还丹与凝婴丹的主药。' },
  { name: '九幽草', kind: '灵草', year: 1200, element: '阴', regions: ['xingyun', 'wubian' ], desc: '九转还魂丹的主药。', toxic: true },
  { name: '凝婴果', kind: '灵果', year: 1500, element: '木', regions: ['wanyao'], desc: '凝婴丹的主药，千年一熟。' },
  { name: '大衍神木', kind: '灵木', year: 2000, element: '木', regions: ['wanyao', 'dajin' ], desc: '大衍丹的主药，亦是极品炼器材料。' },
  { name: '化形果', kind: '灵果', year: 2000, element: '木', regions: ['wanyao'], desc: '化形丹的主药，妖族至宝。' },
  { name: '妖王真血', kind: '妖血', tier: '仙品', year: 0, element: '无', regions: ['wanyao'], desc: '妖王精血，化形丹引子。' },
  { name: '太清灵液', kind: '灵液', tier: '仙品', year: 0, element: '水', regions: ['taiqing'], desc: '仙域灵液，太清丹主药。' },
  { name: '生魂', kind: '奇物', tier: '仙品', year: 0, element: '阴', regions: ['chisha'], desc: '拘来的生魂，禁丹之用，损德。', toxic: true },
  { name: '陨铁', kind: '矿石', tier: '仙品', year: 0, element: '金', regions: ['xingyun'], desc: '陨星之铁，炼器至宝。' },

  // ---- 神品（万年）----
  { name: '万年灵乳', kind: '灵液', year: 10000, element: '水', regions: ['hanyuan', 'taiqing', 'wubian', 'dajin' ], desc: '万年钟乳，延寿丹与仙丹的主药。' },
];

const BY_NAME = new Map(MATERIALS.map((m) => [m.name, m]));

export function tierForYear(year) {
  const y = Number(year) || 0;
  let tier = '凡品';
  for (const [name, def] of Object.entries(MATERIAL_TIERS)) {
    if (y >= def.minYear) tier = name;
  }
  return tier;
}

const YEAR_PREFIX = /^(十年|百年|五百年|千年|万年|十万年)/;

export function materialByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  // 只认「年份前缀 + 名录名」这一种变体：「百年回春草」→ 回春草。
  // 不做任意子串匹配，否则「玄铁甲」会被当成「玄铁」——那是衣物，不是材料。
  const prefixed = raw.match(YEAR_PREFIX);
  if (prefixed) {
    const rest = raw.slice(prefixed[0].length);
    if (BY_NAME.has(rest)) return BY_NAME.get(rest);
    for (const m of MATERIALS) {
      if (rest.startsWith(m.name)) return m;
    }
  }
  return null;
}

// 材料品阶：表里写了年份就按年份算；矿石/妖丹这类没有药龄的，用录入时的 tier
export function materialTier(material) {
  if (!material) return null;
  if (material.tier && MATERIAL_TIERS[material.tier]) return material.tier;
  return tierForYear(material.year);
}

export function materialPrice(material) {
  const tier = materialTier(material);
  return tier ? MATERIAL_TIERS[tier].price : 0;
}

// 某区域的常见材料（世界切片用）
export function materialsInRegion(regionId) {
  return MATERIALS.filter((m) => (m.regions || []).includes(regionId));
}

export function materialNamesInRegion(regionId, limit = 4) {
  return materialsInRegion(regionId).slice(0, limit).map((m) => `${m.name}（${materialTier(m)}）`);
}

// 炼丹时材料的品阶加成：用得起的料越好，成丹越稳（上限 +15%）
export function materialBrewBonus(materials = []) {
  let bonus = 0;
  for (const name of materials) {
    const m = materialByName(name);
    const tier = materialTier(m);
    if (tier) bonus += MATERIAL_TIERS[tier].rank * 0.03;
  }
  return Math.min(0.15, Math.round(bonus * 100) / 100);
}

// ---------- 五行与炼丹 ----------
// 火炼之法：木生火（助燃）、雷助火；水克火、阴寒压火、火克金（耗火）。
// 地火比真火更"火"，助与压都放大一半。
export function elementalBrewAdjust(materialNames = [], fire = '真火') {
  const els = materialNames.map((n) => materialByName(n)).filter(Boolean).map((m) => m.element);
  const power = fire === '地火' ? 1.5 : 1;
  let delta = 0;
  const notes = [];
  for (const el of els) {
    if (el === '木') { delta += 0.04 * power; notes.push('木助火'); }
    else if (el === '雷') { delta += 0.03 * power; notes.push('雷助火'); }
    else if (el === '水') { delta -= 0.05 * power; notes.push('水压火'); }
    else if (el === '阴') { delta -= 0.04 * power; notes.push('阴寒压火'); }
    else if (el === '金') { delta -= 0.02 * power; notes.push('火克金，耗火'); }
  }
  delta = Math.max(-0.2, Math.min(0.2, Math.round(delta * 100) / 100));
  return { delta, notes: [...new Set(notes)], elements: els };
}

// ---------- 采集 ----------
// 采药取草木灵液，挖矿取矿石灵木，猎妖取妖兽材料；境界越高，越能取到高阶之物。
export const GATHER_KINDS = {
  采药: ['灵草', '灵花', '灵果', '灵液'],
  挖矿: ['矿石', '灵木', '奇物'],
  猎妖: ['妖丹', '妖骨', '妖皮', '妖血'],
};

export function gatherPool(regionId, kind) {
  const kinds = GATHER_KINDS[kind];
  if (!kinds) return [];
  return materialsInRegion(regionId).filter((m) => kinds.includes(m.kind));
}

// ---------- 五行关系 ----------
// 相生：木→火→土→金→水→木；相克：木克土、土克水、水克火、火克金、金克木。
export const ELEMENT_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
export const ELEMENT_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

// a 对 b 的关系：生 / 被生 / 克 / 被克 / 同属 / 无
export function elementRelation(a, b) {
  if (!a || !b || a === '无' || b === '无') return '无';
  if (a === b) return '同属';
  if (ELEMENT_SHENG[a] === b) return '生';
  if (ELEMENT_SHENG[b] === a) return '被生';
  if (ELEMENT_KE[a] === b) return '克';
  if (ELEMENT_KE[b] === a) return '被克';
  return '无';
}

// 两件法宝的五行是否相冲（相克即冲，无论方向）
export function elementsClash(a, b) {
  const rel = elementRelation(a, b);
  return rel === '克' || rel === '被克';
}


