// ============================================================
//  roots.js —— 灵根（凡人修仙传 口径）
//
//  原文第 127 章：
//   · 五行、甚至四属性混杂 → 修炼惨不忍睹，只能把五行基本功法练至三、四层，
//     一生无望跨过筑基期，称为"伪灵根"；
//   · 只有两、三种属性 → 修炼较快，称为"真灵根"；
//   · 只有一种属性 → 称为"天根"（天灵根），上天的宠儿。
//  第 144 章：韩立四属性缺金、伪灵根，靠奇遇才到基础功法九层。
//
//  灵根一旦测出便不改；它决定修炼快慢与功法层数上限。
// ============================================================

export const ROOT_ELEMENTS = ['金', '木', '水', '火', '土'];
export const MUTANT_ROOTS = ['雷', '冰', '风', '暗'];

// 异灵根各有偏长（第152章雷灵根以破坏力著称、438章冰系远胜同阶、256章暗灵根适血灵大法）
export const MUTANT_TRAITS = {
  雷: { label: '雷灵根', deathMult: 0.9, desc: '以破坏力著称' },
  风: { label: '风灵根', travelMult: 0.9, desc: '身法轻快，脚程更快' },
  冰: { label: '冰灵根', damageTaken: 0.95, desc: '冰系功法远胜同阶' },
  暗: { label: '暗灵根', breakForm: 0.03, desc: '长于隐匿与破禁' },
};

// 出现频率（第127章）：变异灵根每二三十年一个，天根数百年才一个
export const ROOT_RARITY = { 天灵根: '数百年一见', 变异灵根: '二三十年一个', 双灵根: '少见', 三灵根: '寻常', 四灵根: '常见', 五灵根: '常见' };

// 层数上限按属性多少：伪灵根卡在三、四层，天根能到九层
export const ROOT_TIERS = {
  天灵根: { count: 1, cultMult: 1.8, layerCap: 9, label: '天根' },
  变异灵根: { count: 1, cultMult: 2.0, layerCap: 9, label: '异灵根' },
  双灵根: { count: 2, cultMult: 1.4, layerCap: 8, label: '真灵根' },
  三灵根: { count: 3, cultMult: 1.15, layerCap: 7, label: '真灵根' },
  四灵根: { count: 4, cultMult: 0.85, layerCap: 5, label: '伪灵根' },
  五灵根: { count: 5, cultMult: 0.7, layerCap: 4, label: '伪灵根' },
};

export function isMutant(elements = []) {
  return elements.some((e) => MUTANT_ROOTS.includes(e));
}

// 由属性推出灵根档次
export function rootTierOf(elements = []) {
  const list = Array.isArray(elements) ? elements.filter(Boolean) : [];
  if (!list.length) return null;
  if (isMutant(list)) return '变异灵根';
  const n = Math.min(5, Math.max(1, list.length));
  return ['天灵根', '天灵根', '双灵根', '三灵根', '四灵根', '五灵根'][n];
}

// 校验并归一：只能从五行/变异里取，最多五属，不能重复
export function normalizeRoots(elements = []) {
  const allowed = [...ROOT_ELEMENTS, ...MUTANT_ROOTS];
  const seen = new Set();
  const out = [];
  for (const e of Array.isArray(elements) ? elements : []) {
    const k = String(e).trim();
    if (allowed.includes(k) && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.slice(0, 5);
}

// 灵根档案：未测灵根（null）时不加不减、也不设层数上限
export function rootProfile(player) {
  const roots = player && Array.isArray(player.spiritRoots) ? player.spiritRoots : null;
  if (!roots || !roots.length) {
    return { tested: false, tier: null, label: '未测灵根', cultMult: 1, layerCap: 9, roots: [] };
  }
  const tier = rootTierOf(roots);
  const def = ROOT_TIERS[tier] || ROOT_TIERS['五灵根'];
  return { tested: true, tier, label: def.label, cultMult: def.cultMult, layerCap: def.layerCap, roots };
}

export function rootCultMult(player) {
  return rootProfile(player).cultMult;
}

export function rootLayerCap(player) {
  return rootProfile(player).layerCap;
}

// 异灵根偏长（无则全为 1）
export function rootTraits(player) {
  const prof = rootProfile(player);
  const out = { deathMult: 1, damageTaken: 1, travelMult: 1, breakForm: 0 };
  for (const e of prof.roots || []) {
    const t = MUTANT_TRAITS[e];
    if (!t) continue;
    if (t.deathMult) out.deathMult *= t.deathMult;
    if (t.damageTaken) out.damageTaken *= t.damageTaken;
    if (t.travelMult) out.travelMult *= t.travelMult;
    if (t.breakForm) out.breakForm += t.breakForm;
  }
  return out;
}

// 天根结丹无瓶颈（第241章"天灵根者自然也没有这方面的苦恼"）
export function rootNoCoreBottleneck(player) {
  return rootProfile(player).tier === '天灵根';
}

// 伪灵根修五行道法没天赋（第242章）：画符打折
export function rootCraftPenalty(player) {
  return rootProfile(player).layerCap <= 5 ? 0.8 : 1;
}

// 补天丹洗炼灵根（第490、541章）：洗掉一属、资质往上走一档
export function refineRootsOne(player) {
  const roots = player && Array.isArray(player.spiritRoots) ? [...player.spiritRoots] : [];
  if (roots.length <= 1) return null;
  const removed = roots.pop();
  player.spiritRoots = roots;
  return removed;
}
