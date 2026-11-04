// ============================================================
//  game.js —— 规则层（"天道" + 通关规则 + 成就规则）
//
//  这里就是开发者唯一需要维护的"规则"：
//  剧情、NPC、事件、功法……统统由 AI 每局现场生成，不写死在这里。
// ============================================================

import { buildSlice, ensureWorldGeo, moveToRegion, regionById, regionByName, factionById, factionByName, relationsOf, secretOf, secretFactionsIn, priceMultiplier, addRegion, regionQi, regionDanger, qiLabel, qiCultMult, REGION_DRIFT, allRegions } from './world.js';
import { diversityBrief, normalizeTrait, rememberTrait } from './personality.js';
import { pillByName, pillEffect, recipeOf, brewChance, PILLS } from './pills.js';
import { treasureByName, treasurePower, tierOf, canRefine, refineCost, TREASURE_TIERS, ATTACK_TYPES, DEFENSE_TYPES, treasureCatalog, treasureElement } from './treasures.js';
import { materialByName, materialTier, materialBrewBonus, elementalBrewAdjust, GATHER_KINDS, gatherPool, MATERIAL_TIERS, elementRelation, elementsClash } from './materials.js';
import { formationByName, formationCost, canSetFormation, formationEffects, FORMATION_TIERS, isPortable, FORMATIONS, canSetOnLeyline, upgradeCost, FORMATION_MAX_LEVEL, leylinePhase, LEYLINE_MIN_QI } from './formations.js';
import { CRAFT_NAMES, SKILL_LEVELS, skillLevelOf, craftBonus, practiceGain, studyGain, talismanByName, TALISMAN_TIERS, TALISMANS, drawChance, applyCraftExp, isBottlenecked, MASTER_CAP_LEVEL } from './craft.js';
import { TECHNIQUES, TECH_GRADES, TECH_TYPES, MAX_LAYER, techniqueByName, techniqueExact, techniqueEffect, techniqueEffects, gradeOf, layerCost, layerUpCost, normalizeTechnique, checkTechniqueRequirements, requirementText, defOf } from './techniques.js';
import { ROOT_ELEMENTS, MUTANT_ROOTS, rootProfile, rootCultMult, rootLayerCap, normalizeRoots, rootTraits, refineRootsOne, rootCraftPenalty } from './roots.js';

// 法宝名录目录（注入提示词：阶位定死，名字管够）
const TREASURE_CATALOG = treasureCatalog();
// 阵法名录（阶位·类型）
const FORMATION_CATALOG = FORMATIONS.map((f) => `${f.name}（${f.tier}·${f.type}）`).join('、');
// 符谱（阶位）
const TALISMAN_CATALOG = TALISMANS.map((t) => `${t.name}（${t.tier}）`).join('、');
// 功法名录（品阶·类型·属性）
const TECH_CATALOG = TECHNIQUES.map((t) => `${t.name}（${t.grade}·${t.type}·${t.element}）`).join('、');

// ---------- 境界阶梯（唯一事实源，世界生成和 GM 都引用它）----------
export const REALM_LADDER = [
  '凡人',
  '炼气初期', '炼气中期', '炼气后期',
  '筑基初期', '筑基中期', '筑基后期',
  '金丹初期', '金丹中期', '金丹后期',
  '元婴初期', '元婴中期', '元婴后期',
  '化神初期', '化神中期', '化神后期',
  '合体初期', '合体中期', '合体后期',
  '大乘初期', '大乘中期', '大乘后期',
  '渡劫初期', '渡劫中期', '渡劫后期',
  '飞升',
];

export function realmIndex(name) {
  const i = REALM_LADDER.indexOf(name);
  return i === -1 ? 0 : i;
}

// 游戏版本号（发布时更新：帮助弹窗显示 + 导出日志附带，便于核对玩家版本）
export const GAME_VERSION = '1.37.0';

const LADDER_TEXT = REALM_LADDER.join(' → ');

// ---------- 可被 AI 修改的玩家数值属性（唯一清单）----------
export const PLAYER_ATTRS = ['hp', 'maxHp', 'lifespan', 'spiritStones', 'morality', 'reputation', 'cultivation'];

// 各大境界对应的基础寿元/气血上限（天道规则：境界越高，寿元越长、气血越盛）
export const REALM_BASE = {
  '凡人': { lifespan: 100, maxHp: 100 },
  '炼气': { lifespan: 150, maxHp: 200 },
  '筑基': { lifespan: 250, maxHp: 400 },
  '金丹': { lifespan: 400, maxHp: 700 },
  '元婴': { lifespan: 800, maxHp: 1200 },
  '化神': { lifespan: 1500, maxHp: 2000 },
  '合体': { lifespan: 3000, maxHp: 3500 },
  '大乘': { lifespan: 6000, maxHp: 6000 },
  '渡劫': { lifespan: 10000, maxHp: 10000 },
};

export function realmMajor(realm) {
  for (const key of Object.keys(REALM_BASE)) {
    if (realm.startsWith(key)) return key;
  }
  return '凡人';
}

// ---------- 每一阶突破所需修为（前低后高：境界越高，突破所需修为越多）----------
// 未列出的合体/大乘/渡劫期默认需 100%（圆满）。
const BREAKTHROUGH_NEED = [
  { major: '凡人', need: 50 },
  { major: '炼气', need: 60 },
  { major: '筑基', need: 70 },
  { major: '金丹', need: 80 },
  { major: '元婴', need: 85 },
  { major: '化神', need: 90 },
];

// 当前境界要突破到下一阶，需要修为达到多少（0~100）。
export function breakthroughNeed(realm) {
  const major = realmMajor(realm);
  const hit = BREAKTHROUGH_NEED.find((x) => x.major === major);
  return hit ? hit.need : 100;
}

// 供 prompt 使用的门槛说明（单一事实源，避免几处描述不一致）。
const BREAKTHROUGH_NEED_TEXT = BREAKTHROUGH_NEED
  .map((x) => (x.major === '凡人' ? `凡人→炼气需五成（${x.need}%）` : `${x.major}期需${x.need}%`))
  .join('、') + '、合体/大乘/渡劫期需圆满（100%）';

// ---------- 难度与节奏（开发者可调）----------
// damageMult 受伤倍率 / deathHigh 高危行为坠入濒死概率 / deathLethal 致命行为坠入濒死概率
// gainMult 灵石收益倍率 / breakBonus 突破与渡劫成功率加成 / tribDeathMult 渡劫失败致死倍率
export const DIFFICULTIES = {
  '简单': { damageMult: 0.7, deathHigh: 0.02, deathLethal: 0.25, gainMult: 1.25, breakBonus: 8,  tribDeathMult: 0.6, label: '简单' },
  '普通': { damageMult: 1.0, deathHigh: 0.05, deathLethal: 0.40, gainMult: 1.0,  breakBonus: 0,   tribDeathMult: 1.0, label: '普通' },
  '困难': { damageMult: 1.5, deathHigh: 0.12, deathLethal: 0.60, gainMult: 0.85, breakBonus: -5,  tribDeathMult: 1.3, label: '困难' },
  '炼狱': { damageMult: 2.0, deathHigh: 0.25, deathLethal: 0.85, gainMult: 0.7,  breakBonus: -10, tribDeathMult: 1.6, label: '炼狱' },
};
export const DIFFICULTY_LEVELS = Object.keys(DIFFICULTIES);

export const PACES = {
  '快': { cultivationMult: 2.0, label: '快节奏' },
  '慢': { cultivationMult: 1.0, label: '慢节奏' },
};
export const PACE_LEVELS = Object.keys(PACES);

export const TURN_LIMITS = [0, 30, 50, 100, 200]; // 0 表示无限制

// ---------- 修为增益（玩家可控倍率，尤其适合开启回合上限时提速）----------
export const CULT_GAIN_LEVELS = ['0.5x', '1x', '2x', '3x', '5x'];
export function cultGainMult(level) {
  const n = parseFloat(level);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---------- 叙事篇幅（玩家可选，控制输出成本）----------
export const LENGTH_LEVELS = ['精简', '标准', '丰富'];
export function lengthLimit(level) {
  if (level === '精简') return '约150字';
  if (level === '丰富') return '约400字';
  return '约250字';
}

// ---------- 天下大势（影响收益/危险/修炼，有得有失）----------
// 五种大势各有独特画像：收益×/危险×/修炼×，加上各自的机缘花样池（见天道规则第 11 条）
export const ERA_TYPES = {
  '盛世':   { label: '盛世', gainMult: 1.2,  dangerMult: 0.7,  cultMult: 1.0 },
  '乱世':   { label: '乱世', gainMult: 1.3,  dangerMult: 1.25, cultMult: 1.0 },
  '末法时代':{ label: '末法时代', gainMult: 0.7, dangerMult: 0.6, cultMult: 0.75 },
  '秘境将启':{ label: '秘境将启', gainMult: 1.35, dangerMult: 1.0, cultMult: 1.0 },
  '正魔大战':{ label: '正魔大战', gainMult: 1.4, dangerMult: 1.35, cultMult: 1.0 },
};
export const ERA_LEVELS = Object.keys(ERA_TYPES);

export function eraTypeFromText(text) {
  if (!text) return '乱世';
  if (/盛世|太平|繁荣|昌盛/.test(text)) return '盛世';
  if (/乱|动荡|战乱|割据/.test(text)) return '乱世';
  if (/末法|灵气枯竭|灵气稀薄|衰微/.test(text)) return '末法时代';
  if (/秘境|遗迹|洞府|传承将启/.test(text)) return '秘境将启';
  if (/正魔|大战|战事/.test(text)) return '正魔大战';
  return '乱世';
}

// ---------- 出身（起始加成，含魔道出身）----------
export const ORIGINS = {
  '宗门弟子': { morality: 10, reputation: 10, spiritStones: 20, skill: '宗门吐纳法' },
  '散修':     { morality: 0, reputation: 0, spiritStones: 10 },
  '世家子弟': { morality: 5, reputation: 20, spiritStones: 100, skill: '家传练气诀' },
  '凡人孤儿': { morality: 0, reputation: 0, spiritStones: 0 },
  '穿越者':   { morality: 0, reputation: 0, spiritStones: 10 },
  '流浪剑客': { morality: 5, reputation: 5, spiritStones: 15, skill: '基础剑法' },
  '魔门弃徒': { morality: -20, reputation: -10, spiritStones: 20, skill: '魔门残篇' },
  '魔道世家': { morality: -30, reputation: 15, spiritStones: 100, skill: '家传魔功' },
  '魔宗杂役': { morality: -15, reputation: -5, spiritStones: 5 },
};
export const ORIGIN_LEVELS = Object.keys(ORIGINS);

export function originTypeFromText(text) {
  if (!text) return '散修';
  if (/魔门|魔宗|魔道|魔教/.test(text)) return /世家/.test(text) ? '魔道世家' : (/弃徒/.test(text) ? '魔门弃徒' : '魔宗杂役');
  if (/世家/.test(text)) return '世家子弟';
  if (/孤儿|弃儿|无依|流落/.test(text)) return '凡人孤儿';
  if (/穿越|异世/.test(text)) return '穿越者';
  if (/剑客|剑|刀客|流浪/.test(text)) return '流浪剑客';
  if (/宗门|门派|弟子|杂役|外门/.test(text)) return '宗门弟子';
  return '散修';
}

// ---------- 功法品阶（越高修炼越快）----------
export const SKILL_GRADES = {
  '基础': 1.0,
  '玄阶': 1.3,
  '地阶': 1.6,
  '天阶': 2.0,
  '仙阶': 2.5,
};
export function gradeMult(grade) {
  return SKILL_GRADES[grade] || 1.0;
}

// ---------- 物品品类（决定"使用"效果方向）----------
// action: 'use'=使用/服用，'equip'=装备/穿戴，null=不可操作
export const ITEM_KINDS = {
  '丹药':   { label: '丹药', action: 'use', hint: '服用：疗伤回血 / 聚气增修为 / 延寿增寿元 / 破障助突破' },
  '天材地宝': { label: '天材地宝', action: 'use', hint: '服用：大幅提升修为或延寿' },
  '法宝':   { label: '法宝', action: 'equip', hint: '装备后获得被动修炼加成（按品阶）' },
  '武器':   { label: '武器', action: 'equip', hint: '装备后增强战斗（战斗数值系统接入后生效）' },
  '衣物':   { label: '衣物', action: 'equip', hint: '穿戴后提供防护或被动加成' },
  '符箓':   { label: '符箓', action: 'use', hint: '使用：一次性符力（回血、护身、神行、伤敌）' },
  '材料':   { label: '材料', action: null, hint: '炼丹/炼器材料：可在炼丹炉/炼器中消耗，打造丹药或装备' },
};
export const ITEM_KIND_LEVELS = Object.keys(ITEM_KINDS);
// 背包展示顺序（按此顺序分组）
export const ITEM_KIND_ORDER = ['丹药', '天材地宝', '符箓', '法宝', '武器', '衣物', '材料'];

// 从名字/描述推断品类（提取器未显式给 kind 时兜底）
export function kindFromText(name, desc) {
  const n = String(name || '');
  const s = n + String(desc || '');
  if (/丹|丸|散|膏|汤|剂/.test(n)) return '丹药';
  if (/符/.test(n)) return '符箓';
  if (/衣|袍|甲|铠|靴|冠|衫|裙|披风|鞋|履|帽|巾|带|镯|戒|胄/.test(n)) return '衣物';
  if (/剑|刀|枪|戟|斧|锤|鞭|弓|弩|棍|棒|叉|钺|锏|钩|杖|针|镖/.test(n)) return '武器';
  if (/镜|印|珠|幡|鼎|炉|钟|塔|梭|环|扇|琴|箫|葫芦|令|旗|符|铃|炉/.test(n)) return '法宝';
  if (/参|芝|莲|果|花|草|藤|髓|晶|露|精|乳|浆|叶|根/.test(s)) return '天材地宝';
  return '材料';
}

// ---------- 装备稀有度（由获得难度决定）----------
export const RARITIES = {
  '凡品': { label: '凡品', cultMult: 1.0, ascendBonus: 0 },
  '灵品': { label: '灵品', cultMult: 1.05, ascendBonus: 0 },
  '玄品': { label: '玄品', cultMult: 1.10, ascendBonus: 5 },
  '仙品': { label: '仙品', cultMult: 1.20, ascendBonus: 10 },
  '神品': { label: '神品', cultMult: 1.30, ascendBonus: 15 },
};
export const RARITY_LEVELS = Object.keys(RARITIES);
export function rarityMult(rarity) {
  return (RARITIES[rarity] || RARITIES['凡品']).cultMult;
}

// ---------- 效果词条注册表（封闭引擎：AI 只能引用、不能改规则）----------
// kind: 'cult'=修行词条（给修炼倍率，需装备）；'func'=功能词条（真实机制）
// 未命中任何注册词条的描述一律视为"叙事词条"（无数值效果，UI 灰色标注）
export const AFFIX_REGISTRY = {
  '悟道': { kind: 'cult', test: /修炼|悟道|吐纳|凝气|聚灵|参悟|顿悟/, fx: { cultMult: 1.1 }, label: '修炼更快', desc: '修为收益 +10%（取最强不叠加）' },
  '护体': { kind: 'func', test: /护体|护身|减伤|铜皮|御敌|金刚/, fx: { defMult: 0.9 }, label: '护体', desc: '战斗受伤 -10%' },
  '破劫': { kind: 'func', test: /破劫|渡劫|抗雷|镇魔|避劫|避雷/, fx: { ascendBonus: 10 }, label: '破劫', desc: '渡劫成功率 +10%（取最强不叠加）' },
  '逆天改命': { kind: 'func', test: /逆天改命|免死|涅槃|续命|不死/, fx: { revive: true }, label: '逆天改命', desc: '免死一次：死亡时消耗此物，气血恢复至 30%' },
  '双持': { kind: 'func', test: /双持|双兵|双臂|左右开弓/, fx: { dualWield: true }, label: '双持', desc: '可同时装备两件武器' },
  '多宝': { kind: 'func', test: /多宝|纳宝|御宝|玲珑/, fx: { multiTreasure: true }, label: '多宝', desc: '可同时装备两件法宝' },
  '锋芒': { kind: 'func', test: /锋芒|锐利|破甲|斩敌|克敌/, fx: { edge: true }, label: '锋芒', desc: '战斗时敌人境界按低一阶计算' },
  '疾风': { kind: 'func', test: /疾风|神速|如风|迅捷|轻身/, fx: { swift: true }, label: '疾风', desc: '战斗致死概率 ×0.8' },
  '铁骨': { kind: 'func', test: /铁骨|钢筋|不坏|顽石|坚韧/, fx: { ironBone: true }, label: '铁骨', desc: '重伤保底：气血不低于上限 15%' },
  '噬血': { kind: 'func', test: /噬血|吸血|饮血|血祭/, fx: { lifesteal: true }, label: '噬血', desc: '战斗吸血：返还所受伤势的 30%' },
  '回春': { kind: 'func', test: /回春|自愈|再生|疗愈/, fx: { regen: true }, label: '回春', desc: '无战斗回合末自愈 5% 气血' },
  '隐匿': { kind: 'func', test: /隐匿|敛息|藏锋|无形/, fx: { stealth: true }, label: '隐匿', desc: '非战斗危险遭遇概率 ×0.8' },
  '破障': { kind: 'func', test: /破障|冲关|破境|冲脉/, fx: { breakBonus: 10 }, label: '破障', desc: '大境界突破成功率 +10%' },
  '镇心': { kind: 'func', test: /镇心|定神|清心|守意|明心/, fx: { calmMind: true }, label: '镇心', desc: '突破失败不走火入魔' },
  '长青': { kind: 'func', test: /长青|驻颜|延年|益寿|不凋/, fx: { evergreen: true }, label: '长青', desc: '时间流逝的寿元消耗减半' },
  '气运': { kind: 'func', test: /气运|天命|鸿运|福缘/, fx: { fortune: 0.1 }, label: '气运', desc: '气运 +10%（修为收益浮动）' },
  '聚财': { kind: 'func', test: /聚财|招财|纳财|生财/, fx: { wealth: 1.1 }, label: '聚财', desc: '灵石收益 ×1.1' },
  '威仪': { kind: 'func', test: /威仪|声望|威望|显赫/, fx: { prestige: 1.2 }, label: '威仪', desc: '声望正增长 ×1.2' },
  '慧眼': { kind: 'func', test: /慧眼|鉴宝|洞察|明鉴/, fx: { insight: true }, label: '慧眼', desc: '探索所得物品稀有度可上浮一档' },
};
export const AFFIX_REGISTRY_KEYS = Object.keys(AFFIX_REGISTRY);
// 词条注册表目录（注入 GM/提取器提示词：AI 只能引用这些词条）
const AFFIX_CATALOG = AFFIX_REGISTRY_KEYS.map((k) => `${k}=${AFFIX_REGISTRY[k].desc.replace(/（.*）$/, '')}`).join('、');

// 合并解析一条词条文本：命中注册表 → 机械效果；未命中 → 纯叙事（无数值效果）
export function affixEffects(affix) {
  const s = String(affix || '');
  const fx = {
    cultMult: 1, defMult: 1, ascendBonus: 0, revive: false,
    dualWield: false, multiTreasure: false, edge: false, swift: false, ironBone: false,
    lifesteal: false, regen: false, stealth: false, breakBonus: 0, calmMind: false,
    evergreen: false, fortune: 0, wealth: 1, prestige: 1, insight: false,
    matched: [],
  };
  for (const [key, def] of Object.entries(AFFIX_REGISTRY)) {
    if (def.test.test(s)) {
      fx.matched.push(key);
      Object.assign(fx, def.fx);
    }
  }
  return fx;
}
// 词条标签：机械词条（金色展示，带效果说明）；空数组 = 叙事词条
export function affixLabels(affix) {
  const fx = affixEffects(affix);
  return fx.matched.map((k) => ({ key: k, label: AFFIX_REGISTRY[k].label, desc: AFFIX_REGISTRY[k].desc, kind: AFFIX_REGISTRY[k].kind }));
}
// 常驻功能法宝：法宝、无修行词条但有功能词条 → 无需装备、始终生效、不给修炼倍率。
// 名录法宝（有 tier）一律走阶位与槽位，不再算"功能法宝"，否则上品法宝会被当成免费常驻。
export function isFunctionalTreasure(it) {
  if (!it || it.tier) return false;
  const kind = it.kind || kindFromText(it.name, it.desc);
  if (kind !== '法宝') return false;
  const fx = affixEffects(it.affix);
  return fx.cultMult === 1 && fx.matched.length > 0;
}
// 生效物品池：已装备物品 + 常驻功能法宝
export function activeItems(inventory) {
  return (inventory || []).filter((it) => it && (it.equipped || isFunctionalTreasure(it)));
}
export function activeHas(inventory, flag) {
  return activeItems(inventory).some((it) => affixEffects(it.affix)[flag]);
}
function findReviveItem(world) {
  return activeItems(world && world.inventory).find((it) => affixEffects(it.affix).revive) || null;
}
function removeItem(world, name) {
  world.inventory = (world.inventory || []).filter((t) => t.name !== name);
}
// 装备一件物品（槽位规则：衣物 1 件；武器 1+双持；法宝 1+多宝；功能法宝常驻不占槽）
export function equipItem(world, it) {
  if (!world || !it) return;
  const kind = it.kind || kindFromText(it.name, it.desc);
  const kindOf = (t) => t.kind || kindFromText(t.name, t.desc);
  if (kind === '武器') {
    const slots = 1 + (activeHas(world.inventory, 'dualWield') || affixEffects(it.affix).dualWield ? 1 : 0);
    const others = (world.inventory || []).filter((t) => t !== it && t.equipped && kindOf(t) === '武器');
    if (others.length >= slots) others[0].equipped = false; // 满槽则替换第一把
  } else if (kind === '法宝' && !isFunctionalTreasure(it)) {
    const slots = 1 + (activeHas(world.inventory, 'multiTreasure') || affixEffects(it.affix).multiTreasure ? 1 : 0);
    const others = (world.inventory || []).filter((t) => t !== it && t.equipped && kindOf(t) === '法宝');
    if (others.length >= slots) others[0].equipped = false;
  } else if (kind === '衣物') {
    for (const t of world.inventory || []) {
      if (t !== it && t.equipped && kindOf(t) === '衣物') t.equipped = false;
    }
  }
  it.equipped = true;
  if (!it.grade) it.grade = '基础';
  refreshTreasureConflicts(world);
}

// 五行相冲：同时装备的两件名录法宝若相克，双方威力减半（多宝不是随便堆的）
function refreshTreasureConflicts(world) {
  const eq = (world.inventory || []).filter((it) => it && it.equipped && it.tier);
  for (const it of eq) it.conflict = false;
  for (let i = 0; i < eq.length; i++) {
    for (let j = i + 1; j < eq.length; j++) {
      const a = treasureElement(treasureByName(eq[i].name) || {});
      const b = treasureElement(treasureByName(eq[j].name) || {});
      if (elementsClash(a, b)) {
        eq[i].conflict = true;
        eq[j].conflict = true;
      }
    }
  }
}

// ---------- 突破 / 渡劫 风险评估（规则引擎算，GM 只讲故事）----------
// kind: 'major'=大境界突破，'ascend'=渡劫飞升
export function breakthroughRate(player, world, kind) {
  let rate = kind === 'ascend' ? 50 : 60;
  const diff = DIFFICULTIES[(world && world.settings && world.settings.difficulty) || '普通'] || DIFFICULTIES['普通'];
  rate += diff.breakBonus || 0; // 难度影响突破/渡劫成功率
  if (kind === 'major' && activeHas(world.inventory, 'breakBonus')) rate += AFFIX_REGISTRY['破障'].fx.breakBonus; // 破障词条：大境界突破 +10%
  // 阶位/稀有度与词条的渡劫·突破加成：取单件最高，不再叠加（防堆装备刷成功率）
  let best = 0;
  for (const it of activeItems(world.inventory)) {
    const tier = it.tier ? TREASURE_TIERS[it.tier] : null;
    const r = RARITIES[it.rarity] || RARITIES['凡品'];
    const base = tier
      ? tier.ascendBonus * (treasurePower(it, player.realm) ? 1 : 0)
      : (kind === 'ascend' ? r.ascendBonus : Math.floor(r.ascendBonus / 2));
    best = Math.max(best, base + affixEffects(it.affix).ascendBonus);
  }
  rate += best;
  if ((world.npcs || []).some((n) => /道侣|双修|拜师|师徒/.test(n.relation || ''))) rate += 10;
  if ((player.morality || 0) >= 30 || (player.reputation || 0) >= 50) rate += 10;
  if (kind === 'ascend' && player.realm !== '渡劫后期') rate -= 30;
  return Math.max(5, Math.min(95, rate));
}

// 渡劫失败致死率（随难度升降；裸渡约：简单13% / 普通25% / 困难36% / 炼狱48%）
export function tribulationDeathProb(rate, difficulty) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES['普通'];
  return Math.min(0.85, Math.max(0.03, (100 - rate) * 0.005 * (diff.tribDeathMult || 1)));
}

// 尝试大境界突破 / 渡劫：返回 {success, death, qiDeviation, note}
export function attemptBreakthrough(player, world, kind) {
  const rate = breakthroughRate(player, world, kind);
  const roll = Math.random() * 100;
  if (roll < rate) {
    if (kind === 'ascend') {
      player.realm = '飞升';
      return { success: true, death: false, qiDeviation: false, rate, note: '天劫渡过，霞举飞升！' };
    }
    return { success: true, death: false, qiDeviation: false, rate, note: '突破成功，境界更进一步！' };
  }
  // 失败
  const deathProb = kind === 'ascend' ? tribulationDeathProb(rate, world && world.settings && world.settings.difficulty) : 0;
  const reviveItem = findReviveItem(world); // 逆天改命：免死一次（词条消耗）
  const deathRoll = kind === 'ascend' ? Math.random() : 1;
  const calmMind = activeHas(world.inventory, 'calmMind'); // 镇心：失败不走火入魔
  const die = kind === 'ascend' && deathRoll < deathProb && !reviveItem;
  if (die) {
    player.hp = 0;
    world.flags.deathByRisk = true;
    return { success: false, death: true, qiDeviation: false, rate, note: '渡劫失败，身死道消！' };
  }
  if (kind === 'ascend' && deathRoll < deathProb && reviveItem) {
    // 渡劫失败本该身死，被逆天改命救下（消耗词条）
    player.hp = Math.max(1, Math.round(player.maxHp * 0.3));
    player.cultivation = Math.max(0, player.cultivation - 40);
    removeItem(world, reviveItem.name);
    return { success: false, death: false, qiDeviation: false, rate, note: `渡劫失败，幸有「${reviveItem.name}」替你挡下死劫！修为仍受重创。` };
  }
  player.cultivation = Math.max(0, player.cultivation - (kind === 'ascend' ? 40 : 20));
  const qiDev = Math.random() < 0.6; // 大境界失败大概率走火入魔；渡劫失败也可能
  if (!calmMind && (qiDev || kind === 'major')) world.flags.qiDeviation = true;
  return { success: false, death: false, qiDeviation: world.flags.qiDeviation === true, rate, note: kind === 'ascend' ? '渡劫失败，修为大损！' : '强行突破失败，走火入魔，修为受损！' };
}

// ---------- 初始状态 ----------
export function newPlayerState() {
  return {
    name: '无名氏',
    origin: '',
    backstory: '',
    realm: '凡人',      // 境界
    hp: 100,            // 气血
    maxHp: 100,
    lifespan: 100,      // 寿元（凡人百岁，随境界提升）
    spiritStones: 0,    // 灵石
    morality: 0,        // 正邪：-100(魔) ~ +100(仙)
    reputation: 0,      // 声望：0 ~ 100
    cultivation: 0,     // 当前境界修炼进度：0 ~ 100
    pillUsage: {},      // 各丹药服过几次（抗药性）；每半年消退一次
    pillUsageMonth: 0,  // 上次消退的月份
    crafts: { 符箓: 0, 阵法: 0, 丹道: 0, 炼器: 0 }, // 四艺造诣（经验值，每 100 一级）
    craftMasters: {},   // 各艺的师承：{ '丹道': '师父名' }
    craftSecrets: {},   // 暗中拜的师：{ '丹道': {master, from, sinceMonth} }
    craftStuck: {},     // 各艺卡瓶颈的次数（越高越容易顿悟）
    techniques: [],     // 已修功法：[{name, layer, exp}]
    mainTechnique: null, // 主修功法名（只吃一门）
    spiritRoots: null,  // 测出的灵根：['水'] / ['木','火']；未测为 null
  };
}

export function newWorldState() {
  return {
    era: '',
    startingLocation: null,
    factions: [],
    npcs: [],        // [{name, desc, relation?}]
    aliasMap: {},    // 身份代称 → 已分配姓名（自动命名对照表）
    traitLog: [],    // 最近登场人物的性格记录（供"性格要多元"的反重复统计）
    npcLinks: [],    // 人物之间的关系网：[{a,b,type,note,turn}]，NPC 彼此也有师承/亲眷/恩怨
    recipes: [],     // 已知丹方：{name,pill,tier,pieces,have,chance,materials,price}
    nodes: [],       // 采集点：{id,region,kind(药圃/矿脉/妖巢),material,respawnMonths,harvestedMonth}
    plots: [],       // 自营灵田/矿脉：{id,region,kind,material,tier,matureMonth}
    formations: [],  // 已布阵法：{name,tier,type,region,setMonth,level}
    foeFormations: [], // 敌方布下的阵：{name,tier}
    jadeSlips: [],   // 玉简（书）：{name, skill, read}
    talismanBuff: null, // 符箓给的短时增益：{name, damageTaken, deathMult, travelMult, untilMonth}
    knownSecrets: {}, // 势力底细的查明进度：{ 势力id: 'hinted' | 'revealed' }，没查过就没有键
    locations: [],   // [{name, desc}]
    items: [],       // 图鉴：获得过的物品（永久记录，[{name, desc}]）
    inventory: [],   // 背包：当前持有（带数量，[{name, desc, qty}]）
    skills: [],      // [{name, desc}]
    events: [],      // [{name, desc}]
    goal: { type: '飞升成仙', desc: '渡劫飞升，位列仙班', status: '进行中' },
    flags: {},
    closedStreak: 0,   // 连续闭关回合数（用于闭关收益递减）
    memory: '',        // 长期剧情记忆（由记忆压缩生成）
    achievements: [],  // 已解锁成就标题列表
    turn: 0,           // 回合计数
    date: { year: 1, month: 1, day: 1 },   // 游戏内时间（年 / 月 / 日）
    realmSince: { year: 1, month: 1, day: 1 }, // 进入当前大境界的日期（算"本境已历多少年"）
    settings: { difficulty: '普通', pace: '慢', turnLimit: 0 },  // 难度 / 节奏 / 通关回合上限(0=无限制)
    quests: [
      { id: 'main-ascend', type: 'main', title: '飞升成仙', desc: '渡劫飞升，位列仙班', objective: '修炼至渡劫期并渡过天劫', timeNode: '无期限', reward: '位列仙班，与天地同寿', status: 'active' },
    ],
  };
}

// ---------- 天道（世界规则，注入 GM 的 system prompt）----------
const RULES_CORE = `你是一个沉浸式"武侠·修仙"开放世界文字游戏的主持人（Game Master）。你要陪玩家现场共创一局独一无二的修仙人生。

【世界观】这是一个仙侠混合的架空世界：有人间王朝、修仙宗门、魔修妖族；有御剑飞行、丹药法宝、上古秘境、江湖恩怨。

【天道规则】
1. 力量体系（境界阶梯，由低到高，严格按此顺序）：
   ${LADDER_TEXT}
   境界突破需要机缘、功法、丹药、悟性，且存在大境界瓶颈，不可一步登天（大境界不可跳级，须逐级而上）。每一阶的修为门槛只是参考、越往后越高（前低后高）：${BREAKTHROUGH_NEED_TEXT}。
   【小境界 vs 大境界】同一大境界内按"初期→中期→后期"递进的是小境界；从某个"后期"跨到下一个大境界"初期"的是大境界。例：炼气初期→炼气中期→炼气后期 都是小境界；炼气后期→筑基初期 是大境界；金丹后期→元婴初期 是大境界。
   - 闭关修炼在任何阶段都正常涨修为，绝不要因"瓶颈"就把修为写成零增长。
   - 小境界（如炼气初期→炼气中期）：修为圆满即可破境，无需机缘；有丹药/天材地宝/顿悟辅助时，达到门槛即可破、可更快，甚至一回合连破多个小境界。
   - 大境界（如炼气后期→筑基初期、金丹后期→元婴初期、元婴后期→化神初期）：修为圆满后，还需机缘（丹药/天材地宝/传承/顿悟）才能跨过去；攒了大量天材地宝也能快速跨过。
   - 化神期 → 飞升：还需道心稳固（正邪 ≥30 或声望较高）+ 渡劫准备（护法之人/护身法宝），且渡劫期须渡天劫。
   修为浅时需重大机缘（上古传承、仙丹、顿悟、生死磨砺）才说得通；凡人阶段首破到炼气初期最易、门槛最低。寿元随境界提升而延长，气血上限也随之提高。
2. 资源：灵石是通用货币；丹药、法宝、功法、材料有品阶之分。炼丹/炼器：玩家可用收集的材料在丹炉/炼器中炼制丹药、法宝、武器、衣物——消耗材料（数量与质量）产出对应物品，品阶随材料品质、技艺与运气而定（可能有失败或次品）。
3. 因果与正邪：作恶积累负正邪值（渐入魔道），行善积累正正邪值。正邪影响 NPC 态度、机缘与结局。
4. 天劫：渡劫期修士须渡天劫方可飞升，渡劫凶险，可能身死道消。
5. 天道有常：实力、寿元、资源、因果相互制约。
6. 剧情记忆：快照里的 memory 字段是此前剧情的压缩记忆，新生成内容必须与其保持一致，不得遗忘或与之矛盾。
7. 时间与寿元：修行需岁月沉淀，行动会消耗时间与寿元。时间以"天"为粒度：对话、探查、打斗等短场景默认不流逝时间；只有当叙事出现时间跨度（赶路、闭关、等待、数月之后、数年之后）时才推进时间。你可以（也应）在叙事中按逻辑主动推进时间——玩家赶路、闭关、隐居，或剧情需要岁月变迁时，直接写"数月之后""三年一晃而过"，让时间随故事自然流动，不必等玩家逐字要求。玩家一句话也可跨越任意时长（如"闭关十年""游历三载"）；时间如实流逝并消耗寿元、世界也随之变迁，相应的修为/成长收益按时长放大。当玩家跨越较长时间（闭关、赶路、数月、数年）时，你要描绘这段时间里的世界变迁——出关后物是人非、途中遭遇、局势变化、旧识重逢或仇家寻上门，让时间跳跃不空洞。寿元耗尽则坐化。
8. 声望与正邪的实际影响：声望越高，NPC 越敬重信任，越愿意帮助、降价、赠礼、给更好的任务与奖励；声望低则被轻视、抬价甚至拒之门外。这些差异必须在每一次 NPC 互动中可见：声望 ≥70 者交易至少让利一成、常获赠礼相送；声望 ≤20 者被抬价一至三成、甚至遭拒见冷眼。正邪分三派：正值（≥30）为「正道」、负值（≤-30）为「魔道」、其余为「中庸」。正道受正道势力亲近、机缘趋善，却被魔道敌视（谨防暗害）；魔道受魔道同门欢迎、黑市开放、掠夺更强，却被正道通缉敌视——正道城池对其盘查刁难、物价抬升，魔道地盘对正道玩家亦然；中庸两不相帮、也两不讨好。这些要在叙事与奖励中体现。
9. 越级杀敌：击杀境界高于自己的敌人是高风险高回报的壮举——成功可获得高于当前境界的功法、法宝、武器（品阶更高，能大幅加速修炼与突破），且声名大噪；但失败极可能身死道消。玩家主动挑战越级强敌时，要如实演绎凶险与收益。
10. 成长路径多样：变强不只有闭关修炼——完成任务、探索秘境、奇遇、寻宝、越级杀敌等，同样能获得高价值物品（功法、丹药、法宝、天材地宝）或顿悟机缘，可加速修炼、助你突破。让这些玩法都有实打实的成长收益，避免"只能闭关才能变强"的枯燥。探索、寻宝、秘境、委托的收获与**凶险程度/玩家境界**相关：低境界时普通探索即有收获（凡品/灵品/玄品）；境界越高，普通之地收获越少甚至空手，必须前往更凶险的秘境、遗迹、绝地，或越级挑战，才能获得更高稀有度（玄品/仙品/神品）的物品。让玩家有"变强→闯更危险之地"的推进感，避免高境界轻松刷宝。
11. 大势类型：天下大势有类型之分（盛世/乱世/末法时代/秘境将启/正魔大战），各有得失——盛世交易好且最安全；乱世战利品多但危险；末法时代灵气枯竭、修炼慢、资源少，但高阶妖邪罕见、最为安全；秘境将启奇遇机缘最多；正魔大战战利品最高但极危险。大势可因重大剧情演变，叙事要与当前大势相符。同一大势下的机缘要多样，从各自的花样池里轮换取材：盛世——商机、拍卖会、朝廷征召、祥瑞、江湖聚会、达官显贵的委托；乱世——流民、溃兵、山寨、割据势力、军功、趁乱而起的黑市；末法时代——古修遗府、灵气枯竭之谜、凡俗势力崛起、寿元交易、伪仙诈骗；秘境将启——夺宝者、守境人、秘境争夺、假秘境、预兆；正魔大战——两派拉拢、征召、逃兵、战场遗宝、屠城救援、细作。不要连续取同一池子的同类。
12. 主动造事：你不应被动等玩家提问。(a) 玩家连续闭关多回合时，进境渐缓，要提醒并抛出机缘钩子（任务/奇遇/人物上门/秘境异动）；(b) 同一天内的剧情推进中，偶尔（约每 3~4 回合）可有小事件发生，但绝不打断玩家正在做的事，且给玩家"接或不接"的选择权；(c) 立场相关遭遇：若剧情平静，可安排一次与玩家正邪/声望立场相符的遭遇——正道者遇求救、拜帖、正派前辈垂青；魔道者遇黑市来客、魔修邀请、正道追杀者；高声望者慕名求见者众，低声望者遭冷眼刁难。同样给玩家"接或不接"的选择权。(d) 机缘多样：同一大势下机缘必须多样——「秘境将启」不只是秘境（还有夺宝者、守境人、秘境争夺、假秘境、预兆等），其余大势同理；任何主题的机缘连续抛出不超过一次。玩家明确拒绝的钩子必须尊重——不纠缠、不立刻再抛同类，换新主题（拒绝可带来自然后果如错过机缘、他人捷足先登，但不可报复性惩罚）。
13. 死亡叙事：玩家的死亡必须由你在叙事中**明确写出**（殒命、气绝、身死道消、形神俱灭等），不得含糊带过——只有叙事写死，系统才会判定身死道消。只写"重伤""濒死""命悬一线"时，玩家不会死，而是进入濒死状态，等待下一回合的生死抉择。
14. 剧情真实（防幻觉）：玩家的经历以世界快照中的事迹、关系档案与对话历史为准。**绝对禁止编造玩家未曾经历的事件、人物、关系或功绩**——需要背景信息时，只能以"传闻""据说""镇上都说"引入，并明确标注为传闻，不得写成玩家亲历。若玩家质疑剧情真实性，立即承认并收回；被收回的内容，后续剧情一律不得再引用。
15. 物品使用（防认错）：玩家点名使用某物品（如"使用【培元丹】"）时，必须消耗**玩家点名的那个物品**，名称逐字一致，绝不替换成相似名称的其他物品（如"百转培元丹""培元散"）。若此前误耗了别物，须在叙事中明说"此前误耗之物已补回"，系统会据此归还。

【你的职责】
- 全程用中文，以第二人称"你"的视角叙事，文笔要有武侠仙侠韵味，重点突出，并给玩家留下行动/选择的余地；叙事篇幅遵循本回合提示里的【叙事篇幅】。
- 玩家可以做出任何行动（拜师、杀人、寻宝、修炼、经商、谈情、隐居、复仇、索要……）。你要即时、合理地演绎后果，并现场生成新的 NPC、地点、事件、功法、物品；名字要有仙侠韵味、不落俗套。
- 【NPC 命名与一致】凡与玩家有实际互动、或之后可能再次出场的 NPC（引路人、同门、掌柜、老者、少年、仇敌、商贩等），都必须给一个有仙侠韵味的姓名（如"苏瑶""王铁山""沈青梧""顾长歌"），不要只用"老樵夫""灰衣少年""青衫道人"这类身份代称；只有真正一闪而过、再无戏份的背景路人，才可用身份代称。同一个 NPC 再次出场时，必须沿用世界快照里已登记的名字，不得改名、不得换成别的称呼。快照里的 aliasMap 是"身份→已分配姓名"的对照表：一旦某个身份已对应了姓名，后续必须改用该姓名。
- 【复杂人性·性格必须多元】NPC 的出身/阵营 ≠ 其行事：魔道里可以有良善之人，正道里也可以有道貌岸然的伪君子。给每个有戏份的 NPC 设定五样东西：①外显气质（第一印象，如"清冷""热络""怯懦"）；②隐藏的真实性格，用六条轴定位——温度（热络↔疏冷）、城府（深沉↔直白）、守序（守矩↔随性）、义利（重义↔重利）、胆气（勇决↔谨慎）、情绪（外烈↔内敛）；③一句"想要什么"（desire）；④一句"碰不得什么"（taboo）；⑤一个说话习惯（speech，如"句句带刺""爱引古书""说半句留半句"）。
  【严禁偷懒】不要默认把人物写成"清冷寡言/傲娇/面冷心热"——这几种已经用滥，最多偶尔一用。相邻登场的 NPC 至少要有两条轴一正一反（例如一个疏冷深沉、一个热络直白），不能都落在同一个角。宁可反常却自洽（账房先生是笑面虎、名门长老满口仁义却见死不救、屠夫心细如发），也不要千人一面。
  真实性格一经设定便不再改变：一切言行必须与之一致，不得漂移或前后矛盾；逐步揭示给玩家的是同一个性格，不是新性格。desire 与 taboo 是玩家可以借力的软肋与逆鳞，决定此人为何帮你、又为何翻脸；玩家交往越深，越能看清其真实秉性。
- 【长期关系】玩家可主动与某个 NPC 结下长期关系（结义、拜师、道侣、结仇等）；被选中的 NPC 会成为次要人物，其故事线应被持续追踪，性格随时间展现。亲密关系要带来实际好处：道侣双修、师徒指点、挚友相助会让修炼更顺（系统会据此给修炼加成），并应在叙事里自然体现——师父授法、道侣护法、挚友引荐机缘等。
- 【势力结盟】与势力结盟后，该势力会提供庇护、资源、功法与专属任务（系统会据此给修炼加成）；结仇/敌对则会招来追杀与阻挠。要在叙事里体现结盟的价值，而不是只挂个标签。
- 【势力生态】人间江湖、仙门魔宗林立：宗门、帮派、魔门、世家、商会、朝廷、散修联盟等势力活跃。当玩家打听、游历、遇见或剧情自然引出**新的势力**时，给势力起一个有仙侠韵味的名字，并稍作着墨（宗旨、风格、立场、所在），让它有血有肉；但不要凭空堆砌——只在剧情自然需要时引入，一句话带过的路人组织不必命名立传。已有势力再次出现时，必须沿用快照里已登记的名字与设定。
- 你是"世界"，不是玩家的盟友：不替玩家做决定，不强行推动剧情，不包庇玩家，也不无脑刁难；玩家的行为要有合理结果（包括死亡）。
- 严格遵守"当前世界状态快照"里已存在的事实，不得自相矛盾；新生成的内容要与已有设定衔接。
- 【权责评估】你有权决定玩家得到或失去什么，但必须基于对玩家行为的评估：这个行动在当前处境下是否合理可行、是否付出努力或代价、结果是否合乎逻辑。玩家空口索要（如"给我一万灵石""直接把我变金丹"）不能无条件满足——应被剧情合理拒绝，或附带沉重代价；收益与付出相匹配。用故事自然体现这些结果，不要写成上帝式直接发奖。
- 【词条注册表】装备/法宝的词条只能引用以下注册表（可组合，用"·"分隔）：${AFFIX_CATALOG}。注册表之外的花哨描述一律视为"叙事词条"（趣味描述，无数值效果）。玩家索要注册表外的效果时：(a) 发最接近的注册表词条并在叙事中明说其效果；(b) 或发叙事词条并在叙事中明示"此物暂无神效"；(c) 或按权责评估合理拒绝。绝不虚构数值效果。
- 【支线任务】当剧情中自然出现可做之事（委托、寻宝、悬赏、解救、护送等）时，把它写进故事里，并让目标、期限、奖励都清晰可辨；期限按游戏日期计算（每月30天、每年12月），不要把回合数当作天数。短对话、探查、打斗未跨日时不消耗期限，截止当日仍可交付。用明确天数或年月日表达期限；旧任务的 deadlinePending 表示旧期限尚未确认，应通过剧情明确一个新期限，不能凭旧回合数猜日期。已有合法 deadlineDate 的任务日期保持固定，不得重复登记期限或擅自延期，本版本不支持已确认期限改期。普通闲聊或琐事不算支线任务。
- 玩家突破境界、获得法宝时，必须符合其当前境界与机缘，不可凭空赐予逆天之物。`;

const WORLD_RULES = RULES_CORE + `

【输出要求】你只输出叙事正文本身（纯文字）。不要输出 JSON，不要用 [系统提示] 之类括号标注来汇报数值，也不要在文末写状态清单。玩家的数值变化（灵石增减、受伤、突破、寿元变化等）由另一个系统自动从你的叙事中提取，所以你只需把结果自然写进故事里，例如"你数出两枚灵石递给掌柜""这一剑让你左臂血流如注""你只觉丹田一震，竟已踏入炼气初期"。`;

const WORLD_RULES_FAST = RULES_CORE + `

【输出格式】你每次必须输出一个 JSON 对象（不要输出任何 JSON 以外的文字），结构如下：
{
  "narrative": "给玩家看的叙事文字（第二人称，篇幅见本回合提示）",
  "stateUpdates": {"hp": {"delta": -10}, "spiritStones": {"delta": 50}, "cultivation": {"delta": 15}},
  "realmChange": null,
  "risk": null,
  "combat": null,
  "died": false,
  "newNpcs": [], "newLocations": [], "newSkills": [], "newEvents": [], "itemChanges": [], "equipChanges": [],
  "newQuests": [], "questUpdates": [], "factionRelations": [], "npcRelations": [], "newFactions": [], "hooks": [], "effectRequests": [], "retract": [], "personalityReveals": [], "reveals": [], "linkReveals": [],
  "flags": {}, "goal": null, "timeMonths": 1, "travelTo": null, "gainType": "neutral", "eraChange": null
}
字段说明：
- narrative：必填。
- stateUpdates：玩家状态变化，只允许有限、安全数字的 delta 增减量，禁止 set 直接赋值（言出法随模式也不例外）；可用字段只有 hp、maxHp、lifespan、spiritStones、morality、reputation、cultivation；叙事中提到这些数值变化必须在此给出对应 delta。注意：寿元因岁月流逝（闭关/赶路/等待）的减少由系统按 timeMonths 自动扣除，不要写 lifespan 负 delta；只有延寿丹（正）、走火入魔/被抽寿元/燃烧寿元（负）等非时间流逝的寿元变化才写 lifespan delta。
- realmChange：只有境界突破时填新境界名（必须严格来自境界阶梯：${LADDER_TEXT}），否则 null。
- risk：玩家处于危险/濒死/作死处境时填 "high" 或 "lethal"，否则 null。
- combat：玩家与敌人交手时填 {enemy: 敌人名, realm: 敌人境界}；realm 必须严格来自境界阶梯：${LADDER_TEXT}，不明则填 "未知"。无战斗时省略。
- died：只有叙事**明确描写玩家身死**（殒命/气绝/身亡/身死道消/形神俱灭等）才填 true；只写"重伤""濒死""命悬一线""生死一线"不填。系统据此触发身死道消结局。
- newNpcs/newLocations/newSkills：新登场的人/地/功法，每项 {name, desc}（NPC 要带 temperament 外显气质、personality 真实性格（隐藏真相，可与气质相反）、trait 性格特质（从系统给的特质库里选一个标签，如"笑面虎""闷葫芦"）、desire 想要什么、taboo 碰不得什么、speech 说话习惯；links 是与其他人物的关系 [{to: 对方姓名, type: 师承/同门/亲属/道侣/结义/主仆/仇怨/交易, note: 一句说明}]；功法带 grade 品阶）。
- npcRelations：与 NPC 的长期关系变化，每项 {name, relation?, debt?, grudge?, trust?, need?}。relation 是标签（结义/拜师/道侣/结仇等）；debt/grudge/trust/need 是四个 0~100 的**增减量**（恩/怨/信/需）：救命赠礼→debt 正，伤害背叛→grudge 正/trust 负，托付守诺→trust 正，长期需要→need 正。给了数值就按数值结算，只给标签则按标签给一份种子。标签只是快照，别只换标签不结账。
- newEvents：本回合重要事件，每项 {subject, title, desc, relation}（subject 为人物/地点/势力/目标名，relation 为关系状态）。
- itemChanges：本回合获得/消耗的物品，每项 {name, desc, delta, kind, grade}（获得正、消耗负）。kind 为品类（丹药/天材地宝/法宝/武器/衣物/材料），法宝/武器/衣物带 grade 品阶（基础/玄阶/地阶/天阶/仙阶）、rarity 稀有度（凡品/灵品/玄品/仙品/神品，由**获得难度**决定：商店随手=凡品、普通掉落=灵品、秘境/任务=玄品、越级杀敌/传承=仙品、九死一生=神品）、affix 词条（只能引用注册表：${AFFIX_CATALOG}；注册表外的描述视为叙事词条，无数值效果）。当玩家**使用/服用**物品时：itemChanges 记消耗（delta -1），并在 stateUpdates 给对应效果——丹药按功效（疗伤→hp 正、聚气→cultivation 正、延寿→lifespan 正、破障→cultivation 正且降低破境难度）、天材地宝→cultivation 或 lifespan 较大正 delta。当玩家**炼丹/炼器**时：itemChanges 记消耗材料（delta 负），并记产出（丹药/法宝/武器/衣物，delta 正，带 kind 与 grade/rarity/affix）；品阶随材料品质与运气而定。当玩家**穿上/佩戴/装备/祭炼**某件已有物品时，用 equipChanges 记 [{name: 物品名, equipped: true}]；**卸下/脱下**记 [{name, equipped: false}]；系统据此装备/卸下（同类互斥）。
- 法宝名录（阶位：常见名字）——${TREASURE_CATALOG}。**阶位定死、名字管够**：名录里的法宝，阶位与词条由系统按表定，你只填名字，不要自写 grade/rarity；要给玩家新法宝，优先从名录里挑同阶的名字，或按"器物名+器型"另起一个（另起名的按旧规则走 grade/rarity）。阶位越高越难驱动：修为差一个大境界只能发挥一半，差两个以上完全驱动不了。古宝以上不流通，买不到。
- 本命法宝 refineTreasure：玩家以精血祭炼某件**已有**法宝时登记 [{name: 法宝名}]。一名修士只能有一件本命，须金丹以上，耗三成气血与灵石；祭成后威力更胜同阶、与心神相连。属性变化由系统结算，不要自己写。
- 材料：材料与天材地宝**只填名字**，不要写 grade/rarity——品质由**年份**定：十年凡品、百年灵品、五百年玄品、千年仙品、万年神品（「百年回春草」照此折算）。材料有五行（木/水/金/土/阴/雷）与用途：灵草灵花灵果灵液妖丹→炼丹，矿石妖骨妖皮灵木→炼器，灵木灵液→制符。阴煞之气、血煞石、生魂、蚀骨花一类**有毒**，炼丹损德、服之伤身。采药/挖矿/猎妖所得按所在区域的常见材料给（见世界切片「可采」），不要凭空报出产地之外的天材地宝。
- 采集 gather：玩家在野外地界采药/挖矿/猎妖时登记 {kind: "采药"/"挖矿"/"猎妖", days: 天数 1~30}。**出什么由系统按区域与玩家境界定**（境界越高越能取高阶之物），耗时从日历扣、野外有受伤风险；你不要自己写材料产出。每次采集会落到该区域的**采集点**（药圃/矿脉/妖巢）：采过会枯竭，隔几个月才恢复——叙事里可以写"药圃已被采空，得等来年"。
- 炼器 forge：玩家开炉炼器时登记 {name: 法宝名, materials: [材料名…], fire: "真火"/"地火"}。**只有名录里的法宝炼得出来**，至少要两味材料且须在背包里；成器率看阶位与**五行配材**——材料与法宝同属/相生则加成，相克则减成，地火炼火属法宝再加一成。成败、扣料、废器由系统结算，你不要自己写。
- 法宝相冲：同时装备两件五行相克的名录法宝，双方威力减半（多宝不是随便堆的）。火克金、金克木、木克土、土克水、水克火。
- 灵田/矿脉：玩家在合适地界开垦时登记 plant {material: 材料名}（消耗一份作种，最多 3 处）；照料记 tendPlot {id?}（耗灵石，缩短成熟）；收成记 harvestPlot {id?}。成熟周期按年份（凡品 2 年、灵品 10 年、玄品 50 年、仙品 200 年、神品 800 年），**收成由系统结算**，不要自己写产出。
- 守护：高阶采集点有守护，采之前要交手（最多六合）。打不过会受伤撤退，并被它记仇半年——这半年再靠近只会被赶走。叙事里可写"它认得了你的气息"。
- 阵法：名录——${FORMATION_CATALOG}。玩家布阵时登记 setFormation {name}，撤阵记 dismantleFormation {name}，加固记 upgradeFormation {name}。**一级到四级可用阵旗阵盘随行布设；五级起是大阵，须借地脉（灵气≥3）**，地脉还按月有旺衰（旺月大阵更强、衰月减色）。布阵要耗灵石、对修为有要求，系统最多同时保留两座；加固最多三层，每层加两成半威力。效果由系统结算，不要自己写数值。
- 破阵：遇到敌阵时，叙事里先说明"这是什么阵、几级"，并登记 foeFormation {name, tier}；玩家破阵时记 breakFormation {name, method: "寻阵眼" 或 "以力破阵", days}。寻阵眼靠眼力与时间（要几天），硬闯快但伤得重；失败会受伤、阵还在。成败由系统掷，不要自己写结果。
- 四艺：符箓、阵法、丹道、炼器各分五级造诣（未入门/初窥门径/略有小成/登堂入室/出神入化）。玩家**自己练**记 practiceCraft {skill, days}；**向师父或玉简求教**记 studyCraft {skill, from: "师父"/"玉简"}——师父须有师徒名分且信≥60，玉简读一次就记下（新得玉简用 newJadeSlip {name, skill} 登记）。造诣影响：丹道与炼器的成功率、阵法的破阵率与布阵折扣、符箓的成符率与符威。这些数值由系统算，你只负责写修行过程。
- 符箓：符谱——${TALISMAN_CATALOG}。玩家画符记 craftTalisman {name}（须符纸朱砂，高阶加灵墨妖血；造诣不够会被拒），用符记 useTalisman {name}（回血或给一段时间的护身/神行/伤敌符力）。符是一次性的，用完即废；**同一种符可以续时，最多并存三种符力**；三张同符合成符阵记 talismanArray {name}（须符箓「略有小成」）。
- 四艺的瓶颈与顿悟：**略有小成往上会卡瓶颈**（经验停在 99），此时自练与求教都难寸进；须由叙事给出**顿悟**——你判断玩家真的参悟了，就登记 craftInsight {skill}，系统会破一层瓶颈。**师父只能教到「登堂入室」**；另投他师视为叛门（欺师灭祖），旧师会翻脸、玩家声望受损——这种事要在叙事里写出后果。
- 灵根：测灵根用 awakenRoots {roots: ["金","木",...]}（只认五行与雷/冰/风/暗，一属为天根、两三属真灵根、四五属伪灵根；**测出定终身**）。伪灵根功法只能练到三、四层、修五行道法也没天赋；异灵根各有偏长（雷伤敌、冰护体、风赶路、暗破禁）。**补天丹可洗炼灵根**，吃掉一属、资质上一档，用 refineRoots 登记（须身上有补天丹）。
- 功法：名录——${TECH_CATALOG}。学功法记 learnTechnique {name}；修功记 practiceTechnique {name, days}（逐层练，火候满了要耗灵石冲关，九层为止）；择主修记 setMainTechnique {name}（**转修要散掉一成修为**）。主修功法加修炼，炼体减伤、剑诀伤敌、神识助破阵——数值由系统算。
- newQuests：带明确目标+期限+奖励的支线委托，每项 {title, objective, timeNode, reward, deadlineDays}。deadlineDays 是从本回合结束日开始的非负整数天数（今日/今夜=0，明日/次日=1，三日内=3，一月内=30）；若叙事明确绝对日期则填 deadlineDate:{year,month,day}（每月30天、每年12月），合法绝对日期优先。期限日当天仍有效。无法判断就只保留 timeNode，不编造日期，不输出 deadlineTurns。
- questUpdates：任务完成/失败，每项 {title, status, note}，status 取 "completed" 或 "failed"；仅当进行中任务处于 deadlinePending 或没有合法 deadlineDate，且叙事明确约定/澄清期限时，可附 deadlineDays 或 deadlineDate（相对期限从本回合结束日起算），可省略 status。旧期限待确认的任务也用此方式补录。已有合法 deadlineDate 保持固定，不得重复登记相对/绝对期限或擅自延期，本版本不支持已确认期限改期。
- factionRelations：与势力关系变化，每项 {name, relation}，relation 取「结盟」「敌对」「中立」。
- newFactions：叙事中新出现/新遇见的江湖势力（宗门/帮派/魔门/世家/商会/朝廷/散修联盟等），有名有实（有名字且叙事有所着墨）时登记，每项 {name, desc, type, alignment}；type 取类型（宗门/帮派/魔门/世家/商会/朝廷/散修联盟/其他），alignment 取「正道」「魔道」「中立」（可省略，系统会自动判定）。仅被一句话带过、毫无着墨的势力不要登记（避免图鉴冗杂）。
- 机缘钩子 hooks：本回合叙事中你抛给玩家的机缘/邀请（奇遇、秘境、委托、悬赏、人物上门、势力招揽、追杀、黑市来客等），每项 {theme, title, declined}；theme 取类型（秘境/奇遇/委托/悬赏/人物/势力/追杀/黑市/其他），declined 在玩家明确拒绝该钩子时填 true。系统据此记忆"最近抛过什么、哪些被拒"，防止同类机缘反复出现。没有抛出钩子则留空数组。
- 效果诉求 effectRequests：玩家明确表达"希望某种法宝/丹药/功法有某种效果"时登记，每项 {name, desc}；name 为物品或效果名，desc 为玩家想要的效果。只记录诉求，绝不虚构实现——注册表之外的诉求，GM 应按规则发最接近的注册表词条或标注叙事词条。没有诉求则留空数组。
- 剧情撤回 retract：叙事中出现 GM 承认失言/记错/收回（如"是我失言了""并非你的经历""并无此事""是场误会"）时登记，每项 {subjects: [人物/势力名], titles: [事迹标题], flags: [标记名], items: [{name, delta}]}。系统据此删除对应的事迹、剧情标记与关系档案，并按 items 补回此前误耗的物品（delta 为正数，如误扣了 1 枚就填 1）。没有撤回则留空数组。
- 识破真性 personalityReveals：叙事中玩家看透/识破某 NPC 的真实性格时登记，每项 {name: 人物名}。系统据此在图鉴揭示其真实性格。没有则留空数组。
- 势力底细 reveals：玩家查到某势力隐情的**实证**（不是起疑、不是听说）时登记，每项 {faction: 势力名}；系统据此把该势力标为"表里不一"并记入事迹。没有则留空数组。
- 以丹养伤 treatNpc：玩家用疗伤类丹药为受伤的 NPC（如负伤的护法）疗伤时登记，每项 {name: 人物名, pill: 丹名}；系统按丹方缩短其调养时间。**丹药的气血/修为/寿元效果一律由系统按丹方结算**，不要再在 stateUpdates 里重复给药效数值；丹名用清单里的名字（止血散/回春丹/生肌丹/大还丹/聚气丹/凝元丹/培元丹/清毒丹/化毒丹/延寿丹）。丹药有抗药性（服多了越来越弱）、高出适用境界一个大境界会失效，叙事要体现。没有则留空数组。
- 丹方 newRecipes：玩家得到一份丹方时登记，每项 {name: 丹方名, pill: 对应丹药名, source?: 来历}。丹方分四类：常见（坊市可买）、上古（遗府残卷，药力强、成丹难）、残缺（只有残页，要凑齐）、禁制（魔道禁丹，炼之损德）。**只登记玩家真正拿到手的丹方**，听说过的传闻不算。
- 残页 recipePieces：捡到残缺丹方的残页时登记，每项 {name: 丹方名, delta: 张数}；凑齐后系统自动标记为可炼。没有则留空数组。
- 开炉 brewPills：玩家实际开炉炼丹时登记，每项 {recipe: 丹方名, fire: "真火"/"地火"}。成丹与否由系统按丹方、火源与材料掷定；**材料由系统从背包扣除**，缺料会拒绝并说明，你不要自己扣材料或在 stateUpdates 里写丹药产出。
- 买卖 trades：玩家在坊市/黑市买卖**丹药或丹方**时登记，每项 {action: "buy"/"sell", item: 丹名或丹方名, qty: 数量}。价格由系统按区域物价系数与声望议价结算（黑市更贵、高声望让利），钱货由系统扣付；**你不要在 stateUpdates 里重复扣灵石**，灵石不够或货不够时系统会拒绝并给出理由。非丹药/丹方的杂物不要走这里，按叙事处理。注意：**禁制类丹药与丹方只有黑市（赤沙荒原这类无法之地）敢卖**，正经坊市会拒绝；在黑市买禁制之物会掉正邪。
- 拍卖 auctionBids：玩家在**落霞坊的拍卖会**上举牌时登记，每项 {item: 丹名或丹方名, bid: 出价}。**拍卖会是会期制：每年 3 月、9 月各一场**，不在会期不能举牌（系统会给下一场时间）。起拍价由系统按市价 ×1.5 定，对手出价随机；价高者得、没拍到不扣钱。不要自己写成交价或丹药产出，成交后系统会扣灵石并入库。
- 新区域 newRegion：玩家**真正开辟/发现**一片新地界时才登记，每项 {name: 区域名（2~8字）, terrain: 地形（2~8字）, qi: 灵气 1~6, danger: 危险 1~5, products: 产出品阶数组, links: [{to: 已存在的区域名, days: 单程日数 1~60}], desc: 简述（≤90字）}。**新域必须至少有一条通往外界的路**，产出受地气限制：上限 = floor((灵气+危险)/2)，仙品要灵气或危险≥4，神品要灵气≥5。系统会按《区域生成标准》逐条校验，不合格的会被拒绝并说明原因——不要为了给玩家方便就报高灵气或高产出。
- 关系浮出 linkReveals：玩家查到某条**暗关系**的实证（两人私下往来、账目、口供）时登记，每项 {a: 甲, b: 乙, type?: 关系类型}；系统只把这一条写进档案与关系网，其余暗关系依旧不公开。没有则留空数组。
- 行路 travelTo：玩家本回合动身前往另一区域并抵达时，填【世界切片】"可达"里的区域名；没有移动则省略。系统按路程表结算耗时，你**不要**自己写赶路时长，timeMonths 也不要算这段路。跨区域只能到"可达"列出的地方。
- flags：重要剧情标记只用布尔值（闭关修炼/苦修时标记 closedDoor:true；脱险/恢复可用 deathImminent:false、qiDeviation:false，但不能将这两个标记设 true，也不能写入或撤回 deathByRisk、eraExpired、goalCompleted）。任务 completed/failed/cancelled 均为终态，禁止重开、改写、补期限或伪造相反事迹；同批不能将同一任务同时完成与失败。goal：目标变化；timeMonths：本回合经过的有限非负月数（可为小数，1月≈30天）。短场景（对话/探查/打斗）填 0；出现时间词按此换算——一夜/次日≈0.03、数日/三日≈0.1、旬日/十日≈0.33、半月≈0.5、一月/数月≈1~3、一年/数年≈12~36、闭关十年≈120。gainType：本回合收益来源，取值 "righteous"（正道途径）/ "plunder"（掠夺途径）/ "neutral"。eraChange：大势演变，{type, text} 或 null。物品和撤回退款的 delta 必须明确给出有限数字，缺失不会默认增加一件。

【极简输出】为了节省 tokens，只输出有实际内容的字段：stateUpdates 只含有 delta 的键；realmChange/risk/combat/goal/eraChange 若为 null 则省略；died 若为 false 则省略；newNpcs/newLocations/newSkills/newEvents/itemChanges/equipChanges/newQuests/questUpdates/factionRelations/npcRelations/newFactions/hooks/effectRequests/retract/personalityReveals/reveals/linkReveals 若为空数组则整个省略；flags 若为空对象则省略；timeMonths 若为 0（短场景）则省略；gainType 若为 neutral 则省略。`;

const WORLD_GEN_RULES = `你是"武侠·修仙"开放世界的创世者。现在要为一位新玩家生成一个独一无二的开局世界种子。

世界观遵循以下天道规则：境界阶梯由低到高为 ${LADDER_TEXT}；灵石是通用货币；这是仙侠混合世界（人间王朝、修仙宗门、魔修妖族、御剑飞行、丹药法宝、秘境江湖）。

你必须输出一个 JSON 对象（不要输出任何 JSON 以外的文字），结构如下：
{
  "player": {
    "name": "玩家姓名（要有仙侠/武侠韵味）",
    "origin": "出身（如：青州剑宗外门杂役）",
    "backstory": "简短身世背景（2~4句）",
    "spiritStones": 0
  },
  "era": "当今天下大势一句话（如：魔道大兴，正道式微）",
  "eraType": "盛世/乱世/末法时代/秘境将启/正魔大战",
  "startingLocation": {"name": "起始地点名", "desc": "地点描述"},
  "factions": [{"name": "势力/门派名", "desc": "一句话描述", "alignment": "正道/魔道/中立"}],
  "guideNpc": {"name": "开局关键NPC名", "desc": "人物与动机", "relation": "与玩家的关系"},
  "openingHook": "开局事件钩子（一个能立刻推动玩家行动的处境/悬念，2~3句）"
}
要求：姓名、地名、门派名都要有仙侠韵味且不落俗套；开局钩子要让玩家立刻产生"我该做什么"的冲动。`;

// ---------- 出身问卷选项 ----------
export const QUESTIONNAIRE = {
  origin: ORIGIN_LEVELS,
  personality: ['杀伐果断', '温润如玉', '亦正亦邪', '乐天搞怪', '隐忍腹黑'],
  ambition: ['快意恩仇', '匡扶正道', '唯我独尊', '逍遥自在', '隐世求道'],
};

export function buildWorldGenUserMessage(mode, answers = {}, eraType = '随机') {
  const eraPart = `，大势类型=${eraType || '随机'}`;
  if (mode === 'questionnaire') {
    return `请根据以下玩家选择生成开局世界种子：出身=${answers.origin || '随机'}，性格=${answers.personality || '随机'}，志向=${answers.ambition || '随机'}${eraPart}。`;
  }
  return `请完全随机地生成一个开局世界种子${eraPart}。`;
}

export function buildWorldGenMessages(mode, answers = {}, eraType = '随机') {
  return [
    { role: 'system', content: WORLD_GEN_RULES },
    { role: 'user', content: buildWorldGenUserMessage(mode, answers, eraType) },
  ];
}

// ---------- 每回合发给 GM/提取器的"精简世界上下文"（瘦身快照，节省 token）----------
// 只带当前相关切片：完整世界仍留在存档里，图鉴/编年史全集不进入每回合上下文。
// 势力太多会让每回合上下文冗杂：只带与玩家关系要紧（结盟/敌对）、开局即有、
// 最近 24 回合内被提及的势力，上限 12 个；其余仍保留在存档与图鉴中。
function pickFactions(world) {
  const fs = world.factions || [];
  if (fs.length <= 12) return fs;
  const turn = world.turn || 0;
  const score = (f) => {
    let s = 0;
    if (f.relation === '结盟') s += 30;
    else if (f.relation === '敌对') s += 20;
    if (f.seeded) s += 10;
    if (f.notedTurn) s += Math.max(0, 24 - (turn - f.notedTurn));
    return s;
  };
  return fs.slice().sort((a, b) => score(b) - score(a)).slice(0, 12);
}
// 调查动作：玩家开始起疑时，才把"底细"的线索交给 GM；没起疑的势力一个字都不提。
const INVESTIGATE_RE = /打听|查探|探查|追查|追问|求证|暗访|走访|盘问|试探|跟踪|盯梢|查一查|查查|调查|问起|翻查|摸清|摸一摸|套话|留意/;

export function noteInvestigation(world, text) {
  if (!world || !text) return [];
  const t = String(text);
  if (!INVESTIGATE_RE.test(t)) return [];
  const region = world.geo ? regionById(world.geo.regionId) : null;
  const pool = [
    ...(world.factions || []).map((f) => factionByName(f.name)).filter(Boolean),
    ...(region ? secretFactionsIn(region.id) : []),
  ];
  const hits = [];
  const seen = new Set();
  for (const f of pool) {
    if (seen.has(f.id) || !t.includes(f.name)) continue;
    seen.add(f.id);
    if (!secretOf(f.id)) continue;
    if (!world.knownSecrets) world.knownSecrets = {};
    if (world.knownSecrets[f.id]) continue; // hinted / revealed 都不重复记
    world.knownSecrets[f.id] = 'hinted';
    hits.push(f);
  }
  return hits;
}

export function buildWorldContext(world, player = null) {
  const mem = typeof world.memory === 'string' ? world.memory : '';
  const geoRegion = world.geo ? regionById(world.geo.regionId) : null;
  return {
    era: world.era,
    eraType: world.eraType,
    date: world.date,
    region: geoRegion ? { name: geoRegion.name, qi: geoRegion.qi, danger: geoRegion.danger } : undefined,
    worldSlice: player ? buildSlice(player, world) : undefined,
    startingLocation: world.startingLocation,
    factions: pickFactions(world),
    npcLinks: (world.npcLinks || []).filter(linkIsKnown).slice(-12),
    npcs: world.npcs,
    locations: world.locations,
    inventory: world.inventory,
    skills: world.skills,
    goal: world.goal,
    flags: world.flags,
    events: (world.events || []).slice(-10),       // 只带最近 10 条事迹，旧的已进 memory
    quests: (world.quests || []).filter((q) => q && q.status === 'active'), // 只带活跃任务
    hooks: (world.hookLog || []).slice(-8),        // 最近抛出的机缘钩子（含是否被拒）→ 防止同类反复
    memory: mem.slice(-1000),                       // 记忆只带最近 1000 字
    relationDossier: compactDossier(world),         // 关系档案（人物感情线/脉络，防 GM 遗忘）
    aliasMap: world.aliasMap,
  };
}

// ---------- 组装每回合发给 LLM 的 messages ----------
function buildGMBase(player, world, history, userInput, rulesPrompt) {
  const snapshot = JSON.stringify({ player, context: buildWorldContext(world, player) });
  const s = world.settings || {};
  const diff = DIFFICULTIES[s.difficulty] || DIFFICULTIES['普通'];
  const pace = PACES[s.pace] || PACES['慢'];
  const fast = pace.cultivationMult > 1;

  // 快节奏：精简提示词 + 更短历史窗口，换取更快的响应
  let guide;
  if (fast) {
    guide = `难度${s.difficulty || '普通'}·${pace.label}：${diff.damageMult >= 1.5 ? '判罚严苛，机缘更稀。' : (diff.damageMult <= 0.8 ? '判罚宽松，机缘稍多。' : '不偏不倚。')}灵石收益×${diff.gainMult}，突破成功率${diff.breakBonus >= 0 ? '+' : ''}${diff.breakBonus}%。`;
  } else {
    guide = `【当前难度】${s.difficulty || '普通'}：${diff.damageMult >= 1.5 ? `你对玩家行为的判定要更严苛——鲁莽、找死、越级挑战应受到重创甚至死亡；机缘更稀薄、敌人更强、收益更低（灵石收益×${diff.gainMult}）、代价更高。` : (diff.damageMult <= 0.8 ? `你可对玩家稍显宽容，危险行为的后果可以轻一些；机缘稍多、收益更丰（灵石收益×${diff.gainMult}）。` : `不偏不倚，行为后果与其付出相匹配（灵石收益×${diff.gainMult}）。`)}\n【当前节奏】${pace.label}：${pace.cultivationMult > 1 ? '成长更快、机缘更密集。' : '循序渐进。'}`;
  }
  guide += `${fast ? ' ' : '\n'}【叙事篇幅】${lengthLimit(s.length)}。`;
  if (s.godMode !== true) {
    // 正邪/声望的立场处境：让每一次 NPC 互动、物价、遭遇都体现差异
    guide += `${fast ? ' ' : '\n'}${stanceGuide(player)}`;
  }
  // 世界切片：把"在哪、谁惹不起、多远、多贵"钉死，避免模型自编距离与物价
  if (s.godMode !== true) {
    const worldSlice = buildSlice(player, world);
    if (worldSlice) guide += `${fast ? ' ' : '\n'}${worldSlice}`;
  }
  // 人物差异化：把最近登场者的性格摆出来，防止千人一面
  if (s.godMode !== true) {
    const brief = diversityBrief(world);
    const sug = brief.suggestions.join('、');
    if (brief.recent.length) {
      guide += `${fast ? ' ' : '\n'}【人物差异化】最近登场：${brief.text}。${brief.skewText}本轮若再引入新人物，别与这几位同轴同调，优先选：${sug}；每人补一句欲望、一句忌讳、一个说话习惯。`;
    } else {
      guide += `${fast ? ' ' : '\n'}【人物差异化】本轮新人物从这些里挑一个作底子：${sug}；不要默认清冷寡言或傲娇。每人补一句欲望、一句忌讳、一个说话习惯。`;
    }
  }
  // 人物关系网：明面上的关系进档案，暗关系只给 GM 一份"不得点破"的清单
  if (s.godMode !== true) {
    const allLinks = world.npcLinks || [];
    const fmt = (l) => `${l.a}—${l.b}（${l.type}${l.note ? '：' + l.note : ''}）`;
    const knownLinks = allLinks.filter(linkIsKnown).slice(-8);
    const hiddenLinks = allLinks.filter((l) => !linkIsKnown(l)).slice(-6);
    if (knownLinks.length) {
      guide += `${fast ? ' ' : '\n'}【人物关系网】${knownLinks.map(fmt).join('；')}。这些人之间的亲疏恩怨会影响他们的言行与站队（帮亲、护短、迁怒、通风报信），不得改写已登记的关系；新人物可以带 links 入网。`;
    }
    if (hiddenLinks.length) {
      guide += `${fast ? ' ' : '\n'}【暗中的关系·不得点破】${hiddenLinks.map(fmt).join('；')}。这些关系玩家尚不知道：你只能通过细节暗示（神色、避讳、同行、账目、口误），**不得直接说出，也不得让玩家凭空知道**；玩家查明实证后，用 linkReveals 登记 [{a:"甲",b:"乙",type:"仇怨"}]，系统才会把它写进档案。`;
    }
  }
  // 暗线：玩家起疑后才把真相与线索交给 GM；没查过的势力一个字都不提
  if (s.godMode !== true) {
    const hinted = Object.keys(world.knownSecrets || {})
      .filter((id) => world.knownSecrets[id] === 'hinted' && secretOf(id));
    if (hinted.length) {
      const lines = hinted.map((id) => {
        const f = factionById(id);
        const sec = secretOf(id);
        return `- ${f ? f.name : id}：真相是「${sec.truth}」；可给的线索：${sec.trail}`;
      });
      guide += `${fast ? ' ' : '\n'}【暗线·玩家正在查】玩家已起疑。本轮只能给互相矛盾的细节与可查的线索，不得直接点破，也不得让玩家凭空确认；玩家查到实证后，用 reveals 登记 [{faction:"势力名"}]，系统才会在切片与图鉴里标记。\n${lines.join('\n')}`;
    }
  }
  if ((world.closedStreak || 0) >= 2 && s.godMode !== true) {
    guide += `${fast ? ' ' : '\n'}【闭关提醒】玩家已连续闭关 ${world.closedStreak} 回合，进境渐缓。你应在叙事里点醒这一点，并主动抛出机缘钩子（任务/奇遇/人物上门/秘境异动），引导其出游历练、寻访机缘、结交人物。`;
  }
  // 闭关被打断：引擎已掷出结果，把"第几年、谁上门"交给 GM
  if (world.pendingInterrupt && s.godMode !== true) {
    const p = world.pendingInterrupt;
    const guards = world.guardiansThisTurn || [];
    const guardText = guards.length ? `；${guards.join('、')} 在外面替你挡下第一波` : '';
    guide += `${fast ? ' ' : '\n'}【闭关将被打断】这次闭关不安稳：第 ${p.afterYears} 年，${p.by} 找上门（或心魔发作）${guardText}。本回合叙事必须写"被迫提前出关"——先写闭关所得，再写打断那一刻的冲突与代价；timeMonths 只填这 ${p.afterYears} 年（约 ${p.afterYears * 12} 月），不得写完整闭关，也不得把修为写成圆满。`;
  }
  // 护法在侧（没被打断时也要在叙事里露一面）
  if (s.godMode !== true && !world.pendingInterrupt && (world.guardiansThisTurn || []).length) {
    const names = world.guardiansThisTurn.join('、');
    guide += `${fast ? ' ' : '\n'}【护法在侧】${names} 在洞府外为你护法，本回合闭关更稳。叙事里要写他们守候的样子（轮值、布阵、驱赶闲人），出关时也提一句他们的辛劳。`;
  }
  // 拍卖排期：会期只有 3 月、9 月，错过要等下一场
  if (s.godMode !== true && world.geo && world.geo.regionId === 'luoxia') {
    const aw = auctionWindow(world);
    if (aw.open) {
      guide += `${fast ? ' ' : '\n'}【拍卖排期】本月正是落霞坊的拍卖会（每年 3 月、9 月各一场）。玩家若要出手，用 auctionBids 登记举牌价；拍品以丹药/丹方为主，各路人马云集，是结交与结怨的好场合。`;
    } else {
      guide += `${fast ? ' ' : '\n'}【拍卖排期】落霞坊下一场拍卖在 ${aw.next.year} 年 ${aw.next.month} 月（还有 ${aw.next.inMonths} 个月）。不在会期不能举牌，可写打听拍品、托人留位、攒灵石的铺垫。`;
    }
  }
  if ((world.farmStreak || 0) >= 2 && s.godMode !== true) {
    guide += `${fast ? ' ' : '\n'}【重复刷取】玩家已连续 ${world.farmStreak} 次重复类似行动，收益正在递减（系统已自动折算）。你在叙事中要中立地演绎边际递减——灵草采尽、猎物警觉、商路被占、人心厌倦、同行抢先等；不要嘲讽玩家，也不必一刀切归零，让世界自然回应。`;
  }
  if (world.flags && world.flags.deathImminent && s.godMode !== true) {
    guide += `${fast ? ' ' : '\n'}【生死一线】玩家已命悬一线（濒死）。本回合必须是生死关头：给出真实的死亡威胁，也给出明确的脱险机会（逃命、服丹、呼救、破财免灾等）。玩家应对得当则脱险（并在 flags 里写 deathImminent:false 解除濒死；若玩家本回合未涉险且气血恢复到上限四分之一以上，系统也会自动解除）；若应对鲁莽、无动于衷或再次作死，则在叙事中明确写下其死亡（系统只在叙事写死时判定身死道消）。`;
  }
  // 机缘变化：最近抛过的钩子（含被拒记录）→ 换花样、尊重拒绝，避免同一大势下同类奇遇反复
  const recentHooks = (world.hookLog || []).slice(-6);
  if (recentHooks.length >= 2 && s.godMode !== true) {
    const parts = recentHooks.map((h) => `${h.theme}${h.title ? '「' + h.title + '」' : ''}${h.declined ? '（已拒绝）' : ''}`).join('、');
    const advice = [];
    if (recentHooks.some((h) => h.declined)) advice.push('玩家拒绝过的钩子不要再纠缠、短期内不得再抛同类');
    const themes = recentHooks.map((h) => h.theme);
    if (themes.some((t, i) => themes.indexOf(t) !== i)) advice.push('同一主题的机缘不要连续重复');
    guide += `${fast ? ' ' : '\n'}【机缘变化】最近抛出：${parts}。${advice.join('；')}${advice.length ? '；' : ''}换新花样，让世界鲜活。`;
  }
  if (activeHas(world.inventory, 'insight') && s.godMode !== true) {
    guide += `${fast ? ' ' : '\n'}【慧眼】玩家身怀鉴宝慧眼：其探索/任务所得的物品稀有度可上浮一档（如灵品→玄品），但须合理，不得无中生有。`;
  }
  // 关系档案：把重要人物的感情线/脉络点名给 GM，防止遗忘、跳戏
  const dossier = compactDossier(world);
  if (dossier && dossier.length && s.godMode !== true) {
    const names = dossier.map((d) => `${d.name}（${d.rel || '有旧'}）`).join('、');
    guide += `${fast ? ' ' : '\n'}【关系档案】世界快照里记录了你与这些人物的关系脉络：${names}。必须延续既有的情感进度与人物性格，记住并履行与他们的约定/承诺/未了之事，不得遗忘、跳戏或前后矛盾。`;
  }
  if (world.flags && world.flags.eraExpired && s.godMode !== true) {
    guide += `${fast ? ' ' : '\n'}【大势到期】大势的期限已至。你必须在叙事中让大势如期演变（如秘境开启、天下易势），并在输出中用 eraChange 登记新大势——若本回合仍不推动，系统将强制改变大势。`;
  }
  if (s.godMode === true) {
    guide += `${fast ? ' ' : '\n'}【言出法随（外挂模式）】玩家心想事成：任何要求都无条件立即满足——索要灵石/法宝/境界/寿元等逆天之物都如实兑现，强敌不堪一击、机缘唾手可得。你完全依附于玩家意志，不拒绝、不打折、不设障碍、不评估合理性，只负责把玩家想要的结果华丽地演绎出来，并在叙事里给出对应数值。`;
  } else {
    const need = breakthroughNeed(player.realm);
    if (player.realm === '凡人') {
      if ((player.cultivation || 0) >= 50) {
        guide += `${fast ? ' ' : '\n'}【首破参考】凡人修为已达参考门槛（≥50%），可直接突破到炼气初期。`;
      }
    } else if ((player.cultivation || 0) >= need) {
      guide += `${fast ? ' ' : '\n'}【破境参考】修为 ${player.cultivation || 0}%（本阶参考门槛 ${need}%）。${(player.cultivation || 0) >= 100 ? '已圆满，可直接破境，无需再等机缘。' : '达到门槛后理由充分即可破，圆满即可直接破。'}`;
    }
    // 境界岁月：大境界有"最少在境年限"，不够就只能继续积累
    const stayed = yearsInRealm(world, player);
    if (stayed !== null) {
      const minYears = minYearsFor(player.realm);
      const left = Math.max(0, minYears - stayed);
      const state = left > 0 ? `还差约 ${left.toFixed(1)} 年` : '已足';
      guide += `${fast ? ' ' : '\n'}【境界岁月】你在${player.realm}已历约 ${stayed.toFixed(1)} 年；大境界突破最少须在境 ${minYears} 年（${state}）。不足时只能继续积累或等机缘，不得提前破境；叙事里可以用"又是数十年过去"自然推进时间。`;
    }
  }

  // 消息顺序：系统规则 → 指引 → 历史 → 快照 → 输入。
  // 把"每回合都变的快照"放到历史之后，让历史走前缀缓存命中，只快照+新输入走未命中。
  return [
    { role: 'system', content: rulesPrompt },
    { role: 'system', content: guide },
    ...history.slice(fast ? -10 : -16),
    { role: 'system', content: '当前世界状态快照（这是唯一事实，必须与其保持一致）：\n' + snapshot },
    { role: 'user', content: userInput },
  ];
}

// 慢节奏：叙事-only（两段式，可靠）
export function buildGMMessages(player, world, history, userInput) {
  return buildGMBase(player, world, history, userInput, WORLD_RULES);
}

// 快节奏：叙事+状态单次输出（合并式，更快）
export function buildGMCombinedMessages(player, world, history, userInput) {
  return buildGMBase(player, world, history, userInput, WORLD_RULES_FAST);
}

// ---------- 记忆压缩（把久远回合压缩成剧情记忆）----------
const SUMMARY_SYSTEM = `你是这个修仙游戏剧情的"记忆整理师"。请把下面这段最近的剧情对话，压缩成一段简洁的剧情记忆。必须保留：1) 关键人物与关系的**进度**（尤其是与玩家的感情线——道侣/暧昧/师徒/结义等关系到了哪一步、双方许下过什么承诺/约定/誓言）；2) 发生的重要事件与因果；3) 玩家当前的目标与未了之事。压缩必须**忠实于输入内容**——禁止虚构或推断输入中不存在的人物、事件、关系与对话；宁可简略，不可杜撰。用中文、第三人称，控制在 200 字以内。只输出记忆文本本身，不要任何解释或前缀。`;

export function buildSummaryMessages(turns) {
  const transcript = turns
    .map((t) => (t.role === 'user' ? '玩家：' : '天道：') + t.content)
    .join('\n');
  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: transcript },
  ];
}

// ---------- 状态提取（非JSON叙事兜底时，用短提示词补状态）----------
const EXTRACT_SYSTEM = `你是这个修仙游戏的状态提取器。根据"当前状态"和本回合的"叙事"，提取本回合发生的变化。只输出一个 JSON 对象（不要任何其他文字），结构必须如下：
{
  "stateUpdates": {
    "spiritStones": {"delta": 30},
    "hp": {"delta": -10},
    "maxHp": {"delta": 0},
    "lifespan": {"delta": 0},
    "morality": {"delta": 0},
    "reputation": {"delta": 0},
    "cultivation": {"delta": 0}
  },
  "realmChange": null,
  "risk": null,
  "combat": null,
  "died": false,
  "newNpcs": [],
  "newLocations": [],
  "newSkills": [],
  "newEvents": [],
  "itemChanges": [],
  "equipChanges": [],
  "newQuests": [],
  "questUpdates": [],
  "factionRelations": [],
  "npcRelations": [],
  "newFactions": [],
  "hooks": [],
  "effectRequests": [],
  "retract": [],
  "personalityReveals": [],
  "reveals": [],
  "linkReveals": [],
  "flags": {},
  "goal": null,
  "timeMonths": 1,
  "travelTo": null,
  "gainType": "neutral",
  "eraChange": null
}
规则：
- stateUpdates 里只填有变化的字段，delta 必须是有限、安全数字；禁止 set 直接赋值，包括言出法随模式。没有变化的字段省略。可用字段只有 hp、maxHp、lifespan、spiritStones、morality、reputation、cultivation。
- 正邪 morality 与声望 reputation 判定：行善（救人、助人、除暴安良、护佑弱小、仗义出手）→ morality 给正 delta；作恶（偷窃、杀人、强抢、欺凌、背信弃义）→ morality 给负 delta。声望 reputation：做出广为人知的义举/壮举（救人、除害、完成大事、扬名）→ 给正 delta；恶名（作恶被传开、失信违约）→ 给负 delta。叙事明确写到这些行为时，必须给出对应 delta，不要省略。
- 境界突破用 realmChange 填新境界名（必须严格来自境界阶梯：${LADDER_TEXT}，且大境界不可跳级、须逐级而上；小境界可快速破、甚至连破多个小境界）。每一阶的修为门槛只是参考（前低后高）：${BREAKTHROUGH_NEED_TEXT}。【小境界 vs 大境界】同一大境界内"初期→中期→后期"是小境界；"后期→下一大境界初期"是大境界。例：炼气初期→炼气中期是小境界、炼气后期→筑基初期是大境界。规则——闭关修炼任何阶段都正常涨修为（不要因瓶颈写零增长）；小境界（初期→中期、中期→后期）修为圆满即可填 realmChange，有丹药/天材地宝/顿悟辅助时达到门槛即可填、可连破多个小境界；大境界（如炼气后期→筑基初期、金丹后期→元婴初期）除圆满外还需机缘（叙事里出现丹药/天材地宝/传承/顿悟才填），攒了大量天材地宝也可快速跨过；化神→飞升还需道心+渡劫准备。只有叙事明确描写破境才填。【境界岁月】大境界突破还须在本境积累足够年数（提示里会给出"还差约 N 年"），年数不足时一律填 null，改为描写继续闭关、游历或等机缘。
- 时间 timeMonths：本回合叙事中经过的时间（月数，可为小数，1 月≈30 天）。判定规则：叙事未出现任何时间跨度词（对话、探查、一时半刻等短场景）时填 0；出现时间词或 GM 写了时间变迁时，按此换算——一夜/次日/当晚 ≈0.03（1天）、数日/三日 ≈0.1（3天）、旬日/十日 ≈0.33（10天）、半月 ≈0.5、一月/数月 ≈1~3、一年/数年 ≈12~36、闭关十年 ≈120。GM 主动写的时间跳跃（如"三年后""岁月如梭"）也要如实换算。
- 闭关时长：请把闭关时长写进 timeMonths（如"闭关十年"→timeMonths:120）。**闭关时的修为由系统按境界与时长结算**（一个境界大致要熬满其最少在境年限才圆满），你的 cultivation delta 只填"这次闭关的效率提示"：常速 8~15，灵地/丹药好给 18~20，环境差给 5~7；不要自己算出总收益写进去。若玩家本回合是**闭关修炼/苦修**（而非探索/任务/战斗的顿悟），请在 flags 里标记 closedDoor:true（系统据此按时长结算并计算连续闭关的递减）。
- 行路 travelTo：叙事写玩家抵达另一个区域/城池/坊市时，填该区域名（须与【世界切片】"可达"中的名字一致，或叙事里明确确认的既有区域）；只在确实发生跨区域移动时填，原地活动不填。系统按路程表结算耗时，不要用 timeMonths 代替。
- 寿元 lifespan：岁月流逝导致的寿元减少，系统会按 timeMonths 自动扣除，所以你**不要**为"闭关/赶路/等待"等正常时间流逝再写 lifespan 负 delta（否则会重复扣）。只有叙事发生**非时间流逝**的寿元变化时才写 lifespan delta——如服用延寿丹（正）、走火入魔/被抽取寿元/燃烧寿元（负）。
- 危险判定 risk：当叙事中玩家处于危险/濒死/作死处境（如被强敌重创、身中剧毒、跳入绝地、硬闯必死之地、自不量力挑战远超自己的存在）时，填 "high"（危险）或 "lethal"（致命/作死）；否则填 null。
- 死亡 died：只有叙事**明确描写玩家身死**（殒命/气绝/身亡/身死道消/形神俱灭等）才填 died:true；只写"重伤""濒死""命悬一线""生死一线"时不要填。系统据此触发身死道消结局。
- 战斗 combat：当叙事描写玩家与敌人交手/战斗时，填 {enemy: 敌人名, realm: 敌人境界}；realm 必须严格来自境界阶梯：${LADDER_TEXT}，若叙事没明说敌人境界则填 "未知"。无战斗时省略。
- 新登场的 NPC/地点/功法分别放 newNpcs/newLocations/newSkills，每项 {name, desc}（NPC 要带 relation、temperament 外显气质、personality 真实性格（隐藏真相，可与气质相反）、trait 性格特质（从【人物差异化】的建议里挑一个标签）、desire 想要什么、taboo 碰不得什么、speech 说话习惯；links 是与其他人物的关系 [{to: 对方姓名, type: 师承/同门/亲属/道侣/结义/主仆/仇怨/交易, note: 一句说明}]，新人最好至少挂一条，别让他孤立地存在）。功法 newSkills 要带 grade 品阶（基础/玄阶/地阶/天阶/仙阶，越高修炼越快）。若该 NPC 与其他人物有血缘关系，附 family: {of: "对方姓名或称呼", relation: "父子/兄弟/姐妹/母子等"}。
- NPC 关系 npcRelations：当玩家与某个 NPC 的长期关系结下或改变时登记，每项 {name, relation, debt?, grudge?, trust?, need?}。relation 是标签（如"结义""拜师""道侣""结仇"）；四个数值是 0~100 的**增减量**——救人赠礼记 debt 正（他欠你），受恩记 debt 负（你欠他），伤害/背信记 grudge 正、trust 负，守诺/共患难记 trust 正，长期彼此需要记 need 正。有数值按数值结算；只给标签时系统按标签给种子。结为道侣这类大事件应同时给 trust+need 的正量。
- 事迹 newEvents：本回合发生的重要事件，每项 {subject, title, desc, relation}。subject 为事件主体（人物/地点/势力/目标名），title 为短标题（如"初遇""结仇"），desc 为描述，relation 为该事件后你与该主体的关系状态（如"挚友""仇敌""师徒""结盟""敌对"，可省略）。同一主体的相关小事件会归成一条脉络，务必给准 subject。
- 物品 itemChanges：本回合获得/消耗的物品，每项 {name, desc, delta, kind, grade}；获得填正 delta（如获得 3 枚疗伤丹 → delta:3），消耗填负 delta（如用掉 1 枚 → delta:-1）。kind 为品类（丹药/天材地宝/法宝/武器/衣物/材料），法宝/武器/衣物带 grade 品阶（基础/玄阶/地阶/天阶/仙阶）、rarity 稀有度（凡品/灵品/玄品/仙品/神品，由**获得难度**决定：商店随手=凡品、普通掉落=灵品、秘境/任务=玄品、越级杀敌/传承=仙品、九死一生=神品）、affix 词条（只能引用注册表：${AFFIX_CATALOG}；注册表外的描述视为叙事词条，无数值效果）。当玩家**使用/服用**物品时：itemChanges 记消耗（delta -1），并在 stateUpdates 给对应效果——丹药按功效（疗伤→hp 正、聚气→cultivation 正、延寿→lifespan 正、破障→cultivation 正且降低破境难度）、天材地宝→cultivation 或 lifespan 较大正 delta。当玩家**炼丹/炼器**时：itemChanges 记消耗材料（delta 负），并记产出（丹药/法宝/武器/衣物，delta 正，带 kind 与 grade/rarity/affix）；品阶随材料品质与运气而定。当玩家**穿上/佩戴/装备/祭炼**某件已有物品时，用 equipChanges 记 [{name: 物品名, equipped: true}]；**卸下/脱下**记 [{name, equipped: false}]；系统据此装备/卸下（同类互斥）。
- 法宝名录（阶位：常见名字）——${TREASURE_CATALOG}。**阶位定死、名字管够**：名录里的法宝，阶位与词条由系统按表定，你只填名字，不要自写 grade/rarity；要给玩家新法宝，优先从名录里挑同阶的名字，或按"器物名+器型"另起一个（另起名的按旧规则走 grade/rarity）。阶位越高越难驱动：修为差一个大境界只能发挥一半，差两个以上完全驱动不了。古宝以上不流通，买不到。
- 本命法宝 refineTreasure：玩家以精血祭炼某件**已有**法宝时登记 [{name: 法宝名}]。一名修士只能有一件本命，须金丹以上，耗三成气血与灵石；祭成后威力更胜同阶、与心神相连。属性变化由系统结算，不要自己写。
- 材料：材料与天材地宝**只填名字**，不要写 grade/rarity——品质由**年份**定：十年凡品、百年灵品、五百年玄品、千年仙品、万年神品（「百年回春草」照此折算）。材料有五行（木/水/金/土/阴/雷）与用途：灵草灵花灵果灵液妖丹→炼丹，矿石妖骨妖皮灵木→炼器，灵木灵液→制符。阴煞之气、血煞石、生魂、蚀骨花一类**有毒**，炼丹损德、服之伤身。采药/挖矿/猎妖所得按所在区域的常见材料给（见世界切片「可采」），不要凭空报出产地之外的天材地宝。
- 采集 gather：玩家在野外地界采药/挖矿/猎妖时登记 {kind: "采药"/"挖矿"/"猎妖", days: 天数 1~30}。**出什么由系统按区域与玩家境界定**（境界越高越能取高阶之物），耗时从日历扣、野外有受伤风险；你不要自己写材料产出。每次采集会落到该区域的**采集点**（药圃/矿脉/妖巢）：采过会枯竭，隔几个月才恢复——叙事里可以写"药圃已被采空，得等来年"。
- 炼器 forge：玩家开炉炼器时登记 {name: 法宝名, materials: [材料名…], fire: "真火"/"地火"}。**只有名录里的法宝炼得出来**，至少要两味材料且须在背包里；成器率看阶位与**五行配材**——材料与法宝同属/相生则加成，相克则减成，地火炼火属法宝再加一成。成败、扣料、废器由系统结算，你不要自己写。
- 法宝相冲：同时装备两件五行相克的名录法宝，双方威力减半（多宝不是随便堆的）。火克金、金克木、木克土、土克水、水克火。
- 灵田/矿脉：玩家在合适地界开垦时登记 plant {material: 材料名}（消耗一份作种，最多 3 处）；照料记 tendPlot {id?}（耗灵石，缩短成熟）；收成记 harvestPlot {id?}。成熟周期按年份（凡品 2 年、灵品 10 年、玄品 50 年、仙品 200 年、神品 800 年），**收成由系统结算**，不要自己写产出。
- 守护：高阶采集点有守护，采之前要交手（最多六合）。打不过会受伤撤退，并被它记仇半年——这半年再靠近只会被赶走。叙事里可写"它认得了你的气息"。
- 阵法：名录——${FORMATION_CATALOG}。玩家布阵时登记 setFormation {name}，撤阵记 dismantleFormation {name}，加固记 upgradeFormation {name}。**一级到四级可用阵旗阵盘随行布设；五级起是大阵，须借地脉（灵气≥3）**，地脉还按月有旺衰（旺月大阵更强、衰月减色）。布阵要耗灵石、对修为有要求，系统最多同时保留两座；加固最多三层，每层加两成半威力。效果由系统结算，不要自己写数值。
- 破阵：遇到敌阵时，叙事里先说明"这是什么阵、几级"，并登记 foeFormation {name, tier}；玩家破阵时记 breakFormation {name, method: "寻阵眼" 或 "以力破阵", days}。寻阵眼靠眼力与时间（要几天），硬闯快但伤得重；失败会受伤、阵还在。成败由系统掷，不要自己写结果。
- 四艺：符箓、阵法、丹道、炼器各分五级造诣（未入门/初窥门径/略有小成/登堂入室/出神入化）。玩家**自己练**记 practiceCraft {skill, days}；**向师父或玉简求教**记 studyCraft {skill, from: "师父"/"玉简"}——师父须有师徒名分且信≥60，玉简读一次就记下（新得玉简用 newJadeSlip {name, skill} 登记）。造诣影响：丹道与炼器的成功率、阵法的破阵率与布阵折扣、符箓的成符率与符威。这些数值由系统算，你只负责写修行过程。
- 符箓：符谱——${TALISMAN_CATALOG}。玩家画符记 craftTalisman {name}（须符纸朱砂，高阶加灵墨妖血；造诣不够会被拒），用符记 useTalisman {name}（回血或给一段时间的护身/神行/伤敌符力）。符是一次性的，用完即废；**同一种符可以续时，最多并存三种符力**；三张同符合成符阵记 talismanArray {name}（须符箓「略有小成」）。
- 四艺的瓶颈与顿悟：**略有小成往上会卡瓶颈**（经验停在 99），此时自练与求教都难寸进；须由叙事给出**顿悟**——你判断玩家真的参悟了，就登记 craftInsight {skill}，系统会破一层瓶颈。**师父只能教到「登堂入室」**；另投他师视为叛门（欺师灭祖），旧师会翻脸、玩家声望受损——这种事要在叙事里写出后果。
- 灵根：测灵根用 awakenRoots {roots: ["金","木",...]}（只认五行与雷/冰/风/暗，一属为天根、两三属真灵根、四五属伪灵根；**测出定终身**）。伪灵根功法只能练到三、四层、修五行道法也没天赋；异灵根各有偏长（雷伤敌、冰护体、风赶路、暗破禁）。**补天丹可洗炼灵根**，吃掉一属、资质上一档，用 refineRoots 登记（须身上有补天丹）。
- 功法：名录——${TECH_CATALOG}。学功法记 learnTechnique {name}；修功记 practiceTechnique {name, days}（逐层练，火候满了要耗灵石冲关，九层为止）；择主修记 setMainTechnique {name}（**转修要散掉一成修为**）。主修功法加修炼，炼体减伤、剑诀伤敌、神识助破阵——数值由系统算。
- 越级杀敌掉落：若叙事描写玩家越级击杀强敌成功，掉落高品阶功法/法宝/武器（功法用 newSkills 记、法宝/武器用 itemChanges 记，desc 注明"高品阶/远超当前境界"），并给 reputation 正 delta。
- 探索/任务/奇遇收益：叙事中玩家探索秘境、完成委托、获得奇遇、寻得宝藏时，收获与**凶险程度/玩家境界**相关——低境界探索普通之地有收获（凡品/灵品/玄品）；境界越高，普通之地收获越少甚至无，需探索更凶险的秘境/遗迹或越级挑战才掉高稀有度（玄品/仙品/神品）。有收获时用 newSkills 记功法（带 grade）、itemChanges 记丹药/天材地宝/法宝/武器/衣物/材料（带 kind、grade、rarity、affix），并可给 cultivation 正 delta（顿悟）。
- 支线任务 newQuests：叙事中出现"委托/悬赏/寻宝/护送/解救"等可做之事，且目标明确、有期限、有奖励时，登记为 {title, desc, objective, timeNode, reward, deadlineDays}；deadlineDays 是从本回合结束日开始的非负整数天数（今日/今夜=0，明日/次日=1，三日内=3，一月内=30）。叙事给出明确年月日时可填 deadlineDate:{year,month,day}（每月30天、每年12月），合法绝对日期优先。截止当日仍有效，短对话不消耗天数；不要将回合数换算成天数，不输出 deadlineTurns。无法判断只保留原文 timeNode，不编造日期。普通闲聊或琐事不要登记。
- 任务进度 questUpdates：叙事中进行中任务完成或失败时，登记 {title, status, note}，status 取 "completed" 或 "failed"。completed/failed/cancelled 均为终态，禁止重开、改写、补期限或伪造相反事迹；同批不能把同一任务同时完成与失败。仅当进行中任务处于 deadlinePending 或没有合法 deadlineDate，且本回合叙事明确约定/澄清期限时，附 deadlineDays 或 deadlineDate，相对期限从本回合结束日起算；这种补录可省略 status。世界快照中 deadlinePending 为旧期限待确认，需根据本回合明确的新约定补录，不得从 legacyDeadlineTurn 猜日期。已有合法 deadlineDate 保持固定，不得重复登记相对/绝对期限或擅自延期，本版本不支持已确认期限改期；本回合已完成的任务优先按完成结算。
- 势力关系 factionRelations：当玩家与某势力关系变化时登记，每项 {name, relation}，relation 取「结盟」「敌对」「中立」。
- 新势力 newFactions：叙事中新出现、玩家打听或遇见的江湖势力（宗门/帮派/魔门/世家/商会/朝廷/散修联盟等），有名有实（有名字且叙事有所着墨，如行事风格、宗旨、所在、立场）就登记 {name, desc, type, alignment}；type 取类型（宗门/帮派/魔门/世家/商会/朝廷/散修联盟/其他），alignment 取「正道」「魔道」「中立」（可省略，系统会自动判定）。仅被一句话提及、毫无着墨的势力不要登记（避免图鉴冗杂）。
- 机缘钩子 hooks：本回合叙事中 GM 抛给玩家的机缘/邀请（奇遇、秘境、委托、悬赏、人物上门、势力招揽、追杀、黑市来客等），每项 {theme, title, declined}；theme 取类型（秘境/奇遇/委托/悬赏/人物/势力/追杀/黑市/其他），declined 在玩家明确拒绝该钩子时填 true。系统据此记忆"最近抛过什么、哪些被拒"，防止同类机缘反复出现。没有抛出钩子则留空数组。
- 效果诉求 effectRequests：玩家明确表达"希望某种法宝/丹药/功法有某种效果"时登记，每项 {name, desc}；name 为物品或效果名，desc 为玩家想要的效果。只记录诉求，绝不虚构实现——注册表之外的诉求，GM 应按规则发最接近的注册表词条或标注叙事词条。没有诉求则留空数组。
- 剧情撤回 retract：叙事中出现 GM 承认失言/记错/收回（如"是我失言了""并非你的经历""并无此事""是场误会"）时登记，每项 {subjects: [人物/势力名], titles: [事迹标题], flags: [标记名], items: [{name, delta}]}。系统据此删除对应的事迹、剧情标记与关系档案，并按 items 补回此前误耗的物品（delta 为正数，如误扣了 1 枚就填 1）。没有撤回则留空数组。
- 识破真性 personalityReveals：叙事中玩家看透/识破某 NPC 的真实性格时登记，每项 {name: 人物名}。系统据此在图鉴揭示其真实性格。没有则留空数组。
- 势力底细 reveals：玩家查到某势力隐情的**实证**（不是起疑、不是听说）时登记，每项 {faction: 势力名}；系统据此把该势力标为"表里不一"并记入事迹。没有则留空数组。
- 以丹养伤 treatNpc：玩家用疗伤类丹药为受伤的 NPC（如负伤的护法）疗伤时登记，每项 {name: 人物名, pill: 丹名}；系统按丹方缩短其调养时间。**丹药的气血/修为/寿元效果一律由系统按丹方结算**，不要再在 stateUpdates 里重复给药效数值；丹名用清单里的名字（止血散/回春丹/生肌丹/大还丹/聚气丹/凝元丹/培元丹/清毒丹/化毒丹/延寿丹）。丹药有抗药性（服多了越来越弱）、高出适用境界一个大境界会失效，叙事要体现。没有则留空数组。
- 丹方 newRecipes：玩家得到一份丹方时登记，每项 {name: 丹方名, pill: 对应丹药名, source?: 来历}。丹方分四类：常见（坊市可买）、上古（遗府残卷，药力强、成丹难）、残缺（只有残页，要凑齐）、禁制（魔道禁丹，炼之损德）。**只登记玩家真正拿到手的丹方**，听说过的传闻不算。
- 残页 recipePieces：捡到残缺丹方的残页时登记，每项 {name: 丹方名, delta: 张数}；凑齐后系统自动标记为可炼。没有则留空数组。
- 开炉 brewPills：玩家实际开炉炼丹时登记，每项 {recipe: 丹方名, fire: "真火"/"地火"}。成丹与否由系统按丹方、火源与材料掷定；**材料由系统从背包扣除**，缺料会拒绝并说明，你不要自己扣材料或在 stateUpdates 里写丹药产出。
- 买卖 trades：玩家在坊市/黑市买卖**丹药或丹方**时登记，每项 {action: "buy"/"sell", item: 丹名或丹方名, qty: 数量}。价格由系统按区域物价系数与声望议价结算（黑市更贵、高声望让利），钱货由系统扣付；**你不要在 stateUpdates 里重复扣灵石**，灵石不够或货不够时系统会拒绝并给出理由。非丹药/丹方的杂物不要走这里，按叙事处理。注意：**禁制类丹药与丹方只有黑市（赤沙荒原这类无法之地）敢卖**，正经坊市会拒绝；在黑市买禁制之物会掉正邪。
- 拍卖 auctionBids：玩家在**落霞坊的拍卖会**上举牌时登记，每项 {item: 丹名或丹方名, bid: 出价}。**拍卖会是会期制：每年 3 月、9 月各一场**，不在会期不能举牌（系统会给下一场时间）。起拍价由系统按市价 ×1.5 定，对手出价随机；价高者得、没拍到不扣钱。不要自己写成交价或丹药产出，成交后系统会扣灵石并入库。
- 新区域 newRegion：玩家**真正开辟/发现**一片新地界时才登记，每项 {name: 区域名（2~8字）, terrain: 地形（2~8字）, qi: 灵气 1~6, danger: 危险 1~5, products: 产出品阶数组, links: [{to: 已存在的区域名, days: 单程日数 1~60}], desc: 简述（≤90字）}。**新域必须至少有一条通往外界的路**，产出受地气限制：上限 = floor((灵气+危险)/2)，仙品要灵气或危险≥4，神品要灵气≥5。系统会按《区域生成标准》逐条校验，不合格的会被拒绝并说明原因——不要为了给玩家方便就报高灵气或高产出。
- 关系浮出 linkReveals：玩家查到某条**暗关系**的实证（两人私下往来、账目、口供）时登记，每项 {a: 甲, b: 乙, type?: 关系类型}；系统只把这一条写进档案与关系网，其余暗关系依旧不公开。没有则留空数组。
- 重要剧情标记放 flags；目标变化放 goal。
- 重点关注灵石等数值：叙事中出现 [系统提示] 或"获得/花费/剩余 N 块（枚）灵石""受伤/疗伤""寿元增减"等明确数字，必须据此在 stateUpdates 给出对应 delta。物品与撤回退款的 delta 必须明确给出有限数字，缺失不默认增加一件。普通 flags 仅用布尔值；deathImminent/qiDeviation 只允许 false 清除，不允许 true 伪造；deathByRisk/eraExpired/goalCompleted 由代码管理，不可写入或撤回。
- 收益来源 gainType：当本回合玩家获得灵石等收益时，标注来源——"righteous"（正道途径：任务、交易、赠礼、帮人所得）或 "plunder"（掠夺途径：抢劫、偷窃、杀人越货、勒索）；无收益或无法判断填 "neutral"。
- 大势演变 eraChange：若本回合发生改变天下大势的重大事件（如正魔大战结束、乱世平定），填 {type: "盛世/乱世/末法时代/秘境将启/正魔大战", text: "新大势一句话"}；否则填 null。若叙事中给出了新大势的期限（如"秘境将于三月后开启"），附带 months: 3（期限月数）；无期限则省略 months。
- 【极简输出】为了节省 tokens，只输出有实际内容的字段：stateUpdates 只含有 delta 的键；realmChange/risk/combat/goal/eraChange 若为 null 则省略；died 若为 false 则省略；newNpcs/newLocations/newSkills/newEvents/itemChanges/equipChanges/newQuests/questUpdates/factionRelations/npcRelations/newFactions/hooks/effectRequests/retract/personalityReveals/reveals/linkReveals 若为空数组则整个省略；flags 若为空对象则省略；timeMonths 若为 0（短场景）则省略；gainType 若为 neutral 则省略。本回合无任何变化时输出 {}。`;

export function buildExtractMessages(narrative, player, world) {
  const god = world && world.settings && world.settings.godMode === true;
  const note = god ? '\n【言出法随模式】玩家心想事成，请如实提取叙事中所有兑现的结果（直接提升境界、巨额灵石/法宝/寿元/修为等），不要保守、不要打折。' : '';
  return [
    { role: 'system', content: EXTRACT_SYSTEM },
    { role: 'user', content: '当前状态：' + JSON.stringify({ player, context: buildWorldContext(world) }) + '\n本回合叙事：\n' + narrative + note },
  ];
}

// ---------- 声望收益系数 ----------
export function reputationMultiplier(reputation) {
  const r = Math.max(0, Math.min(100, reputation || 0));
  return 1.0 + (r / 100) * 0.2; // 声望 0→100 对应 1.0x→1.2x 收益（声望只增不减）
}

// ---------- 正邪阵营 / 收益系数（分来源 + 气运，强度随难度）----------
export const MORALITY_INTENSITY = {
  '简单': 0.10,
  '普通': 0.20,
  '困难': 0.30,
  '炼狱': 0.45,
};

export function alignmentLabel(morality) {
  if (morality >= 30) return '正道';
  if (morality <= -30) return '魔道';
  return '中庸';
}

// ---------- 立场处境（正邪 + 声望 → 可感知的游戏体验差异）----------
// 每个 NPC 互动、物价、遭遇、机缘方向都应体现立场差异。
export function stanceProfile(player) {
  const m = player && typeof player.morality === 'number' ? player.morality : 0;
  const r = player && typeof player.reputation === 'number' ? player.reputation : 0;
  const alignment = alignmentLabel(m);
  const rep = r >= 70 ? 'high' : (r <= 20 ? 'low' : 'mid');
  const repLabel = rep === 'high' ? '声名显赫' : (rep === 'low' ? '默默无闻' : '小有名气');
  return { morality: m, reputation: r, alignment, rep, repLabel };
}

// 每回合注入 GM 指引：让正邪/声望差异在叙事里可感知
export function stanceGuide(player) {
  const st = stanceProfile(player);
  const m = st.morality;
  const r = st.reputation;
  const hook = '每隔 3~5 回合若无立场相关剧情，主动安排一次立场相符的遭遇（拜帖/求助/追杀/黑市来客等），给玩家"接或不接"的选择权。';
  if (st.alignment === '正道') {
    const rep = r >= 70 ? '侠名远扬：正派人士争相结交、赠礼让利、主动相护，连魔道也忌惮三分。'
      : r <= 20 ? '虽行正道却名声不显：正道中人将信将疑，需以实际行动取信于人。'
        : '正派人士对你颇有好感，愿与你结善缘。';
    return `【立场处境】正道（正邪${m}·声望${r}）：NPC 敬重你，交易让利、常有赠礼，机缘趋善（传承/庇护/前辈垂青）；魔道对你敌视，谨防暗害与埋伏。${rep}${hook}`;
  }
  if (st.alignment === '魔道') {
    const rep = r >= 70 ? '凶名赫赫：正道人人自危、官府悬赏通缉、追杀者络绎不绝；魔道势力争相拉拢，黑市对你大开方便之门。'
      : r <= 20 ? '魔道雏鸟：正道城池会盘查刁难你，正道侠士尚不把你放在眼里；魔道同门亦在观望你的价值。'
        : '魔道中人视你为自己人：黑市、魔修与邪道势力与你方便。';
    return `【立场处境】魔道（正邪${m}·声望${r}）：正道敌视你——官府盘查、名门侠士可能找上门，正道城池物价抬升、甚至拒之门外；魔道势力与黑市欢迎你，掠夺收益更丰。${rep}${hook}`;
  }
  const rep = r >= 70 ? '虽立场中庸，但声望卓著，黑白两道都给你三分薄面。'
    : r <= 20 ? '中庸且默默无闻：无人问津，两派都不把你当自己人。'
      : '两不相帮、也两不讨好，正魔之间自有周旋余地。';
  return `【立场处境】中庸（正邪${m}·声望${r}）：正魔两派都不视你为敌，但也都不主动给你好处；NPC 态度全看声望高低。${rep}${hook}`;
}

// 分来源收益：正道行为随正道上浮、随魔道打折；掠夺行为反之
export function moralityGainMultiplier(morality, gainType, intensity) {
  const m = Math.max(-100, Math.min(100, morality || 0));
  const i = intensity || 0.2;
  if (gainType === 'righteous') return 1 + i * (m / 100);
  if (gainType === 'plunder') return 1 + i * (-m / 100);
  return 1;
}

// 气运：正道高→悟道/清修顺（修为增益上浮），魔道深→清修难（修为增益下降）
export function fortuneMultiplier(morality, intensity) {
  const m = Math.max(-100, Math.min(100, morality || 0));
  const i = intensity || 0.2;
  return Math.max(0.7, Math.min(1.3, 1 + i * 0.5 * (m / 100)));
}

// ---------- 人物关系：四维账本（恩 / 怨 / 信 / 需）+ 标签快照 ----------
// 标签（道侣/师徒/结义/结仇）只是某一刻的快照；真正驱动判定的是四个 0~100 的存量。
export const BOND_DIMS = ['debt', 'grudge', 'trust', 'need'];
const BOND_BASE = { debt: 0, grudge: 0, trust: 30, need: 20 };
// 旧档迁移与"只给标签没给数值"时的种子值
const BOND_SEED = [
  ['道侣', { trust: 80, need: 75, debt: 40 }],
  ['夫妻', { trust: 80, need: 75, debt: 40 }],
  ['双修', { trust: 70, need: 70, debt: 30 }],
  ['师徒', { trust: 65, need: 45, debt: 65 }],
  ['拜师', { trust: 60, need: 40, debt: 60 }],
  ['结义', { trust: 75, need: 35, debt: 30 }],
  ['挚友', { trust: 70, need: 35, debt: 0 }],
  ['知己', { trust: 65, need: 30, debt: 0 }],
  ['恩人', { trust: 50, need: 10, debt: 70 }],
  ['主仆', { trust: 40, need: 60, debt: 0 }],
  ['效忠', { trust: 50, need: 60, debt: 60 }],
  ['结仇', { trust: 5, need: 0, grudge: 75 }],
  ['仇敌', { trust: 0, need: 0, grudge: 85 }],
  ['敌对', { trust: 5, need: 0, grudge: 70 }],
];
export function clampBond(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
export function bondSeedFor(label) {
  const text = String(label || '');
  for (const [key, seed] of BOND_SEED) {
    if (text.includes(key)) return seed;
  }
  return null;
}
// 读账本：有就用；旧档没有就从标签推一个（纯读，不回写，读档不判罚）
export function bondOf(npc) {
  if (!npc) return { ...BOND_BASE };
  if (npc.bond && typeof npc.bond === 'object') {
    const b = {};
    for (const k of BOND_DIMS) b[k] = clampBond(npc.bond[k]);
    return b;
  }
  return { ...BOND_BASE, ...(bondSeedFor(npc.relation) || {}) };
}
export function monthOrdinal(date) {
  const y = date && Number.isFinite(date.year) ? date.year : 1;
  const m = date && Number.isFinite(date.month) ? date.month : 1;
  return y * 12 + m;
}

// 人物之间的关系分"明暗"：档案与提示词只公开主角知道的；暗关系只给 GM 一份"不得点破"的清单。
// 默认：亲缘/师承/同门/道侣/结义是明面；仇怨/交易/主仆多是私下的事。
const SECRET_LINK_TYPES = new Set(['仇怨', '交易', '主仆']);
export function linkIsKnown(link) {
  if (!link) return false;
  if (typeof link.known === 'boolean') return link.known;
  return true; // 旧数据没有明暗标记，按公开处理，避免旧档突然丢关系
}

// ---------- 境界下限年限（按原著节奏）----------
// 原著依据：筑基→结丹"再苦修百余年"（第 176 章）；乱星海百余年才出一个有望元婴的结丹（第 459 章）；
// 韩立到灵界"骨龄才刚二千余岁"已至合体/大乘（第 1862 章）。所以大境界推进以"年"计，
// 下表是**最少在境年限**（下限，不是必然耗时；有机缘/丹药可贴着下限走）。
export const REALM_MIN_YEARS = {
  凡人: 3, 炼气: 8, 筑基: 60, 金丹: 100, 元婴: 200, 化神: 300, 炼虚: 400, 合体: 500, 大乘: 700,
};
export function minYearsFor(realm) {
  return REALM_MIN_YEARS[realmMajor(realm)] ?? 0;
}
// 本境已历多少年；旧档没有记录时返回 null（不拦，按老节奏）
export function yearsInRealm(world, player) {
  const since = world && world.realmSince;
  const date = worldGameDate(world);
  if (!since || !date) return null;
  const a = gameDateOrdinal(since);
  const b = gameDateOrdinal(date);
  if (a === null || b === null || b < a) return null;
  return (b - a) / 360; // 每月 30 天、每年 12 月 → 360 天/年
}

// 闭关时修为按时长结算：每月涨幅 ≈ 100 / (最少在境年限 × 12)。
// 这样"熬满年限"与"修为圆满"大致同步，模型写一个大数字也灌不满一个境界。
export function cultRatePerMonth(realm) {
  const years = Math.max(1, minYearsFor(realm));
  return 100 / (years * 12);
}

// 一次闭关的修为收益：时长决定总量，模型给的 delta 只当"效率提示"（8~15 为常速）
export function seclusionGain(realm, months, qualityHint = 10) {
  const monthsN = Math.max(0, Number(months) || 0);
  const hint = Number(qualityHint);
  const quality = Math.max(0.5, Math.min(2, (Number.isFinite(hint) ? hint : 10) / 10));
  return Math.round(cultRatePerMonth(realm) * monthsN * quality * 100) / 100;
}

// ---------- 闭关被打断 ----------
// 闭关不是安全屋：仇家、心魔、兽潮都挑这时候上门。由引擎先掷，掷中了就把
// "第几年被谁打断"写进本回合指引，逼 GM 写"提前出关"，并把时长压短。
const SECLUDE_RE = /闭关|坐关|闭死关|苦修|静修|入定/;
export function seclusionIntent(text) {
  return SECLUDE_RE.test(String(text || ''));
}

// 护法：信得过的人（道侣/结义/师徒/挚友）会替你守着洞府；也可以点名去请。
// 他们不改变闭关收益，只降低"被打断"的概率——关系在这里第一次直接影响玩法。
// 挡过灾的人会负伤/心神受损，养好之前不能再护法。
const GUARD_REL = /道侣|结义|师徒|拜师|挚友|知己|主仆/;
export function guardianReady(npc, world) {
  if (!npc) return false;
  const until = npc.condition && Number.isFinite(npc.condition.untilMonth) ? npc.condition.untilMonth : 0;
  return until <= monthOrdinal(world && world.date);
}
export function seclusionGuardians(world, text) {
  const t = String(text || '');
  const out = [];
  for (const npc of world.npcs || []) {
    if (!guardianReady(npc, world)) continue; // 旧伤未愈，来不了
    const b = bondOf(npc);
    if (b.grudge >= 50) continue; // 有仇的人不会替你守门
    const intimate = b.trust >= 60 && GUARD_REL.test(String(npc.relation || ''));
    const invited = t.includes(npc.name) && b.trust >= 50;
    if (intimate || invited) out.push(npc);
  }
  return out.slice(0, 2); // 最多两位，再多也不叠加
}

export function rollSeclusionInterrupt(world, player, text, rand = Math.random) {
  if (!world || !seclusionIntent(text)) return null;
  const s = world.settings || {};
  if (s.godMode === true) return null;
  const region = world.geo ? regionById(world.geo.regionId) : null;
  const foes = (world.factions || []).filter((f) => f && f.relation === '敌对');
  const angry = (world.npcs || []).filter((n) => bondOf(n).grudge >= 50);

  let chance = 0.08;
  if (region) chance += region.danger * 0.02;
  if (world.eraType === '正魔大战' || world.eraType === '乱世') chance += 0.05;
  chance += Math.min(0.15, foes.length * 0.05);
  chance += Math.min(0.09, angry.length * 0.03);
  if (world.flags && world.flags.qiDeviation) chance += 0.1;

  // 护法：每人把概率压到 55%，最多两位
  const guardians = seclusionGuardians(world, text);
  world.guardiansThisTurn = guardians.map((n) => n.name);
  if (guardians.length) chance *= Math.pow(0.55, guardians.length);
  chance *= formationEffects(world.formations || [], world).interruptMult; // 幻阵/护山大阵让闭关更安稳
  chance = Math.max(0.02, Math.min(0.6, chance));

  if (rand() >= chance) {
    world.pendingInterrupt = null;
    return null;
  }
  const npc = angry[0] || null;
  const faction = foes[0] || null;
  const qiDev = !!(world.flags && world.flags.qiDeviation);
  const by = npc ? `${npc.name}（旧怨）` : (faction ? faction.name : (qiDev ? '心魔' : '不速之客'));
  const afterYears = 1 + Math.floor(rand() * 3); // 第 1~3 年出岔子
  world.pendingInterrupt = { by, afterYears, turn: world.turn || 0 };
  return world.pendingInterrupt;
}

// ---------- 炼丹 ----------
// 丹方：常见/上古/残缺/禁制四类；残缺须集齐残页；地火加成；失败出废丹。
export function findRecipe(world, key) {
  const k = String(key || '').trim();
  if (!k) return null;
  return (world.recipes || []).find((r) => r.name === k || r.name.includes(k) || k.includes(r.name)) || null;
}

export function brewPill(world, player, input, rand = Math.random) {
  if (!world || !input) return { ok: false, reason: '无效的炼丹请求' };
  if (!Array.isArray(world.recipes)) world.recipes = [];
  const key = input.recipe || input.pill || '';
  const recipe = findRecipe(world, key);
  if (!recipe) return { ok: false, reason: `未得「${key}」的丹方` };
  const pill = PILLS.find((p) => p.id === recipe.pill);
  if (!pill) return { ok: false, reason: '丹方有误' };
  if (recipe.pieces && (recipe.have || 0) < recipe.pieces) {
    return { ok: false, reason: `丹方残缺（${recipe.have || 0}/${recipe.pieces}），须集齐残页` };
  }
  // 材料校验：缺一味都不开炉
  const missing = [];
  for (const m of recipe.materials || []) {
    const have = (world.inventory || []).filter((it) => it && it.name === m.name).reduce((s, it) => s + (it.qty || 0), 0);
    if (have < m.qty) missing.push(`${m.name}（需${m.qty}，有${have}）`);
  }
  if (missing.length) return { ok: false, reason: `材料不足：${missing.join('、')}` };

  for (const m of recipe.materials || []) applyItemChange(world, { name: m.name }, -m.qty);
  const matBonus = materialBrewBonus((recipe.materials || []).map((m) => m.name)); // 年份越足越稳
  const elem = elementalBrewAdjust((recipe.materials || []).map((m) => m.name), input.fire); // 五行相生相克
  const danBonus = craftBonus((player.crafts && player.crafts['丹道']) || 0, '丹道').brew; // 丹道造诣
  const chance = Math.min(0.95, Math.round((brewChance(pill, { fire: input.fire }) + matBonus + elem.delta + danBonus) * 100) / 100);
  const success = rand() < chance;
  if (success) {
    applyItemChange(world, { name: pill.name, desc: '自炼', kind: '丹药', rarity: pill.grade }, 1);
    return { ok: true, success: true, pill: pill.name, chance,
      note: `【炼丹】${recipe.name}开炉，地火正旺——一炉「${pill.name}」成了（成丹率 ${Math.round(chance * 100)}%）。` };
  }
  applyItemChange(world, { name: '废丹', desc: '炼废的药团', kind: '丹药' }, 1);
  return { ok: true, success: false, pill: pill.name, chance,
    note: `【炼丹】${recipe.name}火候差了三分，「${pill.name}」炼成了一炉废丹。` };
}

// ---------- 交易 ----------
// 丹药与丹方按现成的价目结算：区域物价系数（黑市翻倍）× 声望议价（高声望让利、低声望抬价）。
// 卖价按买入价的 55% 回收，免得"买来卖去"刷钱。
export function itemPrice(world, player, name, action = 'buy') {
  const raw = String(name || '').trim();
  // 丹方名 = 丹名 + "方"（回春丹方 → 回春丹）
  const isRecipe = /方$/.test(raw);
  const pillSpec = isRecipe ? pillByName(raw.replace(/方$/, '')) : pillByName(raw);
  const treasure = pillSpec ? null : treasureByName(raw);
  let base;
  if (pillSpec) {
    base = isRecipe ? recipeOf(pillSpec).price : pillSpec.price;
  } else if (treasure && TREASURE_TIERS[treasure.tier].tradable) {
    base = TREASURE_TIERS[treasure.tier].price;
  } else {
    return null;
  }
  const regionMult = world && world.geo ? priceMultiplier(world.geo.regionId, world.eraType) : 1;
  const rep = Number(player && player.reputation) || 0;
  const repFactor = Math.max(0.8, Math.min(1.3, 1 - (rep - 50) / 250)); // 声望 70 约让利 8%，声望 20 抬价一成
  const kind = action === 'sell' ? 0.55 : 1;
  return Math.max(1, Math.round(base * regionMult * repFactor * kind));
}

// 黑市：只认钱不认来路的无法之地——赤沙荒原（灰市）与星陨荒原（陨铁盟）
const BLACK_MARKET_REGIONS = new Set(['chisha', 'xingyun']);
export function isBlackMarket(world) {
  const region = world && world.geo ? regionById(world.geo.regionId) : null;
  return !!region && BLACK_MARKET_REGIONS.has(region.id);
}
export function isForbiddenGood(name) {
  const raw = String(name || '');
  const pill = /方$/.test(raw) ? pillByName(raw.replace(/方$/, '')) : pillByName(raw);
  return !!pill && pill.tier === '禁制';
}

export function tradeItem(world, player, input) {
  if (!world || !player || !input) return { ok: false, reason: '交易内容不明' };
  const action = input.action === 'sell' ? 'sell' : 'buy';
  const name = String(input.item || '').trim();
  const qty = Math.max(1, Math.min(99, Math.floor(Number(input.qty) || 1)));
  if (!name) return { ok: false, reason: '没有说交易什么' };
  // 禁制之物只有黑市敢卖
  if (action === 'buy' && isForbiddenGood(name) && !isBlackMarket(world)) {
    return { ok: false, reason: '禁制之物，正经坊市不敢卖——去黑市碰碰运气' };
  }
  const price = itemPrice(world, player, name, action);
  if (price === null) return { ok: false, reason: `「${name}」不是市面上能估价的货` };
  const total = price * qty;

  if (action === 'buy') {
    if (player.spiritStones < total) {
      return { ok: false, reason: `灵石不够（需 ${total}，你只有 ${player.spiritStones}）` };
    }
    const isRecipe = /方$/.test(name);
    if (isRecipe) {
      const pill = pillByName(name.replace(/方$/, ''));
      const base = recipeOf(pill);
      if (!Array.isArray(world.recipes)) world.recipes = [];
      if (world.recipes.some((r) => r.name === name)) return { ok: false, reason: `你已经有一份「${name}」了` };
      world.recipes.push({ ...base, name, have: pill.tier === '残缺' ? 0 : base.pieces, source: '买来的' });
    } else {
      applyItemChange(world, { name, desc: '购自坊市', kind: '丹药' }, qty);
    }
    player.spiritStones -= total;
    const forbidden = action === 'buy' && isForbiddenGood(name);
    if (forbidden) player.morality = Math.max(-100, (player.morality || 0) - 3);
    return {
      ok: true,
      note: `【交易】买下「${name}」×${qty}，付 ${total} 灵石（单价 ${price}）${forbidden ? '；禁制之物，正邪 −3' : ''}。`,
    };
  }

  // 卖出
  const have = (world.inventory || [])
    .filter((it) => it && it.name === name)
    .reduce((s, it) => s + (it.qty || 0), 0);
  if (have < qty) return { ok: false, reason: `货不够（${name} 只有 ${have} 件）` };
  applyItemChange(world, { name }, -qty);
  player.spiritStones += total;
  return { ok: true, note: `【交易】卖出「${name}」×${qty}，得 ${total} 灵石（单价 ${price}）。` };
}

// ---------- 拍卖会 ----------
// 会期制：每年 3 月、9 月各一场，只有落霞坊开拍。不在会期，"举牌"要被拒并告知下一场。
export const AUCTION_MONTHS = [3, 9];
export function auctionWindow(world) {
  const d = worldGameDate(world);
  const month = d ? d.month : 1;
  const year = d ? d.year : 1;
  const open = AUCTION_MONTHS.includes(month);
  let next = null;
  for (const m of AUCTION_MONTHS) {
    if (m > month) { next = { year, month: m, inMonths: m - month }; break; }
  }
  if (!next) {
    next = { year: year + 1, month: AUCTION_MONTHS[0], inMonths: 12 - month + AUCTION_MONTHS[0] };
  }
  return { open, year, month, next };
}

export function auctionBid(world, player, input, rand = Math.random) {
  if (!world || !player || !input) return { ok: false, reason: '拍卖内容不明' };
  const region = world.geo ? regionById(world.geo.regionId) : null;
  if (!region || region.id !== 'luoxia') return { ok: false, reason: '此地没有拍卖会（落霞坊才有）' };
  const win = auctionWindow(world);
  if (!win.open) {
    return { ok: false, reason: `不在会期——下一场在 ${win.next.year} 年 ${win.next.month} 月（${win.next.inMonths} 个月后）` };
  }
  const name = String(input.item || '').trim();
  const bid = Math.floor(Number(input.bid));
  if (!name || !Number.isFinite(bid) || bid <= 0) return { ok: false, reason: '出价不明' };
  const base = itemPrice(world, player, name, 'buy');
  if (base === null) return { ok: false, reason: `「${name}」不上拍` };
  const reserve = Math.round(base * 1.5);
  if (bid < reserve) return { ok: false, reason: `低于起拍价 ${reserve} 灵石` };
  if (player.spiritStones < bid) return { ok: false, reason: `灵石不够举牌（要 ${bid}，你只有 ${player.spiritStones}）` };

  const rival = Math.round(reserve * (0.85 + rand() * 0.5));
  if (bid <= rival) {
    return { ok: false, reason: `被人以 ${rival} 灵石压过，你没拍到（灵石未动）` };
  }
  // 拍下
  player.spiritStones -= bid;
  if (/方$/.test(name)) {
    const pill = pillByName(name.replace(/方$/, ''));
    const baseRecipe = recipeOf(pill);
    if (!Array.isArray(world.recipes)) world.recipes = [];
    if (!world.recipes.some((r) => r.name === name)) {
      world.recipes.push({ ...baseRecipe, name, have: pill.tier === '残缺' ? 0 : baseRecipe.pieces, source: '拍来的' });
    }
  } else {
    applyItemChange(world, { name, desc: '拍得', kind: '丹药' }, 1);
  }
  return { ok: true, note: `【拍卖】落槌！你以 ${bid} 灵石拍下「${name}」（对手出到 ${rival}）。` };
}

// ---------- 采集 ----------
// 采药/挖矿/猎妖：按区域的常见材料出，境界越高越能取高阶之物；野外有风险。
const MAJOR_ORDER = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
function majorRankOf(realm) {
  const i = MAJOR_ORDER.indexOf(realmMajor(realm));
  return i < 0 ? 0 : i;
}

// ---------- 采集点（药圃/矿脉/妖巢）----------
// 稀有度随"灵气 + 凶险"抬升，并随大势浮动：秘境将启会催生高货，末法时代连灵草都难长。
// 恢复周期按小说口径以"年"计（百年灵药不是半年就能再长一茬的）。
const NODE_KINDS = { 采药: '药圃', 挖矿: '矿脉', 猎妖: '妖巢' };
export const NODE_RARITIES = ['凡品', '灵品', '玄品', '仙品', '神品'];
const RARITY_RESPAWN_YEARS = { 凡品: 2, 灵品: 10, 玄品: 50, 仙品: 200, 神品: 800 };
const RARITY_YIELD_CAP = { 凡品: 99, 灵品: 99, 玄品: 2, 仙品: 1, 神品: 1 };

// 大势对采集点稀有度的影响：秘境将启催生灵物，战乱与末法让灵脉枯竭
const ERA_NODE_DELTA = { 盛世: 1, 秘境将启: 2, 乱世: 0, 正魔大战: -1, 末法时代: -2 };

// 区域能出到的最高稀有度：灵气+危险越高越可能出高货；灵气 ≥5 的仙域可出神品；再由大势加减
// qi 可传入当前实际灵气（地脉漂移之后），不传则用表里的底值
export function regionNodeCap(region, eraType = '', qi = null) {
  if (!region) return 0;
  const q = Number.isFinite(qi) ? qi : (region.qi || 1);
  let cap;
  if (q >= 5) cap = 4;
  else {
    const power = q + (region.danger || 1);
    cap = power >= 10 ? 4 : power >= 8 ? 3 : power >= 6 ? 2 : power >= 4 ? 1 : 0;
  }
  cap += ERA_NODE_DELTA[eraType] || 0;
  return Math.max(0, Math.min(4, cap));
}

// 恢复周期（月）：凡品 2 年、灵品 10 年、玄品 50 年、仙品 200 年、神品 800 年
export function nodeRespawn(tier) {
  return (RARITY_RESPAWN_YEARS[tier] || 10) * 12;
}

// 高阶采集点的守护：仙品起必有，玄品三成。守护有耐久，会连打几回合、会记仇。
const GUARD_NAMES = ['守药妖兽', '护脉石傀', '毒蛟', '铁背妖狼', '阴魂'];
function makeGuard(rarity, rand) {
  const rank = NODE_RARITIES.indexOf(rarity);
  if (rank < 3 && !(rank === 2 && rand() < 0.3)) return null;
  const hp = 6 + rank; // 玄品 8 点、仙品 9 点、神品 10 点——同境硬拼六合也打不完
  return {
    name: GUARD_NAMES[Math.floor(rand() * GUARD_NAMES.length)],
    rank: Math.max(2, rank), // 玄品=金丹，仙品=元婴，神品=化神
    hp,
    maxHp: hp,
    defeated: false,
    aggroUntil: null,
  };
}

function pickNodeRarity(region, rand, eraType = '', qi = null) {
  const cap = regionNodeCap(region, eraType, qi);
  const weights = [6, 4, 2, 1, 0.5].slice(0, cap + 1); // 越低越常见
  const total = weights.reduce((a, b) => a + b, 0);
  let hit = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    hit -= weights[i];
    if (hit <= 0) return NODE_RARITIES[i];
  }
  return '凡品';
}

// 守护是场短斗：最多六合，气力不济就退。守护有耐久，打退一次还会记仇（半年内绕开你）。
function fightGuard(world, player, node, rand) {
  const g = node.guard;
  const pRank = majorRankOf(player.realm);
  const hasAtk = (world.inventory || []).some((it) => it && it.equipped && it.tier && ATTACK_TYPES.has(it.type));
  const dmg = 1 + (pRank > g.rank ? 1 : 0) + (hasAtk ? 1 : 0);
  let rounds = 0;
  let hpLoss = 0;
  while (g.hp > 0 && player.hp > player.maxHp * 0.2 && rounds < 6) {
    g.hp -= dmg;
    rounds += 1;
    if (g.hp <= 0) break;
    const hurt = Math.max(1, Math.round(player.maxHp * (0.06 + rand() * 0.06)));
    player.hp = Math.max(1, player.hp - hurt);
    hpLoss += hurt;
  }
  if (g.hp <= 0) {
    g.defeated = true;
    return { win: true, rounds, hpLoss };
  }
  g.aggroUntil = monthOrdinal(world.date) + 6;
  return { win: false, rounds, hpLoss };
}

function fillNode(node, region, gatherKind, rand, world = null) {
  const pool = gatherPool(region.id, gatherKind);
  if (!pool.length) return node;
  const effQi = regionQi(region, world); // 地脉漂移后的实际灵气：枯则出不了高货
  const wanted = pickNodeRarity(region, rand, node.eraType || '', effQi);
  let rank = NODE_RARITIES.indexOf(wanted);
  let material = null;
  while (rank >= 0 && !material) {
    const cand = pool.filter((x) => (MATERIAL_TIERS[materialTier(x)] || { rank: 0 }).rank === rank);
    if (cand.length) material = cand[Math.floor(rand() * cand.length)];
    rank -= 1;
  }
  if (!material) {
    // 大势压得太狠、当地没有低阶之物：退而取本地最低阶的那一种
    let best = null;
    let bestRank = 99;
    for (const x of pool) {
      const r = (MATERIAL_TIERS[materialTier(x)] || { rank: 0 }).rank;
      if (r < bestRank) { bestRank = r; best = x; }
    }
    material = best || pool[0];
  }
  const realRank = (MATERIAL_TIERS[materialTier(material)] || { rank: 0 }).rank;
  const rarity = NODE_RARITIES[realRank] || '凡品';
  node.material = material.name;
  node.rarity = rarity;
  node.respawnMonths = nodeRespawn(rarity);
  node.guard = makeGuard(rarity, rand);
  node.harvestedMonth = null;
  return node;
}

function ensureRegionNodes(world, region, gatherKind, rand) {
  if (!Array.isArray(world.nodes)) world.nodes = [];
  const nodeKind = NODE_KINDS[gatherKind];
  const eraType = (world && world.eraType) || '';
  const exist = world.nodes.filter((n) => n.region === region.id && n.kind === nodeKind);
  if (exist.length) return exist;
  const pool = gatherPool(region.id, gatherKind);
  if (!pool.length) return [];
  const count = Math.min(3, pool.length);
  const created = [];
  for (let i = 0; i < count; i++) {
    created.push(fillNode({
      id: `${region.id}_${nodeKind}_${i}`,
      region: region.id,
      kind: nodeKind,
      eraType,
    }, region, gatherKind, rand, world));
  }
  world.nodes.push(...created);
  return created;
}

function nodeReady(node, nowMonth) {
  return !Number.isFinite(node.harvestedMonth) || nowMonth - node.harvestedMonth >= node.respawnMonths;
}

export function gatherMaterials(world, player, input, rand = Math.random) {
  const kind = input && input.kind;
  if (!GATHER_KINDS[kind]) return { ok: false, reason: '不知道该采什么（采药/挖矿/猎妖）' };
  const region = world && world.geo ? regionById(world.geo.regionId, world) : null;
  if (!region) return { ok: false, reason: '不知身在何处' };
  const pool = gatherPool(region.id, kind);
  if (!pool.length) return { ok: false, reason: `${region.name}没有可${kind}之物` };

  const days = Math.max(1, Math.min(30, Math.floor(Number(input.days) || 3)));
  const rank = majorRankOf(player.realm);
  const tierRank = (m) => (MATERIAL_TIERS[materialTier(m)] || { rank: 0 }).rank;
  const allowed = pool.filter((m) => tierRank(m) <= rank);
  const usable = allowed.length ? allowed : pool.filter((m) => tierRank(m) === 0);
  if (!usable.length) return { ok: false, reason: '此地之物非你修为能取' };

  const times = Math.max(1, Math.round(days / 4)); // 四天一份
  const now = monthOrdinal(world.date);
  const eraType = (world && world.eraType) || '';
  const all = ensureRegionNodes(world, region, kind, rand);
  // 到了恢复期的采集点，按当前大势重新生成：秘境将启会催出高货，末法时代会掉档
  for (const n of all) {
    if (Number.isFinite(n.harvestedMonth) && nodeReady(n, now)) {
      n.eraType = eraType;
      fillNode(n, region, kind, rand);
    }
  }
  const nodes = all.filter((n) => {
    const m = materialByName(n.material);
    return m && tierRank(m) <= rank && nodeReady(n, now);
  });

  let hpLoss = 0;
  let dangerNote = '';
  const picks = [];
  let siteNote = '';
  if (nodes.length) {
    const node = nodes[Math.floor(rand() * nodes.length)];
    // 守护：仙品以上必有，玄品三成。多回合交手，打不过就退、会被记仇。
    if (node.guard && !node.guard.defeated) {
      if (Number.isFinite(node.guard.aggroUntil) && now < node.guard.aggroUntil) {
        return {
          ok: true, kind, days, items: {}, hpLoss: 0, site: `${node.kind}（${node.rarity}）`,
          note: `【采集】${node.kind}（${node.rarity}）旁，${node.guard.name}还在气头上，你暂且绕开。`,
        };
      }
      const fight = fightGuard(world, player, node, rand);
      hpLoss = fight.hpLoss;
      if (!fight.win) {
        return {
          ok: true, kind, days, items: {}, hpLoss, site: `${node.kind}（${node.rarity}）有${node.guard.name}守着`,
          note: `【采集】${kind} ${days} 日：${node.kind}（${node.rarity}）旁与${node.guard.name}斗了 ${fight.rounds} 合，你力有不逮，退了回来（气血 -${hpLoss}）。`,
        };
      }
      dangerNote = `击退了${node.guard.name}（${fight.rounds} 合）`;
    }
    const cap = RARITY_YIELD_CAP[node.rarity] || 99;
    const got = Math.min(times, cap);
    for (let i = 0; i < got; i++) picks.push(node.material);
    node.harvestedMonth = now;
    siteNote = `在${node.kind}（${node.rarity}）采得「${node.material}」`;
  } else {
    // 采集点都枯竭了：野外只能碰运气，一份
    picks.push(usable[Math.floor(rand() * usable.length)].name);
    siteNote = '附近的采集点都已枯竭，只采到一点野生的';
  }
  for (const name of picks) applyItemChange(world, { name }, 1);

  const risk = (kind === '猎妖' ? 0.15 : 0.08) + region.danger * 0.02;
  if (rand() < risk) {
    hpLoss = Math.max(1, Math.round(player.maxHp * (0.06 + rand() * 0.12)));
    player.hp = Math.max(1, player.hp - hpLoss);
    dangerNote = `${dangerNote ? `${dangerNote}；` : ''}遭了埋伏，气血 -${hpLoss}`;
  }

  const tally = {};
  for (const name of picks) tally[name] = (tally[name] || 0) + 1;
  const items = Object.entries(tally).map(([n, q]) => `${n}×${q}`).join('、');
  return {
    ok: true, kind, days, items: tally, hpLoss, site: siteNote,
    note: `【采集】${kind} ${days} 日：${siteNote}，${items}${dangerNote ? `；${dangerNote}` : ''}`,
  };
}

// ---------- 灵田与矿脉（自营采集点）----------
// 种下去、养起来、按年份收。成熟周期沿用采集点的年数口径，照料可提前。
export const PLOT_LIMIT = 3;
const PLOT_KIND = {
  灵草: '灵田', 灵花: '灵田', 灵果: '灵田', 灵液: '灵田',
  矿石: '矿脉', 灵木: '矿脉', 奇物: '矿脉',
  妖丹: '妖巢', 妖骨: '妖巢', 妖皮: '妖巢', 妖血: '妖巢',
};

export function plantPlot(world, player, input) {
  const name = String((input && input.material) || '').trim();
  const mat = materialByName(name);
  if (!mat) return { ok: false, reason: `「${name}」不是能栽种的材料` };
  const region = world && world.geo ? regionById(world.geo.regionId, world) : null;
  if (!region) return { ok: false, reason: '不知身在何处' };
  if (!(mat.regions || []).includes(region.id)) return { ok: false, reason: `${region.name}养不活「${name}」` };
  if (!Array.isArray(world.plots)) world.plots = [];
  if (world.plots.length >= PLOT_LIMIT) return { ok: false, reason: `最多经营 ${PLOT_LIMIT} 处灵田/矿脉` };
  if (!(world.inventory || []).some((it) => it.name === mat.name && it.qty >= 1)) {
    return { ok: false, reason: `没有「${name}」作种` };
  }
  const tier = materialTier(mat);
  const growth = nodeRespawn(tier);
  const now = monthOrdinal(world.date);
  applyItemChange(world, { name: mat.name }, -1);
  const plot = {
    id: `plot_${world.plots.length + 1}`,
    region: region.id,
    kind: PLOT_KIND[mat.kind] || '灵田',
    material: mat.name,
    tier,
    plantedMonth: now,
    growthMonths: growth,
    matureMonth: now + growth,
  };
  world.plots.push(plot);
  return {
    ok: true, plot,
    note: `【开垦】你在${region.name}辟出一处${plot.kind}，种下「${mat.name}」（${tier}，约 ${Math.max(1, Math.round(growth / 12))} 年成熟）。`,
  };
}

export function tendPlot(world, player, input) {
  const id = String((input && input.id) || '').trim();
  const plots = world.plots || [];
  const plot = plots.find((p) => p.id === id) || plots[0];
  if (!plot) return { ok: false, reason: '没有可照料的灵田/矿脉' };
  const now = monthOrdinal(world.date);
  if (now >= plot.matureMonth) return { ok: false, reason: '已到收成的时候，不必再照料' };
  const price = (MATERIAL_TIERS[plot.tier] || {}).price || 100;
  const cost = Math.max(10, Math.round(price * 0.1));
  if (player.spiritStones < cost) return { ok: false, reason: `灵石不足（需 ${cost}）` };
  player.spiritStones -= cost;
  const saved = Math.round(plot.growthMonths * 0.2);
  plot.matureMonth = Math.max(now + 1, plot.matureMonth - saved);
  return { ok: true, note: `【照料】你以灵石温养${plot.kind}，成熟提前约 ${Math.max(1, Math.round(saved / 12))} 年（灵石 -${cost}）。` };
}

export function harvestPlot(world, player, input) {
  const id = String((input && input.id) || '').trim();
  const plots = world.plots || [];
  const plot = plots.find((p) => p.id === id) || plots[0];
  if (!plot) return { ok: false, reason: '没有可收成的灵田/矿脉' };
  const now = monthOrdinal(world.date);
  if (now < plot.matureMonth) {
    return { ok: false, reason: `尚未成熟（还差约 ${Math.max(1, Math.ceil((plot.matureMonth - now) / 12))} 年）` };
  }
  const qty = ['凡品', '灵品', '玄品'].includes(plot.tier) ? 2 : 1;
  applyItemChange(world, { name: plot.material }, qty);
  world.plots = plots.filter((p) => p !== plot);
  return { ok: true, items: { [plot.material]: qty }, note: `【收成】${plot.kind}里的「${plot.material}」熟了，收得 ${qty} 份。` };
}

// ---------- 阵法 ----------
// 阵旗阵盘可布四级以下的小阵（可带走）；五级起是大阵，借地脉而设，撤走即废。
export const FORMATION_LIMIT = 2;

export function setFormation(world, player, input) {
  const name = String((input && input.name) || '').trim();
  const def = formationByName(name);
  if (!def) return { ok: false, reason: `「${name}」不是所知阵法` };
  const tier = FORMATION_TIERS[def.tier];
  if (!canSetFormation(player.realm, def)) {
    return { ok: false, reason: `修为不足，${def.tier}阵法须${tier.minRealm}起才能布` };
  }
  const region = world && world.geo ? regionById(world.geo.regionId, world) : null;
  if (!region) return { ok: false, reason: '不知身在何处' };
  // 大阵须借地脉：灵气太薄的地方承不住——但可以用珍稀材料代替地脉（三份灵品以上）
  let substitute = false;
  if (tier.big && !canSetOnLeyline(region)) {
    const mats = (Array.isArray(input.materials) ? input.materials : []).map((m) => materialByName(m)).filter(Boolean);
    const owned = mats.filter((m) => (world.inventory || []).some((it) => it.name === m.name && it.qty >= 1));
    const rare = owned.filter((m) => ((MATERIAL_TIERS[materialTier(m)] || { rank: 0 }).rank) >= 1);
    if (rare.length < 3) {
      return { ok: false, reason: `${region.name}地脉太薄；可用三份灵品以上珍材代地脉（现不足）` };
    }
    for (const m of rare.slice(0, 3)) applyItemChange(world, { name: m.name }, -1);
    substitute = true;
  }
  if (!Array.isArray(world.formations)) world.formations = [];
  if (world.formations.length >= FORMATION_LIMIT) return { ok: false, reason: `同时最多布 ${FORMATION_LIMIT} 座阵` };
  if (world.formations.some((f) => f.name === def.name && f.region === region.id)) {
    return { ok: false, reason: `此地已布「${def.name}」` };
  }
  const cost = Math.round(formationCost(def) * (1 - craftBonus((player.crafts && player.crafts['阵法']) || 0, '阵法').setCost)); // 阵道造诣打折
  if (player.spiritStones < cost) return { ok: false, reason: `灵石不足（需 ${cost}）` };
  player.spiritStones -= cost;
  world.formations.push({
    name: def.name, tier: def.tier, type: def.type, region: region.id, setMonth: monthOrdinal(world.date), level: 1,
  });
  const carry = substitute
    ? '此地地脉不足，以三份珍材代脉，阵成之后材料即耗。'
    : (isPortable(def) ? '阵旗阵盘可随行带走。' : '此阵借地脉而设，撤走即废。');
  return { ok: true, note: `【布阵】你在${region.name}布下「${def.name}」（${def.tier}·${def.type}），灵石 -${cost}。${carry}` };
}

// 加固：往阵眼里多镶灵石、重炼主阵旗（原文第 231 章"灵石镶在阵眼处"）
export function upgradeFormation(world, player, input) {
  const name = String((input && input.name) || '').trim();
  const def = formationByName(name);
  if (!def) return { ok: false, reason: `「${name}」不是所知阵法` };
  const list = world.formations || [];
  const f = list.find((x) => x.name === def.name);
  if (!f) return { ok: false, reason: `此地未布「${def.name}」` };
  const level = Number(f.level) || 1;
  if (level >= FORMATION_MAX_LEVEL) return { ok: false, reason: `「${def.name}」已加固到顶（${FORMATION_MAX_LEVEL} 层）` };
  const cost = upgradeCost(def, level);
  if (player.spiritStones < cost) return { ok: false, reason: `灵石不足（需 ${cost}）` };
  player.spiritStones -= cost;
  f.level = level + 1;
  return { ok: true, note: `【加固】「${def.name}」阵眼又镶了一轮灵石，升到 ${level + 1} 层（灵石 -${cost}）。` };
}

// 破阵：寻阵眼（拆其灵力之源）或以力硬闯（原文第 233 章"硬闯破阵要花费一番手脚"）
export function breakFormation(world, player, input, rand = Math.random) {
  const name = String((input && input.name) || '').trim();
  const list = Array.isArray(world.foeFormations) ? world.foeFormations : [];
  const def = formationByName(name);
  const target = list.find((f) => f.name === (def ? def.name : name));
  if (!target) return { ok: false, reason: `此处没有「${name}」这座敌阵` };
  const method = input.method === '以力破阵' ? '以力破阵' : '寻阵眼';
  const days = Math.max(1, Math.min(10, Math.floor(Number(input.days) || (method === '寻阵眼' ? 3 : 1))));
  const foeRank = Math.max(1, Object.keys(FORMATION_TIERS).indexOf(target.tier) + 1 || 2);
  const pRank = majorRankOf(player.realm);
  const atk = (world.inventory || []).some((it) => it && it.equipped && it.tier && ATTACK_TYPES.has(it.type)) ? 0.08 : 0;
  const zhenBonus = craftBonus((player.crafts && player.crafts['阵法']) || 0, '阵法').breakForm + (techniqueEffects(player.techniques || []).breakForm || 0); // 阵道造诣 + 神识功法
  const chance = method === '寻阵眼'
    ? Math.max(0.1, Math.min(0.9, 0.35 + (pRank - foeRank) * 0.08 + zhenBonus))
    : Math.max(0.1, Math.min(0.9, 0.5 - foeRank * 0.04 + atk + zhenBonus));

  if (rand() < chance) {
    world.foeFormations = list.filter((f) => f !== target);
    return {
      ok: true, days,
      note: `【破阵】${method} ${days} 日，「${target.name}」（${target.tier || '不知几级'}）被破了${method === '寻阵眼' ? '——阵眼上的灵石一碎，阵势就散了' : '——硬生生砸开一条路'}。`,
    };
  }
  const hurt = Math.max(1, Math.round(player.maxHp * (method === '寻阵眼' ? 0.12 : 0.2)));
  player.hp = Math.max(1, player.hp - hurt);
  return {
    ok: true, days, hpLoss: hurt,
    note: `【破阵】${method} ${days} 日，没能破开「${target.name}」${method === '寻阵眼' ? '，阵眼藏得太深' : '，反被阵势所伤'}（气血 -${hurt}）。`,
  };
}

export function dismantleFormation(world, player, input) {
  const name = String((input && input.name) || '').trim();
  const list = world.formations || [];
  const def = formationByName(name);
  const idx = list.findIndex((f) => f.name === (def ? def.name : name));
  if (idx < 0) return { ok: false, reason: `未布「${name}」` };
  const [f] = list.splice(idx, 1);
  return { ok: true, note: `【撤阵】「${f.name}」已撤${isPortable(formationByName(f.name)) ? '，阵旗阵盘收回' : ''}。` };
}

// ---------- 四艺修习与符箓 ----------
// 修习靠练、靠师父指点、靠照玉简参研；造诣分五级，从"初窥门径"到"出神入化"。
// 卡在瓶颈上时，引擎每修习一次会掷一次"自发顿悟"：卡得越久，悟开的机会越大。
export function practiceCraft(world, player, input, rand = Math.random) {
  const skill = String((input && input.skill) || '').trim();
  if (!CRAFT_NAMES.includes(skill)) return { ok: false, reason: '四艺只有符箓、阵法、丹道、炼器' };
  const days = Math.max(1, Math.min(10, Math.floor(Number(input.days) || 3)));
  if (!player.crafts) player.crafts = { 符箓: 0, 阵法: 0, 丹道: 0, 炼器: 0 };
  if (!player.craftStuck) player.craftStuck = {};
  const before = skillLevelOf(player.crafts[skill]).name;

  // 已卡瓶颈：先掷顿悟，悟开了才继续涨
  if (isBottlenecked(player.crafts[skill])) {
    player.craftStuck[skill] = (player.craftStuck[skill] || 0) + 1;
    const stuck = player.craftStuck[skill];
    const chance = Math.min(0.35, 0.06 + 0.03 * stuck);
    if (rand() < chance) {
      const lv = skillLevelOf(player.crafts[skill]).level;
      player.crafts[skill] = (lv + 1) * 100;
      delete player.craftStuck[skill];
      return {
        ok: true, days, insight: true,
        note: `【顿悟】${days} 日枯坐，忽然心头一亮——${skill}那层窗户纸破了，进境到「${SKILL_LEVELS[lv + 1]}」。`,
      };
    }
    return {
      ok: true, days,
      note: `【修习】${days} 日练${skill}，仍是不得其门（卡在瓶颈第 ${stuck} 回）。这层纸，也许哪天就破了。`,
    };
  }

  const gain = practiceGain(player.crafts[skill], days);
  const { exp, capped } = applyCraftExp(player.crafts[skill], gain);
  player.crafts[skill] = exp;
  const after = skillLevelOf(exp);
  const up = after.name !== before ? `，进境到「${after.name}」` : '';
  const stuck = capped || isBottlenecked(exp);
  return {
    ok: true, days,
    note: `【修习】${days} 日练${skill}，经验 +${gain}${up}（${after.name}）${stuck ? '。练到此处再难寸进——这层窗户纸，得靠顿悟或名师点化' : ''}。`,
  };
}

// 顿悟：卡在瓶颈上时，一次参悟可破（第 9 章"只隔着一层纸"）
export function craftInsight(world, player, input) {
  const skill = String((input && input.skill) || '').trim();
  if (!CRAFT_NAMES.includes(skill)) return { ok: false, reason: '四艺只有符箓、阵法、丹道、炼器' };
  if (!player.crafts) player.crafts = { 符箓: 0, 阵法: 0, 丹道: 0, 炼器: 0 };
  const exp = player.crafts[skill];
  if (!isBottlenecked(exp)) return { ok: false, reason: `${skill}尚未到瓶颈，无需顿悟` };
  const lv = skillLevelOf(exp).level;
  if (lv >= SKILL_LEVELS.length - 1) return { ok: false, reason: '已到出神入化，无级可破' };
  player.crafts[skill] = (lv + 1) * 100;
  return { ok: true, note: `【顿悟】${skill}那层窗户纸破了，进境到「${SKILL_LEVELS[lv + 1]}」。` };
}

// 两位师父是否"师门为敌"：要么 NPC 之间有旧怨，要么两家势力是敌对/世仇。
// 光换师父不算叛门——小说里墨大夫那样的前期师父，到后期本就没有交集。
function mastersAreEnemies(world, oldNpc, newNpc) {
  if (!oldNpc || !newNpc) return false;
  const linked = (world.npcLinks || []).some((l) => l && (
    (l.a === oldNpc.name && l.b === newNpc.name) || (l.a === newNpc.name && l.b === oldNpc.name)
  ) && /仇怨|敌对|世仇/.test(l.type || ''));
  if (linked) return true;
  const a = oldNpc.sect || oldNpc.faction;
  const b = newNpc.sect || newNpc.faction;
  if (!a || !b) return false;
  const fa = factionByName(a);
  const fb = factionByName(b);
  if (!fa || !fb) return false;
  return relationsOf(fa.id).some((r) => (
    (r.a === fa.id && r.b === fb.id) || (r.b === fa.id && r.a === fb.id)
  ) && /敌对|世仇/.test(r.type));
}

export function studyCraft(world, player, input) {
  const skill = String((input && input.skill) || '').trim();
  if (!CRAFT_NAMES.includes(skill)) return { ok: false, reason: '四艺只有符箓、阵法、丹道、炼器' };
  const from = input.from === '师父' ? '师父' : '玉简';
  if (!player.crafts) player.crafts = { 符箓: 0, 阵法: 0, 丹道: 0, 炼器: 0 };
  if (!player.craftMasters) player.craftMasters = {};
  let note = '';
  if (from === '师父') {
    const master = (world.npcs || []).find((n) => /师父|拜师|师徒/.test(n.relation || '') && bondOf(n).trust >= 60);
    if (!master) return { ok: false, reason: '身边没有信得过的师父（须师徒名分且信≥60）' };
    if (skillLevelOf(player.crafts[skill]).level >= MASTER_CAP_LEVEL) {
      return { ok: false, reason: `师父能教的到「${SKILL_LEVELS[MASTER_CAP_LEVEL]}」为止，再往上得看你自己` };
    }
    const prev = player.craftMasters[skill];
    if (prev && prev !== master.name) {
      const old = (world.npcs || []).find((n) => n.name === prev);
      const secret = input.secret === true;
      const stillClose = !!old && /师父|拜师|师徒/.test(old.relation || '') && bondOf(old).trust >= 20;
      const enemy = mastersAreEnemies(world, old, master);
      if (secret) {
        // 秘而不宣：旧师不知道，就不算欺师灭祖；但记一笔，日后可能被揭破
        if (!player.craftSecrets) player.craftSecrets = {};
        player.craftSecrets[skill] = { master: master.name, from: prev, sinceMonth: monthOrdinal(world.date) };
        note = `你未对人提起，暗地里拜在${master.name}门下。`;
      } else if (stillClose && enemy) {
        // 真正的叛门：投到与师门为敌的人门下，且旧师知道
        old.bond = { ...bondOf(old), trust: clampBond(bondOf(old).trust - 40), grudge: clampBond(bondOf(old).grudge + 30) };
        player.reputation = Math.max(0, (player.reputation || 0) - 10);
        note = `【叛门】你抛下旧师「${prev}」，转投与师门为敌的${master.name}——旧师与你恩断义绝，声名有损（声望 -10）。`;
      } else if (stillClose && !enemy) {
        note = `旧师「${prev}」与你已无甚交集，另投${master.name}不算背师。`;
      }
    }
    player.craftMasters[skill] = master.name;
  } else {
    const slip = (world.jadeSlips || []).find((s) => s.skill === skill && !s.read);
    if (!slip) return { ok: false, reason: `没有可读的${skill}玉简` };
    slip.read = true;
    if (slip.kind === '丹方' && slip.recipe) {
      const pill = pillByName(slip.recipe);
      if (pill && !(world.recipes || []).some((r) => r.name === `${pill.name}方`)) {
        if (!Array.isArray(world.recipes)) world.recipes = [];
        const base = recipeOf(pill);
        world.recipes.push({ ...base, name: `${pill.name}方`, have: pill.tier === '残缺' ? 0 : base.pieces, source: '玉简学得' });
        note = `玉简里录着「${pill.name}方」，丹方到手。`;
      }
    } else if (slip.kind === '功法') {
      const known = techniqueByName(slip.name);
      if (known) {
        const r = learnTechnique(world, player, { name: known.name });
        note = r.note || r.reason;
      } else {
        // 名录外的功法（模型自造）：只记在册，不给数值加成
        if (!Array.isArray(world.skills)) world.skills = [];
        if (!world.skills.some((s) => s.name === slip.name)) {
          world.skills.push({ name: slip.name, grade: slip.grade || '基础功法', desc: '玉简所录' });
          note = `玉简里录着一门「${slip.name}」（${slip.grade || '基础功法'}），参研有得（名录外，只记在册）。`;
        }
      }
    }
  }
  const before = skillLevelOf(player.crafts[skill]).name;
  const gain = studyGain(player.crafts[skill], from);
  const { exp, capped } = applyCraftExp(player.crafts[skill], gain);
  player.crafts[skill] = exp;
  const after = skillLevelOf(exp);
  const up = after.name !== before ? `，进境到「${after.name}」` : '';
  const stuck = capped || isBottlenecked(exp) ? '，却卡在瓶颈上' : '';
  return { ok: true, note: `${note ? `${note}；` : ''}【求教】${from === '师父' ? '师父指点' : '照玉简参研'}${skill}，经验 +${gain}${up}${stuck}（${after.name}）。` };
}

export function addJadeSlip(world, input) {
  const skill = String((input && input.skill) || '').trim();
  if (!CRAFT_NAMES.includes(skill)) return { ok: false, reason: '玉简所录须是四艺之一' };
  if (!Array.isArray(world.jadeSlips)) world.jadeSlips = [];
  const name = String((input && input.name) || `${skill}玉简`).trim();
  const kind = ['心得', '丹方', '功法', '阵图'].includes(input && input.kind) ? input.kind : '心得';
  const slip = { name, skill, kind, read: false };
  if (kind === '丹方' && input.recipe) slip.recipe = String(input.recipe).trim();
  if (kind === '功法') slip.grade = TECH_GRADES[input.grade] ? input.grade : '基础功法';
  world.jadeSlips.push(slip);
  const what = kind === '丹方' ? `录着一门丹方（${slip.recipe || '未名'}）` : kind === '功法' ? `录着一门功法（${slip.grade}）` : kind === '阵图' ? '录着一幅阵图' : '记着修行心得';
  return { ok: true, note: `【玉简】得「${name}」，${what}，可照简参研${skill}。` };
}

export function craftTalisman(world, player, input, rand = Math.random) {
  const def = talismanByName(input && input.name);
  if (!def) return { ok: false, reason: `「${(input && input.name) || ''}」不在符谱上` };
  const tier = TALISMAN_TIERS[def.tier];
  const exp = (player.crafts && player.crafts['符箓']) || 0;
  if (skillLevelOf(exp).level < tier.skill) {
    return { ok: false, reason: `符箓造诣不足，${def.tier}须「${SKILL_LEVELS[tier.skill]}」` };
  }
  for (const m of def.materials) {
    if (!(world.inventory || []).some((it) => it.name === m && it.qty >= 1)) {
      return { ok: false, reason: `缺材料：${m}` };
    }
  }
  for (const m of def.materials) applyItemChange(world, { name: m }, -1);
  const chance = drawChance(def, exp) * rootCraftPenalty(player); // 伪灵根修五行道法没天赋（第242章）
  if (rand() < chance) {
    applyItemChange(world, { name: def.name, kind: '符箓', desc: def.desc }, 1);
    return { ok: true, success: true, note: `【制符】符纸一展，「${def.name}」画成了（成符率 ${Math.round(chance * 100)}%）。` };
  }
  applyItemChange(world, { name: '废符', desc: '画废的符纸', kind: '材料' }, 1);
  return { ok: true, success: false, note: '【制符】笔走偏了，只画出一张废符。' };
}

export function useTalisman(world, player, input) {
  const name = String((input && input.name) || '').trim();
  const has = (world.inventory || []).some((x) => x.name === name && x.qty >= 1);
  if (!has) return { ok: false, reason: `身上没有「${name}」` };
  const def = talismanByName(name);
  if (!def) return { ok: false, reason: `「${name}」不是符箓` };
  applyItemChange(world, { name }, -1);
  const power = 1 + craftBonus((player.crafts && player.crafts['符箓']) || 0, '符箓').power;
  const e = def.effect || {};
  const bits = [];
  if (e.hp) {
    const heal = Math.round(e.hp * power);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    bits.push(`气血 +${heal}`);
  }
  if (e.damageTaken || e.deathMult || e.travelMult) {
    const months = Math.max(1, Math.min(6, e.months || 1));
    if (!Array.isArray(world.talismanBuffs)) world.talismanBuffs = [];
    const now = monthOrdinal(world.date);
    world.talismanBuffs = world.talismanBuffs.filter((b) => b.untilMonth > now);
    const same = world.talismanBuffs.find((b) => b.name === def.name);
    const buff = {
      name: def.name,
      damageTaken: e.damageTaken ? Math.max(0.4, 1 - (1 - e.damageTaken) * power) : 1,
      deathMult: e.deathMult ? Math.max(0.4, 1 - (1 - e.deathMult) * power) : 1,
      travelMult: e.travelMult ? Math.max(0.4, 1 - (1 - e.travelMult) * power) : 1,
      untilMonth: now + months,
    };
    if (same) {
      // 同符叠加只延长时间，最多在现有基础上再续六个月
      same.untilMonth = Math.max(same.untilMonth, Math.min(same.untilMonth + months, now + 6));
      bits.push(`符力再续（至第 ${same.untilMonth - now} 个月后）`);
    } else {
      if (world.talismanBuffs.length >= 3) world.talismanBuffs.shift();
      world.talismanBuffs.push(buff);
      bits.push(`符力持续 ${months} 个月`);
    }
    world.talismanBuff = buff; // 保留最近一次的镜像，便于展示
  }
  return { ok: true, note: `【用符】「${def.name}」化了：${bits.join('，')}。` };
}

// 符阵：同一种符三张并作一符阵，符力更久更强（符箓造诣须略有小成）
export function setTalismanArray(world, player, input, rand = Math.random) {
  const name = String((input && input.name) || '').trim();
  const def = talismanByName(name);
  if (!def) return { ok: false, reason: `「${name}」不是符箓` };
  const exp = (player.crafts && player.crafts['符箓']) || 0;
  if (skillLevelOf(exp).level < 2) return { ok: false, reason: '符箓造诣须「略有小成」才能结符阵' };
  const owned = (world.inventory || []).filter((x) => x.name === def.name).reduce((n, x) => n + (x.qty || 0), 0);
  if (owned < 3) return { ok: false, reason: `结符阵要三张「${def.name}」（现有 ${owned}）` };
  for (let i = 0; i < 3; i++) applyItemChange(world, { name: def.name }, -1);
  const power = (1 + craftBonus(exp, '符箓').power) * 1.5;
  const e = def.effect || {};
  if (!Array.isArray(world.talismanBuffs)) world.talismanBuffs = [];
  const now = monthOrdinal(world.date);
  const buff = {
    name: `${def.name}·符阵`,
    damageTaken: e.damageTaken ? Math.max(0.35, 1 - (1 - e.damageTaken) * power) : 1,
    deathMult: e.deathMult ? Math.max(0.35, 1 - (1 - e.deathMult) * power) : 1,
    travelMult: e.travelMult ? Math.max(0.35, 1 - (1 - e.travelMult) * power) : 1,
    untilMonth: now + Math.max(2, (e.months || 1) * 2),
  };
  world.talismanBuffs.push(buff);
  world.talismanBuff = buff;
  return { ok: true, note: `【符阵】三张「${def.name}」布成符阵，符力翻倍且更久（约 ${buff.untilMonth - now} 个月）。` };
}

// 所有生效符力的合计（相乘）
function talismanBuffFx(world) {
  const now = monthOrdinal(world.date);
  const list = (world.talismanBuffs || []).filter((b) => b.untilMonth > now);
  const fx = { damageTaken: 1, deathMult: 1, travelMult: 1 };
  for (const b of list) {
    fx.damageTaken *= b.damageTaken || 1;
    fx.deathMult *= b.deathMult || 1;
    fx.travelMult *= b.travelMult || 1;
  }
  return { fx, active: list.length > 0 };
}

// ---------- 功法 ----------
// 学到手、逐层练、择一门主修。主修吃修炼倍率，其余功法吃各自那一摊（炼体减伤、剑诀伤敌、神识助破阵）。
export function learnTechnique(world, player, input) {
  const known = techniqueExact(input && input.name);
  // 名录内的照名录；名录外（模型现场拟的功法）按"品阶 + 要求清单"框架收进来
  const spec = known ? { ...known, requirements: known.requirements || [] } : normalizeTechnique(input || {});
  if (!spec.name) return { ok: false, reason: '功法无名' };
  const grade = gradeOf(spec);
  if (majorRankOf(player.realm) < majorRankOf(grade.minRealm)) {
    return { ok: false, reason: `修为不足，${spec.grade}须${grade.minRealm}起才能修` };
  }
  const region = world && world.geo ? regionById(world.geo.regionId, world) : null;
  const check = checkTechniqueRequirements(world, player, spec, { regionName: region ? region.name : '' });
  if (!check.ok) return { ok: false, reason: `修习条件不足：${check.missing.join('；')}` };
  if (!Array.isArray(player.techniques)) player.techniques = [];
  if (player.techniques.some((t) => t.name === spec.name)) return { ok: false, reason: `已修「${spec.name}」` };
  player.techniques.push({
    name: spec.name, layer: 1, exp: 0, grade: spec.grade, type: spec.type, element: spec.element,
    requirements: spec.requirements || [],
  });
  if (!player.mainTechnique && (spec.type === '主修' || spec.type === '辅助')) player.mainTechnique = spec.name;
  const req = (spec.requirements || []).length ? `（须：${spec.requirements.map(requirementText).join('；')}）` : '';
  return { ok: true, note: `【得法】你记下了「${spec.name}」（${spec.grade}·${spec.type}·${spec.element}属）${req}，从第一层起修。` };
}

export function practiceTechnique(world, player, input) {
  const name = String((input && input.name) || '').trim();
  const tech = (player.techniques || []).find((t) => t.name === name || t.name === (techniqueByName(name) || {}).name);
  if (!tech) return { ok: false, reason: `未修「${name}」` };
  const def = defOf(tech);
  const days = Math.max(1, Math.min(30, Math.floor(Number(input.days) || 5)));
  const gain = Math.max(1, Math.round(days * (2 + (tech.layer || 1) * 0.5)));
  tech.exp = (tech.exp || 0) + gain;
  const need = layerCost(tech.layer);
  // 灵根所限：伪灵根练不过三、四层（第 127 章）
  const cap = rootLayerCap(player);
  let note = `【修功】${days} 日修「${tech.name}」第 ${tech.layer} 层，火候 +${gain}（${tech.exp}/${need}）。`;
  if (tech.layer >= cap && tech.layer < MAX_LAYER) {
    return {
      ok: true, days,
      note: `【修功】${days} 日修「${tech.name}」，第 ${tech.layer} 层已是你灵根的上限——再练也是空耗，须换更好的灵根或另寻机缘。`,
    };
  }
  if (tech.exp >= need && tech.layer < MAX_LAYER) {
    const cost = layerUpCost(def, tech.layer);
    if (player.spiritStones >= cost) {
      player.spiritStones -= cost;
      tech.layer += 1;
      tech.exp = 0;
      note += ` 灵石一催，破入第 ${tech.layer} 层（灵石 -${cost}）。`;
    } else {
      note += ` 火候已足，只差 ${cost} 块灵石冲关。`;
    }
  } else if (tech.layer >= MAX_LAYER) {
    note += ' 已至第九层，再无可进。';
  }
  return { ok: true, days, note };
}

export function setMainTechnique(world, player, input) {
  const want = String((input && input.name) || '').trim();
  const tech = (player.techniques || []).find((t) => t.name === want || t.name === (techniqueByName(want) || {}).name);
  if (!tech) return { ok: false, reason: `未修「${want}」` };
  const def = defOf(tech);
  if (!def) return { ok: false, reason: '这门功法无名' };
  if (player.mainTechnique === def.name) return { ok: false, reason: `「${def.name}」已是主修` };
  const prev = player.mainTechnique;
  if (prev) {
    // 转修要散功：旧功法练出的法力要散掉一部分；
    // 若两门功法属性相克（如万水仙诀与他派功法冲突），散得更多（仙界篇第 90 章）。
    const prevDef = techniqueByName(prev);
    const clash = !!(prevDef && prevDef.element !== '无' && def.element !== '无'
      && elementsClash(prevDef.element, def.element));
    const fraction = clash ? 0.2 : 0.1;
    const lost = Math.round((player.cultivation || 0) * fraction * 100) / 100;
    player.cultivation = Math.max(0, Math.round(((player.cultivation || 0) - lost) * 100) / 100);
    player.mainTechnique = def.name;
    return {
      ok: true,
      note: `【转修】弃「${prev}」改修「${def.name}」，${clash ? `两门功法属性相克（${prevDef.element}克${def.element}），散功更重` : '旧功散了一成修为'}（修为 -${lost}）。`,
    };
  }
  player.mainTechnique = def.name;
  return { ok: true, note: `【主修】以「${def.name}」为主修功法。` };
}

// 秘密拜师会不会被旧师察觉：过得越久、旧师越在意，越容易露
export function checkCraftSecretExposure(world, player, rand = Math.random) {
  const secrets = player.craftSecrets || {};
  const skills = Object.keys(secrets);
  if (!skills.length) return null;
  const now = monthOrdinal(world.date);
  const exposed = [];
  for (const skill of skills) {
    const s = secrets[skill];
    const months = Math.max(1, now - (s.sinceMonth || now));
    const old = (world.npcs || []).find((n) => n.name === s.from);
    const watchful = old && bondOf(old).trust >= 60 ? 1.5 : 1;
    const chance = Math.min(0.85, 0.02 * months * watchful);
    if (rand() < chance) exposed.push({ skill, s, old, chance });
  }
  if (!exposed.length) return null;
  let note = '';
  for (const { skill, s, old } of exposed) {
    if (old) {
      old.bond = { ...bondOf(old), trust: clampBond(bondOf(old).trust - 40), grudge: clampBond(bondOf(old).grudge + 30) };
    }
    player.reputation = Math.max(0, (player.reputation || 0) - 10);
    delete player.craftSecrets[skill];
    note += `【事泄】你暗拜「${s.master}」学${skill}的事被旧师「${s.from}」知道了——欺师灭祖的罪名坐实（声望 -10）。`;
  }
  return note;
}

// 测灵根：一旦测出便不改（第 144 章韩立被测出四属性缺金的伪灵根）
export function awakenRoots(world, player, input) {
  const roots = normalizeRoots((input && input.roots) || (input && input.elements) || []);
  if (!roots.length) return { ok: false, reason: '没有测出灵根（须给金木水火土之一）' };
  if (Array.isArray(player.spiritRoots) && player.spiritRoots.length) {
    return { ok: false, reason: `灵根已测：${player.spiritRoots.join('、')}，不可更易` };
  }
  player.spiritRoots = roots;
  const prof = rootProfile(player);
  const slow = prof.layerCap <= 5 ? '，伪灵根之身，功法只能练到三、四层' : '';
  return { ok: true, note: `【测灵根】你是${roots.join('、')}属——${prof.tier}（${prof.label}），修炼${prof.cultMult > 1.1 ? '事半功倍' : prof.cultMult < 1 ? '颇为吃力' : '中平'}${slow}。` };
}

// 补天丹洗炼灵根：吃掉一属，资质往上走一档（第 490、541 章）
export function refineRoots(world, player, input) {
  const has = (world.inventory || []).some((it) => it.name === '补天丹' && it.qty >= 1);
  if (!has) return { ok: false, reason: '没有补天丹，洗炼不了先天灵根' };
  const before = rootProfile(player);
  if (!before.tested) return { ok: false, reason: '你的灵根尚未测出，无从洗炼' };
  if (before.roots.length <= 1) return { ok: false, reason: '已是单一灵根，补天丹也无用' };
  const removed = refineRootsOne(player);
  applyItemChange(world, { name: '补天丹' }, -1);
  const after = rootProfile(player);
  return {
    ok: true,
    note: `【洗炼】补天丹化了，你体内那一缕${removed}属灵根被洗去——从${before.tier}成了${after.tier}（${after.roots.join('、')}），吸纳灵气顺畅了许多。`,
  };
}

// ---------- 炼器（五行配材）----------
// 只有名录里的法宝炼得出来；成器率随阶位递减，材料五行与法宝五行相配则加成、相克则减成。
const FORGE_BASE = {
  法器: 0.9, 下品法宝: 0.6, 中品法宝: 0.45, 上品法宝: 0.3,
  极品法宝: 0.2, 古宝: 0.12, 灵宝: 0.08, 通天灵宝: 0.05, 玄天之宝: 0.02,
};

export function forgeTreasure(world, player, input, rand = Math.random) {
  if (!world || !player || !input) return { ok: false, reason: '炼器内容不明' };
  const name = String(input.name || '').trim();
  const known = treasureByName(name);
  if (!known) return { ok: false, reason: `「${name}」不在炼器谱上（名录外的器物炼不出来）` };
  const tier = TREASURE_TIERS[known.tier];
  if (majorRankOf(player.realm) < majorRankOf(tier.minRealm) - 1) {
    return { ok: false, reason: `修为不足，炼不了${known.tier}` };
  }
  const mats = (Array.isArray(input.materials) ? input.materials : []).map((n) => materialByName(n)).filter(Boolean);
  const owned = mats.filter((m) => (world.inventory || []).some((it) => it.name === m.name && it.qty >= 1));
  if (owned.length < 2) return { ok: false, reason: '炼器至少要两味材料，且须在背包里' };

  const elem = treasureElement(known);
  let bonus = 0;
  const notes = [];
  for (const m of owned) {
    const rel = elementRelation(m.element, elem);
    if (rel === '同属') { bonus += 0.06; notes.push(`${m.name}同属`); }
    else if (rel === '生') { bonus += 0.04; notes.push(`${m.name}相生`); }
    else if (rel === '克' || rel === '被克') { bonus -= 0.08; notes.push(`${m.name}相克`); }
  }
  if (input.fire === '地火' && elem === '火') { bonus += 0.05; notes.push('地火助火'); }
  bonus = Math.max(-0.2, Math.min(0.25, Math.round(bonus * 100) / 100));
  const qiBonus = craftBonus((player.crafts && player.crafts['炼器']) || 0, '炼器').forge; // 炼器造诣
  const chance = Math.max(0.02, Math.min(0.95, Math.round(((FORGE_BASE[known.tier] || 0.1) + bonus + qiBonus) * 100) / 100));

  for (const m of owned) applyItemChange(world, { name: m.name }, -1);
  const detail = notes.length ? `（${notes.join('、')}）` : '';
  if (rand() < chance) {
    applyItemChange(world, { name: known.name }, 1);
    return { ok: true, success: true, note: `【炼器】${detail}一炉火罢，「${known.name}」成了（成器率 ${Math.round(chance * 100)}%）。` };
  }
  applyItemChange(world, { name: '废器', desc: '炼废的器物坯子', kind: '材料' }, 1);
  return { ok: true, success: false, note: `【炼器】${detail}火候差了三分，「${known.name}」只炼出一件废器。` };
}

// 亲密关系 → 修炼加成：按"信"和"需"算，不按标签。结仇的人不助你修行。
export function relationCultMult(npcs) {
  let bonus = 0;
  for (const n of npcs || []) {
    const b = bondOf(n);
    if (b.grudge >= 60) continue; // 有仇的人，再亲的名分也不会助你修炼
    bonus += b.trust * 0.002 + b.need * 0.001;
  }
  return 1 + Math.min(0.3, bonus);
}

// 结盟势力 → 修炼加成（每个 +5%，上限 +15%）
export function factionCultMult(factions) {
  const n = (factions || []).filter((f) => f && f.relation === '结盟').length;
  return n > 0 ? 1 + Math.min(n, 3) * 0.05 : 1.0;
}

// ---------- 战斗数值（轻量版：境界差决定伤害与生还）----------
// 敌人境界 vs 玩家境界的差距（正数=敌人更高；未知境界按同级处理）
export function combatDiff(playerRealm, enemyRealm) {
  const ei = REALM_LADDER.indexOf(enemyRealm);
  if (ei === -1) return 0;
  return ei - realmIndex(playerRealm);
}
// 境界差 → 受伤倍率（越级受伤更重）
export function combatDamageMult(diff) {
  if (diff <= 0) return 0.6;
  if (diff === 1) return 1.2;
  if (diff === 2) return 1.7;
  return 2.4;
}
// 境界差 → 死亡概率倍率（越级更易死）
export function combatDeathMult(diff) {
  if (diff <= 0) return 0.3;
  if (diff === 1) return 1.0;
  if (diff === 2) return 1.8;
  return 3.0;
}
// 名录法宝按阶位与修为驱动；名录外的旧式装备仍按品阶×稀有度
export function treasureCultMult(item, player) {
  const power = treasurePower(item, player && player.realm);
  return power === null ? gradeMult(item.grade) : power;
}
// 装备防御：衣物按品阶；名录法宝按阶位威力（修为不足则打折扣，驱动不了就不加分）
export function equipDefenseMult(inventory, player = null) {
  const realm = player && player.realm;
  const best = activeItems(inventory).reduce((m, it) => {
    const kind = it.kind || kindFromText(it.name, it.desc);
    if (kind === '衣物') return Math.max(m, gradeMult(it.grade));
    if (kind !== '法宝') return m;
    const power = treasurePower(it, realm);
    if (power !== null) return DEFENSE_TYPES.has(it.type) ? Math.max(m, power) : m;
    return Math.max(m, gradeMult(it.grade));
  }, 1.0);
  return 1 / best;
}
// 装备攻击：已装备武器的品阶降低致死率（仙阶 2.5 → 致死×0.4）；双持取最强一把
export function equipAttackMult(inventory, player = null) {
  const realm = player && player.realm;
  const best = activeItems(inventory).reduce((m, it) => {
    const kind = it.kind || kindFromText(it.name, it.desc);
    if (kind === '武器') return Math.max(m, gradeMult(it.grade));
    if (kind !== '法宝') return m;
    const power = treasurePower(it, realm);
    if (power !== null && ATTACK_TYPES.has(it.type)) return Math.max(m, power);
    return m;
  }, 1.0);
  return 1 / best;
}
// 连续闭关收益递减（第1次满额，之后递减；出游/其它行动会重置）
export function closedDoorMult(streak) {
  const s = streak || 0;
  if (s <= 1) return 1.0;
  if (s === 2) return 0.85;
  if (s === 3) return 0.7;
  return 0.6;
}

// ---------- 重复刷取防护（软墙：防止"为了赢而赢"的最优解腐蚀世界）----------
// 同一行动在最近几个回合内反复出现时，收益递减；叙事由 GM 中立演绎边际递减。
export function normalizeAction(text) {
  return String(text || '').replace(/[\s，。！？、,.!?'"“”‘’：:；;~～\-—_*·…()（）【】\[\]]+/g, '');
}
// 记录本回合行动，返回当前"连续重复"计数（含本次）
export function updateFarmLog(world, text) {
  if (!Array.isArray(world.recentActions)) world.recentActions = [];
  const a = normalizeAction(text) || String(text || '').trim();
  if (!a) return 1;
  world.recentActions.push({ a, turn: world.turn || 0 });
  if (world.recentActions.length > 12) world.recentActions = world.recentActions.slice(-12);
  const window = world.recentActions.slice(-6);
  const repeats = window.filter((x) => x.a === a).length;
  world.farmStreak = Math.max(1, repeats);
  return world.farmStreak;
}
// 重复刷取收益倍率（第1次满额，之后递减到 0.6 保底）
export function farmMult(streak) {
  const s = streak || 1;
  if (s <= 1) return 1.0;
  if (s === 2) return 0.85;
  if (s === 3) return 0.7;
  return 0.6;
}

// 物品数量变更（共享：itemChanges 与 retract 补回都用它）
// 数量规范化：丹药/法宝/武器/衣物必须为整数；天材地宝/材料允许半份（0.5 步进）
function applyItemChange(world, ch, rawDelta) {
  const desc = ch.desc || '';
  const known = treasureByName(ch.name); // 名录里的法宝：品阶/词条由表定，不由模型说了算
  const mat = known ? null : materialByName(ch.name); // 名录里的材料：品类与年份由表定
  const kind = known ? '法宝' : (mat ? '材料' : (ch.kind || kindFromText(ch.name, desc)));
  if (!isSafeNumber(rawDelta)) return false;
  let delta = rawDelta;
  if (delta !== 0) {
    const step = (kind === '天材地宝' || kind === '材料') ? 0.5 : 1;
    delta = delta > 0 ? Math.max(step, Math.round(delta / step) * step) : Math.min(-step, Math.round(delta / step) * step);
  }
  const grade = known ? '' : (ch.grade || '');
  const rarity = ch.rarity || '凡品';
  const affix = known ? known.affix : (ch.affix || '');
  let inv = world.inventory.find((t) => t.name === ch.name);
  if (!isSafeNumber(delta) || !isSafeNumber((inv ? inv.qty : 0) + delta)) return false;
  if (delta > 0 && !world.items.some((t) => t.name === ch.name)) {
    world.items.push({ name: ch.name, desc, kind, rarity, affix }); // 图鉴永久记录
  }
  if (delta > 0) {
    if (!inv) {
      inv = { name: ch.name, desc: desc || (known ? known.desc : ''), qty: 0, kind, grade, rarity, affix };
      if (known) { inv.tier = known.tier; inv.type = known.type; }
      if (mat) { inv.matKind = mat.kind; inv.matTier = materialTier(mat); inv.element = mat.element; inv.year = mat.year; }
      world.inventory.push(inv);
    } else {
      inv.desc = inv.desc || desc;
      inv.kind = inv.kind || kind;
      inv.grade = inv.grade || grade;
      inv.rarity = inv.rarity || rarity;
      inv.affix = inv.affix || affix;
      if (known && !inv.tier) { inv.tier = known.tier; inv.type = known.type; }
      if (mat && !inv.matTier) { inv.matKind = mat.kind; inv.matTier = materialTier(mat); inv.element = mat.element; inv.year = mat.year; }
    }
    inv.qty += delta;
  } else if (inv) {
    inv.qty += delta;
    if (inv.qty <= 0) world.inventory = world.inventory.filter((t) => t.name !== ch.name);
  }
  return true;
}

// NPC 性格揭示阶段：陌生（未明）→ 初识（气质）→ 深交（真实性格）
export function npcInsightStage(npc) {
  if (!npc) return 'unknown';
  if (npc.personalityRevealed && npc.personality) return 'insight';
  if ((npc.interactionCount || 0) >= 1 && npc.temperament) return 'acquaintance';
  return 'unknown';
}

// ---------- 关系档案（防 GM 遗忘长期感情线/人物脉络）----------
// 与人物/势力的关系里程碑作为一等公民存储：关系变化 + 带关系性质的事迹
const RELATION_WORDS = /道侣|双修|夫妻|成婚|定情|暧昧|倾心|爱慕|求婚|表白|结义|拜师|师徒|挚友|知己|结仇|仇敌|和解|恩人|追随|投靠|效忠|提亲/;
function maintainRelationDossier(world, out, eventTurn) {
  if (!world.relationDossier) world.relationDossier = {};
  const countedThisTurn = new Set(); // 同回合同一 NPC 互动只计一次
  const countInteraction = (name) => {
    if (!name || countedThisTurn.has(name)) return;
    const npc = (world.npcs || []).find((n) => n.name === name);
    if (npc) {
      npc.interactionCount = (npc.interactionCount || 0) + 1;
      countedThisTurn.add(name);
    }
  };
  const push = (name, rel, title, note) => {
    if (!name) return;
    const stored = hasOwn(world.relationDossier, name) ? world.relationDossier[name] : null;
    const entry = isPlainRecord(stored) && Array.isArray(stored.milestones) ? stored : (world.relationDossier[name] = { relation: '', milestones: [] });
    if (rel) entry.relation = rel;
    const ms = entry.milestones;
    if (ms.length && ms[ms.length - 1].turn === eventTurn && ms[ms.length - 1].title === title) return; // 同回合去重
    ms.push({ turn: eventTurn, title, note: (note || '').slice(0, 60) });
    if (ms.length > 12) ms.splice(1, ms.length - 12); // 保留首个（初遇/初见）+ 最近 11 个
  };
  if (Array.isArray(out.npcRelations)) {
    for (const nr of out.npcRelations) {
      if (!nr || !nr.name || !nr.relation) continue;
      const resolved = resolveStateAlias(world, nr.name);
      const stored = hasOwn(world.relationDossier, resolved) ? world.relationDossier[resolved] : null;
      const entry = isPlainRecord(stored) && Array.isArray(stored.milestones) ? stored : (world.relationDossier[resolved] = { relation: '', milestones: [] });
      if (entry.relation === nr.relation) continue; // 关系未变化，不重复记里程碑
      push(resolved, nr.relation, '关系：' + nr.relation, '');
      countInteraction(resolved);
    }
  }
  if (Array.isArray(out.newEvents)) {
    for (const ev of out.newEvents) {
      if (!ev || !ev.title) continue;
      const rawSubject = typeof ev.subject === 'string' ? ev.subject.trim() : '';
      if (!rawSubject || rawSubject === 'undefined' || rawSubject === 'null') continue;
      const subject = resolveStateAlias(world, rawSubject);
      const isNpc = (world.npcs || []).some((n) => n.name === subject);
      const relEvent = ev.relation && RELATION_WORDS.test(String(ev.relation));
      if (isNpc) countInteraction(subject);
      if (isNpc || relEvent) push(subject, ev.relation || '', ev.title, ev.desc || '');
    }
  }
}
// 快照用的精简关系档案（活跃关系优先；无档案时返回 undefined，省 token）
export function compactDossier(world) {  const d = world && world.relationDossier;
  if (!d) return undefined;
  const entries = Object.entries(d)
    .map(([name, e]) => ({ name, rel: e.relation || '', milestones: (e.milestones || []).slice(-6) }))
    .filter((e) => e.milestones.length > 0);
  if (!entries.length) return undefined;
  const active = /道侣|双修|夫妻|暧昧|倾心|爱慕|师徒|结义|挚友/;
  entries.sort((a, b) => {
    const aa = active.test(a.rel) ? 0 : 1;
    const bb = active.test(b.rel) ? 0 : 1;
    if (aa !== bb) return aa - bb;
    const ta = a.milestones[a.milestones.length - 1].turn || 0;
    const tb = b.milestones[b.milestones.length - 1].turn || 0;
    return tb - ta;
  });
  return entries.slice(0, 8).map((e) => ({
    name: e.name,
    rel: e.rel,
    ms: e.milestones.map((m) => ({ t: m.turn, x: (m.title || '').slice(0, 16), n: (m.note || '').slice(0, 40) })),
  }));
}

// 势力阵营立场：正道 / 魔道 / 中立（优先显式字段 → 名字关键字 → 描述自指措辞）
export function factionAlignment(faction) {
  if (faction && faction.alignment && ['正道', '魔道', '中立'].includes(faction.alignment)) return faction.alignment;
  const name = (faction && faction.name) || '';
  if (/魔/.test(name)) return '魔道';
  if (/仙|神|圣/.test(name)) return '正道';
  const desc = (faction && faction.desc) || '';
  if (/魔道.*(之首|势力|宗门|大派|之一|之最)|魔门|魔宗|魔教|魔修/.test(desc)) return '魔道';
  if (/正道.*(六宗|之首|势力|宗门|大派|之一)|名门正派|仙门|仙宗/.test(desc)) return '正道';
  return '中立';
}

// ---------- 自动命名（身份代称 → 随机姓名，血缘同姓）----------
export const SURNAMES = [
  // 单姓
  '云', '风', '林', '萧', '苏', '沈', '顾', '秦', '叶', '柳', '陆', '江', '楚', '白', '墨', '洛', '温', '谢', '韩', '裴',
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '杨', '朱', '许', '何', '吕', '张', '孔', '曹', '严', '华',
  '金', '魏', '陶', '姜', '范', '彭', '郎', '鲁', '韦', '马', '苗', '方', '俞', '任', '袁', '唐', '薛', '雷', '贺', '倪',
  '汤', '殷', '罗', '郝', '安', '常', '乐', '傅', '康', '伍', '余', '元', '孟', '黄', '穆', '尹', '姚', '邵', '汪', '毛',
  '米', '戴', '谈', '宋', '庞', '熊', '纪', '舒', '屈', '项', '祝', '董', '梁', '杜', '阮', '蓝', '闵', '贾', '童', '颜',
  '郭', '梅', '钟', '徐', '邱', '骆', '高', '夏', '蔡', '田', '樊', '胡', '凌', '霍', '柯', '管', '卢', '莫', '丁', '邓',
  '洪', '包', '左', '石', '崔', '龚', '程', '邢', '荣', '翁', '荀', '甄', '封', '靳', '焦', '侯', '仲', '伊', '宫', '宁',
  '仇', '栾', '甘', '厉', '祖', '武', '刘', '景', '詹', '束', '龙', '幸', '黎', '薄', '印', '宿', '怀', '蒲', '从', '索',
  '赖', '卓', '蔺', '屠', '蒙', '池', '乔', '阴', '胥', '苍', '双', '闻', '党', '翟', '谭', '贡', '劳', '姬', '申', '扶',
  '冉', '雍', '桑', '桂', '濮', '牛', '寿', '通', '边', '扈', '燕', '冀', '尚', '农', '别', '庄', '晏', '柴', '瞿', '阎',
  '充', '连', '茹', '艾', '鱼', '容', '向', '古', '易', '慎', '戈', '廖', '终', '居', '衡', '步', '都', '耿', '满', '弘',
  '匡', '国', '文', '寇', '广', '禄', '阙', '东', '欧', '利', '蔚', '越', '隆', '师', '巩', '聂', '晁', '勾', '敖', '融',
  '冷', '辛', '阚', '那', '简', '饶', '空', '曾', '沙', '养', '鞠', '须', '丰', '巢', '关', '蒯', '相', '查', '后', '荆',
  '游', '竺', '权', '逯', '盖', '益', '桓', '公',
  // 复姓
  '慕容', '上官', '独孤', '东方', '南宫', '司徒', '端木', '夏侯', '欧阳', '皇甫', '尉迟', '公孙', '令狐', '司马', '宇文',
  '长孙', '赫连', '完颜', '拓跋', '纳兰', '钟离', '诸葛', '澹台', '公冶', '太史', '申屠', '轩辕', '闻人', '第五',
];
export const GIVEN_NAMES = [
  '清尘', '长歌', '无咎', '青梧', '铁山', '若雪', '寒江', '子衿', '凌云', '惊鸿', '照夜', '明月', '星辰', '怀瑾', '晚晴',
  '归尘', '青冥', '雪衣', '长风', '慕白', '听澜', '夜白', '离歌', '墨羽', '疏影', '一诺', '千帆', '望舒', '扶摇', '无涯',
  '天问', '逍遥', '沧浪', '碧落', '飞雪', '落霞', '孤鸿', '惊雷', '破军', '贪狼', '七杀', '天枢', '北辰', '紫微', '太虚',
  '玄冥', '赤霄', '青阳', '素问', '灵均', '伯牙', '子期', '念之', '忘川', '彼岸', '浮生', '若梦', '如烟', '青黛', '红拂',
  '绿绮', '紫衣', '白衣', '玄衣', '青衣', '红衣', '暮云', '朝露', '白露', '寒露', '霜降', '惊蛰', '谷雨', '长庚', '启明',
  '荧惑', '岁星', '太白', '辰星', '天狼', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光', '青鸾', '白泽', '麒麟', '朱雀',
  '玄武', '青龙', '白虎', '尘', '霜', '雪', '月', '星', '辰', '玄', '冥', '霄', '岚', '渊', '澈', '珩', '玦', '瑜', '瑾',
  '璎', '琮', '琉', '璃', '烟', '曦', '露', '澜',
];
const IDENTITY_WORDS = ['掌柜', '道人', '樵夫', '老者', '少年', '妇人', '姑娘', '婆婆', '师傅', '师父', '弟子', '长老', '掌门', '和尚', '乞丐', '商贩', '剑客', '刀客', '猎户', '渔夫', '农夫', '郎中', '书生', '老头', '汉子', '丫头', '公子', '小姐', '大人', '前辈', '老翁', '老妪', '壮汉', '头领', '首领', '寨主', '帮主', '教主', '护法', '供奉'];

export function isIdentityName(name) {
  if (!name) return true;
  const n = String(name).trim();
  if (n.length > 3) return true;
  return IDENTITY_WORDS.some((w) => n.includes(w));
}

function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function surnameOf(name) {
  if (!name) return '';
  const sorted = [...SURNAMES].sort((a, b) => b.length - a.length); // 复姓优先匹配
  for (const s of sorted) {
    if (name.startsWith(s)) return s;
  }
  return '';
}

export function generateName(surname) {
  return (surname || randPick(SURNAMES)) + randPick(GIVEN_NAMES);
}

// 给新 NPC 自动命名：身份代称→随机姓名；血缘关系保证同姓
export function autoNameNpcs(world, newNpcs) {
  const aliasMap = world.aliasMap || (world.aliasMap = {});
  const nameMap = Object.create(null); // 原始称呼 -> 最终姓名，不能误读继承属性
  for (const n of newNpcs) {
    if (!n || !n.name) continue;
    const raw = String(n.name).trim();
    if (hasOwn(aliasMap, raw) && typeof aliasMap[raw] === 'string') { nameMap[raw] = aliasMap[raw]; continue; }
    nameMap[raw] = isIdentityName(raw) ? generateName() : raw;
  }
  // 血缘同姓：family.of 指向的人已有姓名，则用其姓重新生成
  for (const n of newNpcs) {
    if (!n || !n.name || !n.family) continue;
    const raw = String(n.name).trim();
    const of = n.family.of;
    if (!of) continue;
    const kinFinal = nameMap[of] || (hasOwn(aliasMap, of) && typeof aliasMap[of] === 'string' ? aliasMap[of] : '') || (world.npcs.find((x) => x.name === of) || {}).name || '';
    const s = surnameOf(kinFinal);
    if (s) nameMap[raw] = generateName(s);
  }
  // 回写对照表
  for (const [raw, finalName] of Object.entries(nameMap)) {
    if (raw !== finalName) aliasMap[raw] = finalName;
  }
  return newNpcs.map((n) => {
    if (!n || !n.name) return n;
    const raw = String(n.name).trim();
    const finalName = nameMap[raw] || raw;
    const kinNote = n.family && n.family.of ? `（${n.family.of}的${n.family.relation || '亲人'}）` : '';
    return { name: finalName, desc: (n.desc || '') + kinNote, relation: n.relation || '', kin: n.family || null, temperament: n.temperament || '', personality: n.personality || '', trait: n.trait || '', desire: n.desire || '', taboo: n.taboo || '', speech: n.speech || '', links: Array.isArray(n.links) ? n.links : [] };
  });
}

// ---------- 模型提案边界：只复制已知字段，不信任原型、类型或数值 ----------
const UNSAFE_STATE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ENGINE_FLAGS = new Set(['deathImminent', 'qiDeviation', 'deathByRisk', 'eraExpired', 'goalCompleted']);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isPlainRecord = (value) => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isSafeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
function resolveStateAlias(world, name) {
  return world.aliasMap && hasOwn(world.aliasMap, name) && typeof world.aliasMap[name] === 'string' ? world.aliasMap[name] : name;
}
const ISSUE_MESSAGES = {
  invalid_root: '状态提案必须是普通对象，整份提案未结算。',
  invalid_type: '字段类型或必要内容无效，已忽略。',
  invalid_number: '数值必须有限且在安全范围内，已忽略。',
  forbidden_set: '模型不能直接设置玩家属性，只允许 delta。',
  unsafe_key: '原型保留名称不允许用于状态输入。',
  unknown_field: '未知字段已忽略。',
  terminal_quest: '任务终态不能改写，结构化事迹必须与实际状态一致。',
  conflicting_quest_updates: '同批任务完成与失败冲突，该任务更新全部忽略。',
  numeric_overflow: '运算结果超出安全数值范围，已忽略。',
  forbidden_flag: '代码管理的标记不允许由模型写入或撤回。',
  breakthrough_too_soon: '大境界突破需在本境积累足够岁月，本次未生效（叙事保留，境界不变）。',
};
function stateIssue(issues, code, path) {
  issues.push({ code, path, message: ISSUE_MESSAGES[code] });
}

// out 只包含可消费的结构；无效独立条目不会连带丢弃合法剧情。
export function validateStateOutput(input) {
  const issues = [];
  const issue = (code, path) => stateIssue(issues, code, path);
  if (!isPlainRecord(input)) {
    issue('invalid_root', '$');
    return { out: null, issues };
  }
  const OMIT = Symbol('omit');
  const stringFields = (...keys) => Object.fromEntries(keys.map((key) => [key, 'string']));
  const record = (fields, required = []) => ({ fields, required });
  const array = (item) => ({ array: item });
  const enumeration = (...values) => ({ enum: values });
  const item = record({ name: 'name', ...stringFields('desc', 'affix'), delta: 'number',
    kind: enumeration(...Object.keys(ITEM_KINDS)), grade: enumeration(...Object.keys(SKILL_GRADES)), rarity: enumeration(...Object.keys(RARITIES)) }, ['name', 'delta']);
  const deadlineFields = { deadlineDays: 'deadlineDays', deadlineDate: 'deadlineDate', deadlineTurns: 'deadlineDays' };
  const factionFields = { name: 'name', ...stringFields('desc', 'type'), alignment: enumeration('正道', '魔道', '中立') };
  const schema = {
    ...stringFields('narrative'),
    stateUpdates: 'attributes',
    timeMonths: 'time', travelTo: 'string', gainType: enumeration('righteous', 'plunder', 'neutral'),
    risk: enumeration('none', 'low', 'high', 'lethal'), died: 'boolean',
    realmChange: enumeration(...REALM_LADDER),
    combat: record({ enemy: 'string', realm: enumeration(...REALM_LADDER, '未知') }),
    flags: 'flags',
    newNpcs: array(record({ name: 'name', ...stringFields('desc', 'relation', 'temperament', 'personality', 'trait', 'desire', 'taboo', 'speech'), family: record({ of: 'name', relation: 'string' }, ['of']), links: array(record({ to: 'name', type: 'string', note: 'string', known: 'boolean' }, ['to'])) }, ['name'])),
    newLocations: array(record({ name: 'name', desc: 'string' }, ['name'])),
    newSkills: array(record({ name: 'name', desc: 'string', grade: enumeration(...Object.keys(SKILL_GRADES)) }, ['name'])),
    newEvents: array(record({ subject: 'name', title: 'name', desc: 'string', relation: 'string' }, ['subject', 'title'])),
    factionRelations: array(record({ ...factionFields, relation: enumeration('结盟', '敌对', '中立') }, ['name'])),
    newFactions: array(record(factionFields, ['name'])),
    npcRelations: array(record({ name: 'name', relation: 'string', debt: 'number', grudge: 'number', trust: 'number', need: 'number' }, ['name'])),
    personalityReveals: array(record({ name: 'name' }, ['name'])),
    reveals: array(record({ faction: 'name' }, ['faction'])),
    linkReveals: array(record({ a: 'name', b: 'name', type: 'string' }, ['a', 'b'])),
    treatNpc: array(record({ name: 'name', pill: 'string' }, ['name'])),
    newRecipes: array(record({ name: 'name', pill: 'string', source: 'string' }, ['name'])),
    recipePieces: array(record({ name: 'name', delta: 'number' }, ['name'])),
    brewPills: array(record({ recipe: 'string', pill: 'string', fire: enumeration('真火', '地火') }, ['recipe'])),
    refineTreasure: array(record({ name: 'name' }, ['name'])),
    trades: array(record({ action: enumeration('buy', 'sell'), item: 'name', qty: 'number' }, ['action', 'item'])),
    auctionBids: array(record({ item: 'name', bid: 'number' }, ['item', 'bid'])),
    gather: record({ kind: enumeration('采药', '挖矿', '猎妖'), days: 'number' }, ['kind']),
    plant: record({ material: 'name' }, ['material']),
    tendPlot: record({ id: 'string' }),
    harvestPlot: record({ id: 'string' }),
    setFormation: record({ name: 'name' }, ['name']),
    dismantleFormation: record({ name: 'name' }, ['name']),
    upgradeFormation: record({ name: 'name' }, ['name']),
    breakFormation: record({ name: 'name', method: enumeration('寻阵眼', '以力破阵'), days: 'number' }, ['name']),
    foeFormation: record({ name: 'name', tier: 'string' }, ['name']),
    practiceCraft: record({ skill: enumeration(...CRAFT_NAMES), days: 'number' }, ['skill']),
    studyCraft: record({ skill: enumeration(...CRAFT_NAMES), from: enumeration('师父', '玉简'), secret: 'boolean' }, ['skill']),
    newJadeSlip: record({ name: 'name', skill: enumeration(...CRAFT_NAMES), kind: enumeration('心得', '丹方', '功法', '阵图'), recipe: 'string', grade: enumeration(...Object.keys(SKILL_GRADES)) }, ['skill']),
    craftTalisman: record({ name: 'name' }, ['name']),
    useTalisman: record({ name: 'name' }, ['name']),
    talismanArray: record({ name: 'name' }, ['name']),
    craftInsight: record({ skill: enumeration(...CRAFT_NAMES) }, ['skill']),
    learnTechnique: record({
      name: 'name',
      grade: enumeration(...Object.keys(TECH_GRADES)),
      type: enumeration(...TECH_TYPES),
      element: enumeration('金', '木', '水', '火', '土', '无'),
      desc: 'string',
      requirements: array(record({
        kind: enumeration('realm', 'element', 'physique', 'place', 'item', 'mentor', 'previous', 'cost'),
        value: 'string',
      }, ['kind', 'value'])),
    }, ['name']),
    practiceTechnique: record({ name: 'name', days: 'number' }, ['name']),
    setMainTechnique: record({ name: 'name' }, ['name']),
    awakenRoots: record({ roots: array(enumeration(...ROOT_ELEMENTS, ...MUTANT_ROOTS)) }, ['roots']),
    refineRoots: record({}),
    forge: record({ name: 'name', materials: array('string'), fire: enumeration('真火', '地火') }, ['name']),
    newRegion: record({
      name: 'name', terrain: 'string', qi: 'number', danger: 'number', desc: 'string',
      products: array(enumeration(...Object.keys(RARITIES))),
      links: array(record({ to: 'name', days: 'number' }, ['to', 'days'])),
    }, ['name', 'qi', 'danger']),
    hooks: array(record({ theme: 'string', title: 'string', declined: 'boolean' }, ['theme'])),
    itemChanges: array(item), equipChanges: array(record({ name: 'name', equipped: 'boolean' }, ['name', 'equipped'])),
    goal: record(stringFields('desc', 'type', 'target', 'status')),
    eraChange: record({ type: enumeration(...ERA_LEVELS), text: 'string', months: 'time' }, ['type']),
    newQuests: array(record({ title: 'name', ...stringFields('desc', 'objective', 'timeNode', 'reward'), ...deadlineFields }, ['title'])),
    questUpdates: array(record({ title: 'name', status: enumeration('active', 'completed', 'failed', 'cancelled'), note: 'string', timeNode: 'string', ...deadlineFields }, ['title'])),
    effectRequests: array(record({ name: 'name', desc: 'string' }, ['name'])),
    retract: array(record({ subjects: array('name'), titles: array('name'), flags: array('retractFlag'), items: array(record({ ...item.fields, delta: 'positive' }, ['name', 'delta'])) })),
    ...Object.fromEntries(PLAYER_ATTRS.map((key) => [key, 'attribute'])),
  };
  const normalizeRecord = (value, spec, path) => {
    if (!isPlainRecord(value)) { issue('invalid_type', path); return OMIT; }
    const result = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (UNSAFE_STATE_KEYS.has(key)) { issue('unsafe_key', path); continue; }
      if (!hasOwn(spec.fields, key)) { issue('unknown_field', path); continue; }
      const fieldPath = path === '$' ? key : `${path}.${key}`;
      if (!hasOwn(descriptor, 'value')) { issue('invalid_type', fieldPath); continue; }
      if (path === '$' && descriptor.value === null && ['combat', 'realmChange', 'risk', 'goal', 'eraChange'].includes(key)) continue;
      const normalized = normalize(descriptor.value, spec.fields[key], fieldPath);
      if (normalized !== OMIT) result[key] = normalized;
    }
    for (const key of spec.required || []) {
      if (!hasOwn(result, key) || result[key] === '') { issue('invalid_type', `${path}.${key}`); return OMIT; }
    }
    return result;
  };
  const normalize = (value, spec, path) => {
    if (spec === 'string' || spec === 'name' || spec === 'retractFlag') {
      if (typeof value !== 'string') { issue('invalid_type', path); return OMIT; }
      const text = spec === 'string' ? value : value.trim();
      if (spec !== 'string' && (!text || UNSAFE_STATE_KEYS.has(text))) { issue(UNSAFE_STATE_KEYS.has(text) ? 'unsafe_key' : 'invalid_type', path); return OMIT; }
      if (spec === 'retractFlag' && ENGINE_FLAGS.has(text)) { issue('forbidden_flag', path); return OMIT; }
      return text;
    }
    if (spec === 'boolean') {
      if (typeof value !== 'boolean') { issue('invalid_type', path); return OMIT; }
      return value;
    }
    if (spec === 'number' || spec === 'positive' || spec === 'time' || spec === 'deadlineDays') {
      const valid = isSafeNumber(value) && (spec !== 'time' || (value >= 0 && elapsedGameDays(value) !== null)) &&
        (spec !== 'positive' || value > 0) &&
        (spec !== 'deadlineDays' || (Number.isSafeInteger(value) && value >= 0));
      if (!valid) { issue('invalid_number', path); return spec === 'deadlineDays' ? null : OMIT; }
      return value;
    }
    if (spec === 'deadlineDate') {
      const date = normalizeRecord(value, record({ year: 'number', month: 'number', day: 'number' }, ['year', 'month', 'day']), path);
      if (date === OMIT || gameDateOrdinal(date) === null) { issue('invalid_number', path); return null; }
      return date;
    }
    if (spec === 'attribute') {
      if (typeof value === 'number') return normalize(value, 'number', path);
      if (!isPlainRecord(value)) { issue('invalid_type', path); return OMIT; }
      const delta = normalizeRecord(value, record({ delta: 'number', set: 'forbiddenSet' }), path);
      return delta !== OMIT && hasOwn(delta, 'delta') ? { delta: delta.delta } : OMIT;
    }
    if (spec === 'forbiddenSet') { issue('forbidden_set', path); return OMIT; }
    if (spec === 'attributes') return normalizeRecord(value, record(Object.fromEntries(PLAYER_ATTRS.map((key) => [key, 'attribute']))), path);
    if (spec === 'flags') {
      if (!isPlainRecord(value)) { issue('invalid_type', path); return OMIT; }
      const flags = {};
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (UNSAFE_STATE_KEYS.has(key)) { issue('unsafe_key', path); continue; }
        if (!hasOwn(descriptor, 'value') || typeof descriptor.value !== 'boolean') { issue('invalid_type', path); continue; }
        if (ENGINE_FLAGS.has(key) && !(['deathImminent', 'qiDeviation'].includes(key) && descriptor.value === false)) { issue('forbidden_flag', path); continue; }
        flags[key] = descriptor.value;
      }
      return flags;
    }
    if (spec.array) {
      if (!Array.isArray(value)) { issue('invalid_type', path); return OMIT; }
      const items = [];
      for (const entry of value) {
        const normalized = normalize(entry, spec.array, `${path}[]`);
        if (normalized !== OMIT) items.push(normalized);
      }
      return items;
    }
    if (spec.enum) {
      if (!spec.enum.includes(value)) { issue('invalid_type', path); return OMIT; }
      return value;
    }
    return normalizeRecord(value, spec, path);
  };
  const out = normalizeRecord(input, record(schema), '$');
  // Canonicalize the legacy flat form once, retaining the old preference for stateUpdates.
  if (!hasOwn(out, 'stateUpdates')) {
    const flat = {};
    for (const key of PLAYER_ATTRS) if (hasOwn(out, key)) flat[key] = out[key];
    if (Object.keys(flat).length) out.stateUpdates = flat;
  }
  for (const key of PLAYER_ATTRS) delete out[key];
  return { out, issues };
}

function recordValidation(world, out, issues) {
  if (!issues.length) return;
  if (!Array.isArray(world.validationLog)) world.validationLog = [];
  world.validationLog.push({ turn: (world.turn || 0) + 1, result: out === null ? 'rejected' : 'partial', issues: issues.slice(0, 10).map(({ code, path, message }) => ({ code, path, message })) });
  if (world.validationLog.length > 30) world.validationLog.splice(0, world.validationLog.length - 30);
}

// ---------- 状态合并 ----------
export function applyStateUpdates(player, world, input, report = {}) {
  const validated = validateStateOutput(input);
  const out = validated.out;
  const issues = validated.issues;
  report.out = out;
  report.issues = issues;
  if (out === null) { recordValidation(world, out, issues); return null; }
  const reject = (code, path) => stateIssue(issues, code, path);
  const currentDate = worldGameDate(world);
  if (out.timeMonths !== undefined && currentDate && !addGameDays(currentDate, elapsedGameDays(out.timeMonths))) {
    reject('numeric_overflow', 'timeMonths');
    delete out.timeMonths;
  }
  if (out.eraChange && out.eraChange.months > 0) {
    const deadline = currentDate && addMonths(currentDate, out.eraChange.months);
    if (gameDateOrdinal(deadline) === null) {
      reject('numeric_overflow', 'eraChange.months');
      delete out.eraChange.months;
    }
  }
  // 行路：抵达另一区域时，耗时由路程表决定，覆盖模型自报的 timeMonths（防止虚构距离）
  let travelNote = '';
  let revealNote = '';
  let interruptNote = '';
  let treatNote = '';
  let regionNote = '';
  // 闭关被打断：把时长压到"出岔子那一年"，收益随之减少
  if (world.pendingInterrupt && out.flags && out.flags.closedDoor) {
    const p = world.pendingInterrupt;
    const guards = world.guardiansThisTurn || [];
    const cap = p.afterYears * 12;
    if (!Number.isFinite(out.timeMonths) || out.timeMonths > cap) out.timeMonths = cap;
    const guardNote = guards.length ? `（${guards.join('、')} 替你挡下第一波）` : '';
    const injured = [];
    for (const name of guards) {
      const npc = (world.npcs || []).find((n) => n.name === name);
      if (!npc) continue;
      npc.bond = { ...bondOf(npc), trust: clampBond(bondOf(npc).trust + 5) };
      // 挡灾要付代价：心魔伤神，人祸伤身；三个月内不能再来护法
      const hurt = /心魔/.test(p.by) ? '心神受损' : '负伤';
      npc.condition = { state: hurt, untilMonth: monthOrdinal(world.date) + 3 };
      injured.push(`${name}${hurt}`);
    }
    interruptNote = `【闭关被打断】第 ${p.afterYears} 年，${p.by} 找上门${guardNote}，你被迫提前出关${injured.length ? `；${injured.join('、')}，需调养三个月` : ''}。`;
    addChronicleEvent(world, player, p.by, '闭关受扰', `闭关第 ${p.afterYears} 年被打断`, '');
  }
  if (typeof out.travelTo === 'string' && out.travelTo.trim()) {
    const target = regionByName(out.travelTo);
    const cur = world.geo ? regionById(world.geo.regionId) : null;
    if (target && (!cur || target.id !== cur.id)) {
      const travelFx = formationEffects((world.formations || []).filter((f) => !cur || f.region === cur.id), world);
      const travelBuff = talismanBuffFx(world).fx.travelMult * rootTraits(player).travelMult;
      const moved = moveToRegion(world, target.id);
      if (moved) {
        const days = Math.max(1, Math.round(moved.days * travelFx.travelMult * travelBuff));
        const months = Math.round((days / 30) * 1000) / 1000;
        const anchor = worldGameDate(world);
        if (!anchor || addGameDays(anchor, elapsedGameDays(months))) {
          out.timeMonths = months;
          const via = travelFx.travelMult < 1 ? '，借传送阵' : '';
          travelNote = `【行路】${moved.from.name} → ${moved.to.name}（${days} 日，约 ${months.toFixed(2)} 月${via}）`;
        }
      }
    }
    delete out.travelTo; // 只用于结算，不落到前端状态
  }
  // 新区域：模型只能提议，能否入图按《区域生成标准》判定（不合格按条拒绝，叙事保留）
  if (out.newRegion && typeof out.newRegion === 'object') {
    const res = addRegion(world, out.newRegion);
    if (res.ok) {
      regionNote = res.note;
    } else {
      issues.push({ code: 'region_invalid', path: 'newRegion', message: `新域不合标准：${(res.issues || []).join('；')}` });
    }
    delete out.newRegion;
  }
  if (out.combat && !out.combat.enemy && !out.combat.realm) delete out.combat;
  migrateQuestDeadlines(world);
  const s = world.settings || {};
  const god = s.godMode === true; // 言出法随（外挂模式）：不受伤害、不掷死亡骰
  const formationFx = formationEffects(world.formations || [], world); // 已布之阵的合计效果（取最强不叠加，大阵吃地脉涨落）
  // 功法：主修吃修炼倍率，其余（炼体/剑诀/神识）吃各自那一摊
  const techFx = techniqueEffects(player.techniques || []);
  const mainTechName = player.mainTechnique;
  const mainTechEntry = mainTechName ? (player.techniques || []).find((t) => t.name === mainTechName) : null;
  const mainTechDef = mainTechName ? techniqueByName(mainTechName) : null;
  const techCultMult = (mainTechDef && mainTechEntry) ? (techniqueEffect(mainTechDef, mainTechEntry.layer || 1).cultMult || 1) : 1;
  // 符箓的短时符力（过期即散；多张并存相乘）
  // 异灵根的偏长（雷伤敌、冰护体、风赶路、暗破禁）
  const rootFx = rootTraits(player);
  const buffFx = talismanBuffFx(world).fx;
  const diff = DIFFICULTIES[s.difficulty] || DIFFICULTIES['普通'];
  const pace = PACES[s.pace] || PACES['慢'];
  const eventTurn = (world.turn || 0) + 1;
  const eventDate = (world.date && world.date.year) ? `${world.date.year}年${world.date.month}月${world.date.day || 1}日` : '';

  let su = out.stateUpdates;
  if (!su || typeof su !== 'object' || Array.isArray(su)) {
    // 防御：提取器若把属性平铺在顶层（如 {"spiritStones":30}），也接受
    su = {};
    for (const key of PLAYER_ATTRS) {
      if (out[key] !== undefined) su[key] = out[key];
    }
  }
  // AI 只能提出 delta；直接赋值在统一入口已拒绝。
  const repMult = reputationMultiplier(player.reputation);
  const intensity = MORALITY_INTENSITY[s.difficulty] ?? 0.2;
  const gainMult = moralityGainMultiplier(player.morality, out.gainType, intensity);
  const fortuneMult = fortuneMultiplier(player.morality, intensity) + (activeHas(world.inventory, 'fortune') ? AFFIX_REGISTRY['气运'].fx.fortune : 0); // 气运词条
  const era = ERA_TYPES[world.eraType] || { gainMult: 1, dangerMult: 1, cultMult: 1 };
  const closeMonths = (typeof out.timeMonths === 'number' && out.timeMonths > 0) ? Math.min(out.timeMonths, 600) : 1; // 闭关时长放大修为，上限600月(50年)，"闭关十年"如实生效
  const cultGain = cultGainMult(s.cultGain); // 玩家可控修为增益
  const skillMult = (world.skills || []).reduce((m, s) => Math.max(m, gradeMult(s.grade)), 1.0); // 功法品阶加成
  // 修炼倍率只取"已装备"物品（功能法宝常驻但不给修炼加成，取其最强者防叠加）
  const equippedCult = (world.inventory || []).filter((it) => it.equipped && !isFunctionalTreasure(it));
  const treasureMult = equippedCult.reduce((m, it) => Math.max(m, treasureCultMult(it, player)), 1.0); // 已装备法宝：名录按阶位+修为驱动，名录外按品阶
  const rarityCultMult = equippedCult.filter((it) => !it.tier).reduce((m, it) => Math.max(m, rarityMult(it.rarity)), 1.0); // 稀有度只作用于名录外的旧式装备，避免与阶位重复计算
  const affixCultMult = equippedCult.reduce((m, it) => Math.max(m, affixEffects(it.affix).cultMult), 1.0); // 修行词条加成
  const affixDefMult = activeItems(world.inventory).reduce((m, it) => Math.min(m, affixEffects(it.affix).defMult), 1.0); // 词条减伤（含常驻法宝）
  const qiDevMult = world.flags.qiDeviation ? 0.7 : 1.0; // 走火入魔：修炼收益打折
  const relationMult = relationCultMult(world.npcs); // 亲密关系加成（道侣/师徒/挚友）
  const factionMult = factionCultMult(world.factions); // 结盟势力加成
  const wealthMult = activeHas(world.inventory, 'wealth') ? AFFIX_REGISTRY['聚财'].fx.wealth : 1; // 聚财词条
  const prestigeMult = activeHas(world.inventory, 'prestige') ? AFFIX_REGISTRY['威仪'].fx.prestige : 1; // 威仪词条
  // 战斗（轻量版）：提取敌人境界，按境界差决定伤害/生还
  const combat = out.combat && typeof out.combat === 'object' ? out.combat : null;
  let realmDiff = (combat && combat.realm) ? combatDiff(player.realm, combat.realm) : 0;
  if (combat && realmDiff > 0 && activeHas(world.inventory, 'edge')) realmDiff -= 1; // 锋芒词条：敌人境界按低一阶计
  const equipDef = equipDefenseMult(world.inventory, player); // 装备防御：衣物/法宝减伤
  const equipAtk = equipAttackMult(world.inventory, player);  // 装备攻击：武器/攻击型法宝降低致死
  // 连续闭关递减：本回合是否闭关修炼（提取器在 flags.closedDoor 标记）
  const closedDoor = !!(out.flags && out.flags.closedDoor);
  if (closedDoor) world.closedStreak = (world.closedStreak || 0) + 1;
  else world.closedStreak = 0;
  const closedMult = closedDoorMult(world.closedStreak);
  const farm = god ? 1.0 : farmMult(world.farmStreak); // 重复刷取收益递减（言出法随豁免）
  // 丹药：效果由系统按丹方结算（抗药性 / 跨境失效），模型不再自己给药效数值
  const consumedPills = [];
  for (const ch of Array.isArray(out.itemChanges) ? out.itemChanges : []) {
    if (!ch || !ch.name || typeof ch.delta !== 'number' || ch.delta >= 0) continue;
    const pill = pillByName(ch.name);
    if (pill) consumedPills.push({ pill, name: ch.name, times: Math.max(1, Math.floor(-ch.delta)) });
  }
  const pillApplied = consumedPills.length > 0;
  let hpLost = 0;
  let reviveNote = '';
  for (const key of PLAYER_ATTRS) {
    const u = su[key];
    if (!u) continue;
    let delta;
    if (typeof u === 'number') delta = u;
    else if (typeof u.delta === 'number') delta = u.delta;
    else continue;
    // 本回合服了丹：气血/修为的正增量交给系统按丹方结算，避免模型重复加一遍
    if (pillApplied && (key === 'hp' || key === 'cultivation') && delta > 0) continue;
    if (key === 'hp' && delta < 0) { if (god) delta = 0; else delta = Math.round(delta * diff.damageMult * era.dangerMult * (combat ? combatDamageMult(realmDiff) : 1) * (combat ? equipDef : 1) * (combat ? affixDefMult : 1) * formationFx.damageTaken * buffFx.damageTaken * (techFx.damageTaken || 1) * rootFx.damageTaken); } // 言出法随免伤；否则难度+大势+境界差+装备防御+词条+护山阵+符力+炼体+灵根
    if (key === 'cultivation' && delta > 0) {
      const mults = pace.cultivationMult * fortuneMult * era.cultMult * skillMult * treasureMult * rarityCultMult * affixCultMult * relationMult * factionMult * cultGain * closedMult * qiDevMult * farm * formationFx.cultMult * techCultMult * rootCultMult(player) * regionCultMult(world); // 再加聚灵阵、主修功法、灵根资质与所在地上灵气
      if (closedDoor) {
        // 闭关：修为按时长结算，模型给的 delta 只当效率提示（不再 ×closeMonths，避免一次闭关灌满）
        delta = Math.round(seclusionGain(player.realm, out.timeMonths, delta) * mults * 100) / 100;
      } else {
        delta = Math.round(delta * mults * closeMonths); // 非闭关：顿悟/任务等一次性收益，仍按时长放大
      }
    }
    if (key === 'spiritStones' && delta > 0) delta = Math.round(delta * repMult * gainMult * era.gainMult * diff.gainMult * farm * wealthMult);         // 声望 + 正邪 + 大势 + 难度 + 防刷 + 聚财
    if (key === 'reputation' && delta > 0) delta = Math.round(delta * prestigeMult); // 威仪词条：声望正增长加成
    const next = player[key] + delta;
    if (!isSafeNumber(delta) || !isSafeNumber(next)) {
      reject('numeric_overflow', `stateUpdates.${key}`);
      delete su[key];
      continue;
    }
    player[key] = next;
    if (key === 'hp' && delta < 0) hpLost += -delta;
  }

  // 服丹结算：品阶 × 适用境界 × 抗药性（原文第 243、598 章）
  const pillNotes = [];
  for (const { pill, name, times } of consumedPills) {
    if (!player.pillUsage) player.pillUsage = {};
    const used = Number(player.pillUsage[pill.id] || 0);
    const eff = pillEffect(player.realm, pill, used);
    if (!eff.works) {
      pillNotes.push(`【丹药】${name}：丹力对你已无用处（高出适用境界一个大境界以上）。`);
      continue;
    }
    const bits = [];
    if (eff.hp > 0) { player.hp = Math.min(player.maxHp, player.hp + eff.hp); bits.push(`气血+${eff.hp}`); }
    if (eff.cult > 0) { player.cultivation += eff.cult; bits.push(`修为+${eff.cult}`); }
    if (eff.life > 0) { player.lifespan += eff.life; bits.push(`寿元+${eff.life}`); }
    player.pillUsage[pill.id] = used + times;
    player.pillUsageMonth = monthOrdinal(world.date);
    const resist = eff.factor < 0.9 ? `（抗药性 ×${eff.factor}）` : '';
    pillNotes.push(`【丹药】${name}：${bits.length ? bits.join('，') : '并无实效'}${resist}`);
  }
  // 采集：采药/挖矿/猎妖，按区域与境界出货，耗时与风险由系统结算
  if (out.gather && typeof out.gather === 'object') {
    const g = gatherMaterials(world, player, out.gather);
    if (!g.ok) {
      pillNotes.push(`【采集】${g.reason}`);
    } else {
      if (g.days) out.timeMonths = Math.max(Number(out.timeMonths) || 0, Math.round((g.days / 30) * 100) / 100);
      pillNotes.push(g.note);
    }
    delete out.gather;
  }
  // 灵田/矿脉：开垦、照料、收成
  if (out.plant && typeof out.plant === 'object') {
    const r = plantPlot(world, player, out.plant);
    pillNotes.push(r.note || `【开垦】${r.reason}`);
    delete out.plant;
  }
  if (out.tendPlot && typeof out.tendPlot === 'object') {
    const r = tendPlot(world, player, out.tendPlot);
    pillNotes.push(r.note || `【照料】${r.reason}`);
    delete out.tendPlot;
  }
  if (out.harvestPlot && typeof out.harvestPlot === 'object') {
    const r = harvestPlot(world, player, out.harvestPlot);
    pillNotes.push(r.note || `【收成】${r.reason}`);
    delete out.harvestPlot;
  }
  // 阵法：布阵 / 撤阵 / 加固 / 破阵
  if (out.foeFormation && typeof out.foeFormation === 'object') {
    if (!Array.isArray(world.foeFormations)) world.foeFormations = [];
    const n = String(out.foeFormation.name || '').trim();
    if (n && !world.foeFormations.some((f) => f.name === n)) {
      world.foeFormations.push({ name: n, tier: out.foeFormation.tier || '三级' });
    }
    delete out.foeFormation;
  }
  if (out.setFormation && typeof out.setFormation === 'object') {
    const r = setFormation(world, player, out.setFormation);
    pillNotes.push(r.note || `【布阵】${r.reason}`);
    delete out.setFormation;
  }
  if (out.dismantleFormation && typeof out.dismantleFormation === 'object') {
    const r = dismantleFormation(world, player, out.dismantleFormation);
    pillNotes.push(r.note || `【撤阵】${r.reason}`);
    delete out.dismantleFormation;
  }
  if (out.upgradeFormation && typeof out.upgradeFormation === 'object') {
    const r = upgradeFormation(world, player, out.upgradeFormation);
    pillNotes.push(r.note || `【加固】${r.reason}`);
    delete out.upgradeFormation;
  }
  if (out.breakFormation && typeof out.breakFormation === 'object') {
    const r = breakFormation(world, player, out.breakFormation);
    pillNotes.push(r.note || `【破阵】${r.reason}`);
    if (r.days) out.timeMonths = Math.max(Number(out.timeMonths) || 0, Math.round((r.days / 30) * 1000) / 1000);
    delete out.breakFormation;
  }
  // 四艺：修习 / 求教 / 玉简 / 制符 / 用符
  if (out.practiceCraft && typeof out.practiceCraft === 'object') {
    const r = practiceCraft(world, player, out.practiceCraft);
    pillNotes.push(r.note || `【修习】${r.reason}`);
    if (r.days) out.timeMonths = Math.max(Number(out.timeMonths) || 0, Math.round((r.days / 30) * 1000) / 1000);
    delete out.practiceCraft;
  }
  if (out.studyCraft && typeof out.studyCraft === 'object') {
    const r = studyCraft(world, player, out.studyCraft);
    pillNotes.push(r.note || `【求教】${r.reason}`);
    delete out.studyCraft;
  }
  if (out.newJadeSlip && typeof out.newJadeSlip === 'object') {
    const r = addJadeSlip(world, out.newJadeSlip);
    pillNotes.push(r.note || `【玉简】${r.reason}`);
    delete out.newJadeSlip;
  }
  if (out.craftTalisman && typeof out.craftTalisman === 'object') {
    const r = craftTalisman(world, player, out.craftTalisman);
    pillNotes.push(r.note || `【制符】${r.reason}`);
    delete out.craftTalisman;
  }
  if (out.useTalisman && typeof out.useTalisman === 'object') {
    const r = useTalisman(world, player, out.useTalisman);
    pillNotes.push(r.note || `【用符】${r.reason}`);
    delete out.useTalisman;
  }
  if (out.talismanArray && typeof out.talismanArray === 'object') {
    const r = setTalismanArray(world, player, out.talismanArray);
    pillNotes.push(r.note || `【符阵】${r.reason}`);
    delete out.talismanArray;
  }
  if (out.craftInsight && typeof out.craftInsight === 'object') {
    const r = craftInsight(world, player, out.craftInsight);
    pillNotes.push(r.note || `【顿悟】${r.reason}`);
    delete out.craftInsight;
  }
  // 功法：学、练、择主修
  if (out.learnTechnique && typeof out.learnTechnique === 'object') {
    const r = learnTechnique(world, player, out.learnTechnique);
    pillNotes.push(r.note || `【得法】${r.reason}`);
    delete out.learnTechnique;
  }
  if (out.practiceTechnique && typeof out.practiceTechnique === 'object') {
    const r = practiceTechnique(world, player, out.practiceTechnique);
    pillNotes.push(r.note || `【修功】${r.reason}`);
    if (r.days) out.timeMonths = Math.max(Number(out.timeMonths) || 0, Math.round((r.days / 30) * 1000) / 1000);
    delete out.practiceTechnique;
  }
  if (out.setMainTechnique && typeof out.setMainTechnique === 'object') {
    const r = setMainTechnique(world, player, out.setMainTechnique);
    pillNotes.push(r.note || `【主修】${r.reason}`);
    delete out.setMainTechnique;
  }
  if (out.awakenRoots && typeof out.awakenRoots === 'object') {
    const r = awakenRoots(world, player, out.awakenRoots);
    pillNotes.push(r.note || `【测灵根】${r.reason}`);
    delete out.awakenRoots;
  }
  if (out.refineRoots && typeof out.refineRoots === 'object') {
    const r = refineRoots(world, player, out.refineRoots);
    pillNotes.push(r.note || `【洗炼】${r.reason}`);
    delete out.refineRoots;
  }
  // 炼器：五行配材，成败由系统掷（名录外的器物炼不出来）
  if (out.forge && typeof out.forge === 'object') {
    const f = forgeTreasure(world, player, out.forge);
    pillNotes.push(f.note || `【炼器】${f.reason}`);
    delete out.forge;
  }
  // 开炉炼丹：丹方 + 材料 + 火源，成败由系统掷
  if (Array.isArray(out.brewPills)) {
    for (const b of out.brewPills) {
      if (!b) continue;
      const res = brewPill(world, player, b);
      pillNotes.push(res.note || `【炼丹】${res.reason}`);
    }
  }
  // 交易：丹药/丹方按区域物价与声望议价结算，钱货两清
  if (Array.isArray(out.trades)) {
    for (const t of out.trades) {
      if (!t) continue;
      const res = tradeItem(world, player, t);
      pillNotes.push(res.note || `【交易】${res.reason}`);
    }
  }
  // 拍卖：举牌竞价，价高者得；没拍到不扣钱
  if (Array.isArray(out.auctionBids)) {
    for (const b of out.auctionBids) {
      if (!b) continue;
      const res = auctionBid(world, player, b);
      pillNotes.push(res.note || `【拍卖】${res.reason}`);
    }
  }
  // 以丹养伤：给受伤的护法疗伤，缩短调养时间
  if (Array.isArray(out.treatNpc)) {
    for (const t of out.treatNpc) {
      if (!t || !t.name) continue;
      const npc = (world.npcs || []).find((n) => n.name === t.name);
      const pill = pillByName(t.pill || '');
      if (!npc || !npc.condition || !pill || !pill.healMonths) continue;
      const eff = pillEffect(player.realm, pill, 0);
      if (!eff.works) continue;
      const now = monthOrdinal(world.date);
      const cut = Math.round(eff.healMonths * 30);
      npc.condition.untilMonth = Math.max(now, npc.condition.untilMonth - cut);
      if (npc.condition.untilMonth <= now) delete npc.condition;
      treatNote = `【以丹养伤】你用${pill.name}为${npc.name}疗伤，调养时间缩短约 ${Math.max(1, Math.round(eff.healMonths))} 个月${npc.condition ? '，仍需静养' : '，已然痊愈'}。`;
    }
  }

  // 数值夹取，防止越界
  player.maxHp = Math.max(1, player.maxHp);
  player.hp = Math.max(0, Math.min(player.maxHp, player.hp));
  player.lifespan = Math.max(0, player.lifespan);
  player.spiritStones = Math.max(0, player.spiritStones);
  player.morality = Math.max(-100, Math.min(100, player.morality));
  player.reputation = Math.max(0, Math.min(100, player.reputation));
  player.cultivation = Math.max(0, Math.min(100, player.cultivation));

  // 死亡判定：只有叙事明确写死（died:true）才真正死亡；逆天改命可免死一次；言出法随豁免。
  if (out.died === true && !god) {
    const reviveItem = findReviveItem(world);
    if (reviveItem) {
      // 逆天改命：消耗词条，气血恢复 30%
      player.hp = Math.max(1, Math.round(player.maxHp * 0.3));
      world.flags.deathImminent = false;
      removeItem(world, reviveItem.name);
      reviveNote = `【逆天改命】你已濒临死境，「${reviveItem.name}」应声碎裂，替你挡下死劫（气血恢复至 ${player.hp}）。`;
    } else {
      player.hp = 0;
      world.flags.deathByRisk = true;
      world.flags.deathImminent = false;
    }
  } else if (player.hp <= 0) {
    // 伤势再重也不致死：铁骨保底 15% 气血；否则坠入「生死一线」濒死，下一回合由叙事决定生死
    if (activeHas(world.inventory, 'ironBone')) {
      player.hp = Math.max(1, Math.round(player.maxHp * 0.15));
    } else {
      player.hp = 1;
      world.flags.deathImminent = true;
    }
  }

  // 危险兜底：高危/致命行为不再直接判死，而是概率坠入「生死一线」（濒死）。
  // 疾风（战斗）/隐匿（非战斗）降低概率；铁骨保底不死。濒死状态下不再重复掷骰。言出法随豁免。
  if (!god && !world.flags.deathImminent && (out.risk === 'high' || out.risk === 'lethal')) {
    const base = out.risk === 'lethal' ? diff.deathLethal : diff.deathHigh;
    let chance = Math.min(0.95, base * (combat ? combatDeathMult(realmDiff) : 1) * (combat ? equipAtk : 1) * (formationFx.deathMult || 1) * (buffFx.deathMult || 1) * (techFx.deathMult || 1) * (rootFx.deathMult || 1));
    if (combat && activeHas(world.inventory, 'swift')) chance *= 0.8;   // 疾风
    if (!combat && activeHas(world.inventory, 'stealth')) chance *= 0.8; // 隐匿
    if (Math.random() < chance) {
      const ironBone = activeHas(world.inventory, 'ironBone');
      world.flags.deathImminent = !ironBone;
      player.hp = Math.min(player.hp, ironBone ? Math.max(1, Math.round(player.maxHp * 0.15)) : Math.max(1, Math.round(player.maxHp * 0.2)));
    }
  }

  // 生死一线自动解除：脱险后（本回合无危险判定、未死、气血恢复至上限 25% 以上）自动清除，
  // 防止 GM 忘记写 deathImminent:false 导致濒死标记永久残留（GM 显式设置仍优先，合并在后）。
  if (world.flags.deathImminent && out.died !== true && out.risk !== 'high' && out.risk !== 'lethal' && player.hp > player.maxHp * 0.25) {
    world.flags.deathImminent = false;
  }

  // 境界突破：只允许提升，且需严格来自阶梯；大境界还须在本境积累足够岁月
  if (typeof out.realmChange === 'string' && out.realmChange) {
    const idx = realmIndex(out.realmChange);
    if (idx > realmIndex(player.realm)) {
      const majorStep = realmMajor(out.realmChange) !== realmMajor(player.realm);
      const needYears = minYearsFor(player.realm);
      const stayedYears = yearsInRealm(world, player);
      if (majorStep && stayedYears !== null && stayedYears < needYears) {
        reject('breakthrough_too_soon', 'realmChange');
        delete out.realmChange; // 叙事保留，境界不动
      }
    } else {
      delete out.realmChange; // 只升不降：同级或倒退一律忽略
    }
    if (out.realmChange) {
      player.realm = out.realmChange;
      player.cultivation = 0;
      world.realmSince = { ...worldGameDate(world) };
      const base = REALM_BASE[realmMajor(player.realm)];
      if (base) {
        player.lifespan = Math.max(player.lifespan, base.lifespan);
        // 突破伐毛洗髓：气血上限提升时，当前气血同步增加同等幅度（满血保持满血，原有伤势保留）
        const oldMax = player.maxHp;
        player.maxHp = Math.max(player.maxHp, base.maxHp);
        if (player.maxHp > oldMax && player.hp > 0) {
          player.hp = Math.min(player.maxHp, player.hp + (player.maxHp - oldMax));
        }
      }
    }
  }

  // 登记新内容进世界状态
  const pushList = (key, target) => {
    if (Array.isArray(out[key])) {
      for (const x of out[key]) {
        if (x && x.name && !target.some((t) => t.name === x.name)) target.push(x);
      }
    }
  };
  pushList('newLocations', world.locations);
  pushList('newSkills', world.skills);
  // 丹方：新得丹方（常见/上古/残缺/禁制），残缺的要以残页拼
  if (Array.isArray(out.newRecipes)) {
    if (!Array.isArray(world.recipes)) world.recipes = [];
    for (const r of out.newRecipes) {
      if (!r || !r.name) continue;
      const pill = pillByName(r.pill || r.name) || null;
      if (!pill) continue;
      const base = recipeOf(pill);
      if (world.recipes.some((x) => x.name === (r.name || base.name))) continue;
      world.recipes.push({
        ...base,
        name: r.name || base.name,
        have: pill.tier === '残缺' ? 0 : base.pieces,
        source: r.source || '',
      });
    }
  }
  // 残页：拼齐才可开炉
  if (Array.isArray(out.recipePieces)) {
    if (!Array.isArray(world.recipes)) world.recipes = [];
    for (const pc of out.recipePieces) {
      if (!pc || !pc.name) continue;
      const rec = findRecipe(world, pc.name);
      if (!rec || !rec.pieces) continue;
      const add = Math.max(1, Math.floor(Math.abs(Number(pc.delta) || 1)));
      rec.have = Math.min(rec.pieces, (rec.have || 0) + add);
    }
  }
  if (out.flags && typeof out.flags === 'object') Object.assign(world.flags, out.flags);

  // 自动命名 NPC（身份代称→姓名，血缘同姓）
  const createdNpcs = [];
  if (Array.isArray(out.newNpcs)) {
    for (const n of autoNameNpcs(world, out.newNpcs)) {
      if (n && n.name && !world.npcs.some((t) => t.name === n.name)) {
        const npc = {
          name: n.name, desc: n.desc || '', relation: n.relation || '', kin: n.kin || null,
          temperament: n.temperament || '', personality: n.personality || '',
          trait: normalizeTrait(n.trait || n.personality)?.label || '',
          desire: n.desire || '', taboo: n.taboo || '', speech: n.speech || '',
          links: Array.isArray(n.links) ? n.links : [],
          bond: { ...BOND_BASE, ...(bondSeedFor(n.relation) || {}) },
          lastTouchMonth: monthOrdinal(world.date),
        };
        world.npcs.push(npc);
        createdNpcs.push(npc);
        rememberTrait(world, npc, eventTurn);
      }
    }
  }

  // 人物之间的关系网：NPC 彼此也有师承、亲眷、恩怨，不是只围着玩家转
  if (createdNpcs.length) {
    if (!Array.isArray(world.npcLinks)) world.npcLinks = [];
    const resolveName = (raw) => {
      if (!raw) return '';
      const key = String(raw).trim();
      if (world.aliasMap && hasOwn(world.aliasMap, key)) return world.aliasMap[key];
      const hit = (world.npcs || []).find((n) => n.name === key);
      return hit ? hit.name : '';
    };
    const addLink = (a, b, type, note, known) => {
      if (!a || !b || a === b || !type) return;
      const pair = [a, b].sort().join('|');
      if (world.npcLinks.some((l) => [l.a, l.b].sort().join('|') === pair && l.type === type)) return;
      const isKnown = known === true || (known !== false && !SECRET_LINK_TYPES.has(type));
      world.npcLinks.push({ a, b, type, note: note || '', turn: eventTurn, known: isKnown });
    };
    for (const npc of createdNpcs) {
      for (const l of npc.links || []) {
        if (!l || !l.to) continue;
        addLink(npc.name, resolveName(l.to), l.type || '相识', l.note, l.known);
      }
      if (npc.kin && npc.kin.of) addLink(npc.name, resolveName(npc.kin.of), '亲属', npc.kin.relation || '', true);
      if (world.npcLinks.length > 60) world.npcLinks = world.npcLinks.slice(-60);
    }
    // 牵一发动全身：新人的初始态度受其关系网中人的态度影响
    for (const npc of createdNpcs) {
      const partners = world.npcLinks
        .filter((l) => l.a === npc.name || l.b === npc.name)
        .map((l) => (l.a === npc.name ? l.b : l.a));
      let trust = 0;
      let grudge = 0;
      for (const name of partners) {
        const other = world.npcs.find((n) => n.name === name);
        if (!other) continue;
        const b = bondOf(other);
        if (b.grudge >= 60) { grudge += 20; trust -= 10; }
        else if (b.trust >= 70) { trust += 10; }
      }
      if (trust || grudge) {
        npc.bond = {
          ...npc.bond,
          trust: clampBond(npc.bond.trust + trust),
          grudge: clampBond(npc.bond.grudge + grudge),
        };
      }
    }
  }

  // 事迹：按主体记录事件（含关系标签、回合、年月）
  if (!Array.isArray(world.events)) world.events = [];
  if (Array.isArray(out.newEvents)) {
    const clean = (v) => (typeof v === 'string' && v !== 'undefined' && v !== 'null' ? v.trim() : '');
    out.newEvents = out.newEvents.filter((ev) => {
      const quest = (world.quests || []).find((q) => q.title === ev.subject) ||
        (out.newQuests || []).find((q) => q.title === ev.subject && (q.objective || q.reward));
      if (!quest || !['已完成', '已失败', '已放弃', '已失败（超时）'].includes(ev.title)) return true;
      let status = quest.status || 'active';
      if (status === 'active') {
        const planned = new Set((out.questUpdates || []).filter((u) => u.title === quest.title && ['completed', 'failed'].includes(u.status)).map((u) => u.status));
        if (planned.size > 1) return false; // 下方统一冲突裁决负责诊断；不能先记入任一结局。
        status = planned.values().next().value || 'active';
      }
      const same = status === 'completed' && ev.title === '已完成' || status === 'failed' && ev.title.startsWith('已失败') || status === 'cancelled' && ev.title === '已放弃';
      if (!same) reject('terminal_quest', 'newEvents[]');
      return false; // 精确系统标签只由真实任务迁移写入，不信任模型直接补造。
    });
    for (const ev of out.newEvents) {
      if (!ev) continue;
      const rawSubject = clean(ev.subject);
      if (!rawSubject) continue;
      const subject = resolveStateAlias(world, rawSubject); // 身份代称统一成姓名
      const title = clean(ev.title);
      if (!world.events.some((e) => e.subject === subject && e.title === title)) {
        world.events.push({ subject, title, desc: clean(ev.desc), relation: clean(ev.relation), turn: eventTurn, date: eventDate, stage: player.realm });
      }
    }
  }

  // 势力关系：结盟 / 敌对 / 中立；未登记的势力自动建档（玩家提到/遇见的新势力）
  if (Array.isArray(out.factionRelations)) {
    for (const fr of out.factionRelations) {
      if (!fr || !fr.name) continue;
      const rel = ['结盟', '敌对', '中立'].includes(fr.relation) ? fr.relation : '';
      const f = world.factions.find((x) => x.name === fr.name);
      if (f) {
        if (rel) f.relation = rel;
        f.notedTurn = eventTurn; // 再次被提及：刷新常驻期（耳闻势力可升回常驻区）
      } else {
        world.factions.push({
          name: fr.name,
          desc: fr.desc || '',
          type: fr.type || '',
          alignment: (fr.alignment && ['正道', '魔道', '中立'].includes(fr.alignment)) ? fr.alignment : factionAlignment({ name: fr.name, desc: fr.desc || '' }),
          relation: rel,
          notedTurn: eventTurn,
        });
      }
    }
  }

  // 新势力：AI/玩家提到或遇见的江湖势力 → 动态创建进图鉴（带阵营/类型标签）
  if (Array.isArray(out.newFactions)) {
    for (const nf of out.newFactions) {
      if (!nf || !nf.name) continue;
      const existing = world.factions.find((f) => f.name === nf.name);
      if (existing) { existing.notedTurn = eventTurn; continue; } // 已存在：刷新常驻期
      world.factions.push({
        name: nf.name,
        desc: nf.desc || '',
        type: nf.type || '',
        alignment: (nf.alignment && ['正道', '魔道', '中立'].includes(nf.alignment)) ? nf.alignment : factionAlignment({ name: nf.name, desc: nf.desc || '' }),
        relation: '',
        notedTurn: eventTurn,
      });
    }
  }

  // 机缘钩子登记：记住最近抛过什么、哪些被拒 → 防止同类机缘反复出现
  if (Array.isArray(out.hooks)) {
    if (!Array.isArray(world.hookLog)) world.hookLog = [];
    for (const h of out.hooks) {
      if (!h || !h.theme) continue;
      world.hookLog.push({
        theme: h.theme,
        title: h.title || '',
        declined: h.declined === true,
        turn: eventTurn,
      });
    }
    if (world.hookLog.length > 8) world.hookLog = world.hookLog.slice(-8);
  }

  // 大势演变
  if (out.eraChange && typeof out.eraChange === 'object') {
    const ec = out.eraChange;
    if (ec.type && ERA_TYPES[ec.type]) {
      world.eraType = ec.type;
      if (ec.text) world.era = ec.text;
      // 期限：叙事给定期限（如"三月后开启"）→ 记下截止日；无期限 → 清除
      world.eraDeadline = (typeof ec.months === 'number' && ec.months > 0)
        ? addMonths(world.date, ec.months)
        : undefined;
      world.flags.eraExpired = false;
    }
  }

  // NPC 长期关系（主动结交）：标签是快照，四维账本才是真的
  if (Array.isArray(out.npcRelations)) {
    for (const nr of out.npcRelations) {
      if (!nr || !nr.name) continue;
      const resolved = resolveStateAlias(world, nr.name);
      const npc = world.npcs.find((x) => x.name === resolved);
      if (!npc) continue;
      if (nr.relation) {
        npc.relation = nr.relation;
        npc.personalityRevealed = true; // 深交后逐渐看清秉性
      }
      const bond = bondOf(npc);
      let touched = false;
      for (const k of BOND_DIMS) {
        if (typeof nr[k] === 'number' && Number.isFinite(nr[k])) {
          bond[k] = clampBond(bond[k] + nr[k]);
          touched = true;
        }
      }
      if (!touched && nr.relation) {
        // 只给了新标签、没给数值：按标签给一份种子，让"结为道侣"立刻有实质
        Object.assign(bond, bondSeedFor(nr.relation) || {});
      }
      npc.bond = bond;
      npc.lastTouchMonth = monthOrdinal(world.date);
    }
  }

  // 识破真性：叙事中玩家看透某 NPC 的真实性格 → 图鉴揭示
  if (Array.isArray(out.personalityReveals)) {
    for (const pr of out.personalityReveals) {
      if (!pr || !pr.name) continue;
      const resolved = resolveStateAlias(world, pr.name);
      const npc = world.npcs.find((x) => x.name === resolved);
      if (npc) npc.personalityRevealed = true;
    }
  }

  // 势力底细：玩家查到实证后才标记；只"起疑"不算，防止 GM 一次性说破
  if (Array.isArray(out.reveals)) {
    for (const rv of out.reveals) {
      if (!rv || !rv.faction) continue;
      const f = factionByName(rv.faction);
      if (!f || !secretOf(f.id)) continue;
      if (!world.knownSecrets) world.knownSecrets = {};
      // 必须先起疑（hinted），GM 才可能拿到真相；没查过就直接报"查明"视为无效
      if (world.knownSecrets[f.id] !== 'hinted') continue;
      world.knownSecrets[f.id] = 'revealed';
      revealNote = `【查出底细】${f.name}：${secretOf(f.id).truth}`;
      addChronicleEvent(world, player, f.name, '查出底细', secretOf(f.id).truth, '');
      // 查明了底细，这家势力也就进了玩家的名单
      if (!(world.factions || []).some((x) => x.name === f.name)) {
        if (!Array.isArray(world.factions)) world.factions = [];
        world.factions.push({
          id: f.id,
          name: f.name, desc: f.desc, type: f.type, alignment: f.alignment,
          tier: f.tier, seat: f.seat, seeded: true, relation: '中立', notedTurn: eventTurn,
        });
      }
    }
  }

  // 关系浮出：玩家查到某条暗关系的实证，才把这一条写进档案（其余暗关系不公开）
  if (Array.isArray(out.linkReveals)) {
    if (!Array.isArray(world.npcLinks)) world.npcLinks = [];
    for (const rv of out.linkReveals) {
      if (!rv || !rv.a || !rv.b) continue;
      const a = resolveStateAlias(world, rv.a);
      const b = resolveStateAlias(world, rv.b);
      const pair = [a, b].sort().join('|');
      const hit = world.npcLinks.find((l) => {
        if ([l.a, l.b].sort().join('|') !== pair) return false;
        return !rv.type || l.type === rv.type;
      });
      if (!hit || hit.known === true) continue;
      hit.known = true; // 只公开这一条
      hit.revealedTurn = eventTurn;
      const note = `【关系浮出水面】${hit.a}—${hit.b}（${hit.type}${hit.note ? '：' + hit.note : ''}）`;
      revealNote = revealNote || note;
      addChronicleEvent(world, player, `${hit.a}与${hit.b}`, '查出关系', hit.note || hit.type, '');
    }
  }

  // ---------- 关系档案：长期感情线/人物脉络的一等公民存储（防 GM 遗忘）----------
  maintainRelationDossier(world, out, eventTurn);

  // 背包物品：获得/消耗（带数量），首次获得同时记入图鉴
  if (!Array.isArray(world.inventory)) world.inventory = [];
  if (Array.isArray(out.itemChanges)) {
    out.itemChanges = out.itemChanges.filter((ch) => {
      if (applyItemChange(world, ch, ch.delta)) return true;
      reject('numeric_overflow', 'itemChanges[].delta');
      return false;
    });
  }

  // 装备变更（文字"穿上/佩戴/装备/祭炼/卸下 XX" → 提取器 equipChanges）
  if (Array.isArray(out.equipChanges)) {
    for (const ec of out.equipChanges) {
      if (!ec || !ec.name) continue;
      const it = (world.inventory || []).find((t) => t.name === ec.name);
      if (!it) continue;
      if (ec.equipped === false) it.equipped = false;
      else equipItem(world, it); // 槽位规则统一走这里（双持/多宝/功能法宝常驻）
    }
    refreshTreasureConflicts(world);
  }

  // 本命祭炼：只能有一件，耗三成气血与灵石，祭成后威力 ×1.25 且不必占槽
  if (Array.isArray(out.refineTreasure)) {
    for (const r of out.refineTreasure) {
      if (!r || !r.name) continue;
      const it = (world.inventory || []).find((t) => t.name === r.name);
      const known = it ? treasureByName(it.name) : null;
      const tier = known ? TREASURE_TIERS[known.tier] : null;
      if (!it || !known || !tier) {
        pillNotes.push(`【祭炼】「${r.name}」不是名录里的法宝，祭不成本命。`);
        continue;
      }
      if (!canRefine(player.realm, known)) {
        pillNotes.push(`【祭炼】修为不足，须金丹以上才能祭炼本命法宝（${known.name} 需 ${tier.minRealm}）。`);
        continue;
      }
      const bonded = (world.inventory || []).filter((x) => x.bonded);
      if (bonded.length) {
        pillNotes.push(`【祭炼】你已有一件本命法宝「${bonded[0].name}」，本命只能有一件。`);
        continue;
      }
      const cost = refineCost(known);
      if (player.spiritStones < cost.stones) {
        pillNotes.push(`【祭炼】灵石不足（需 ${cost.stones}）。`);
        continue;
      }
      player.hp = Math.max(1, Math.round(player.hp - player.maxHp * cost.hpFraction));
      player.spiritStones -= cost.stones;
      it.bonded = true;
      it.equipped = true;
      pillNotes.push(`【祭炼】你以精血温养「${known.name}」，本命法宝成了——此后它与心神相连，威力更胜同阶（气血 -${Math.round(player.maxHp * cost.hpFraction)}，灵石 -${cost.stones}）。`);
    }
  }

  // 誓愿目标：更新或达成
  if (out.goal && typeof out.goal === 'object') {
    const g = out.goal;
    if (g.desc || g.type || g.target || g.status) {
      world.goal = { ...world.goal, ...g };
    }
    if (['达成', '已完成', '完成'].includes(g.status)) {
      world.flags.goalCompleted = true;
      if (!world.events.some((e) => e.subject === world.goal.type && e.title === '达成')) {
        world.events.push({ subject: world.goal.type || '誓愿', title: '达成', desc: world.goal.desc || '', relation: '', turn: eventTurn, date: eventDate, stage: player.realm });
      }
    }
  }

  // 支线任务登记
  if (!Array.isArray(world.quests)) world.quests = [];
  const questAnchorDate = addGameDays(worldGameDate(world), elapsedGameDays(out.timeMonths) ?? 0);
  if (Array.isArray(out.newQuests)) {
    for (const q of out.newQuests) {
      if (q && q.title && (q.objective || q.reward)) {
        if (!world.quests.some((t) => t.title === q.title)) {
          const quest = {
            id: 'side-' + Math.random().toString(36).slice(2, 8),
            type: 'side',
            title: q.title,
            desc: q.desc || '',
            objective: q.objective || '',
            timeNode: q.timeNode || '',
            reward: q.reward || '',
            status: 'active',
            deadlineDate: null,
            deadlineVersion: 2,
            deadlinePending: false,
          };
          applyQuestDeadline(quest, q, questAnchorDate);
          // 有原文期限却无法提取日期时，保留可见的待确认状态，不猜测天数。
          if (!quest.deadlineDate && hasNarrativeDeadline(quest)) {
            quest.deadlinePending = true;
          }
          world.quests.push(quest);
        }
      }
    }
  }
  // 任务进度 / 完成 / 失败
  if (Array.isArray(out.questUpdates)) {
    const finalStates = new Map();
    for (const u of out.questUpdates) {
      if (u.status !== 'completed' && u.status !== 'failed') continue;
      if (!finalStates.has(u.title)) finalStates.set(u.title, new Set());
      finalStates.get(u.title).add(u.status);
    }
    const conflicts = new Set([...finalStates].filter(([, states]) => states.size > 1).map(([title]) => title));
    if (conflicts.size) reject('conflicting_quest_updates', 'questUpdates[]');
    out.questUpdates = out.questUpdates.filter((u) => {
      if (conflicts.has(u.title)) return false;
      const quest = world.quests.find((q) => q.title === u.title);
      if (!quest) return false;
      if (quest.status !== 'active') {
        const changesDeadline = ['deadlineDate', 'deadlineDays', 'deadlineTurns', 'timeNode'].some((key) => hasOwn(u, key));
        if (changesDeadline || (u.status !== undefined && u.status !== quest.status)) reject('terminal_quest', 'questUpdates[]');
        return false; // 同一终态也是安静的 no-op，不补造里程碑。
      }
      if (u.status === 'cancelled') { reject('terminal_quest', 'questUpdates[].status'); return false; }
      return true;
    });
    for (const u of out.questUpdates) {
      if (u && u.title) {
        const q = world.quests.find((t) => t.title === u.title);
        if (q) {
          if (q.status !== 'active') continue;
          const previousStatus = q.status;
          if (['completed', 'failed'].includes(u.status)) q.status = u.status;
          if (q.status === 'active') {
            const awaitingDeadline = gameDateOrdinal(q.deadlineDate) === null;
            applyQuestDeadline(q, u, questAnchorDate);
            if (awaitingDeadline && typeof u.timeNode === 'string' && u.timeNode.trim()) q.timeNode = u.timeNode.trim();
          }
          if (q.status !== previousStatus && (u.status === 'completed' || u.status === 'failed')) {
            const et = u.status === 'completed' ? '已完成' : '已失败';
            if (!world.events.some((e) => e.subject === u.title && e.title === et)) {
              world.events.push({ subject: u.title, title: et, desc: u.note || '', relation: '', turn: eventTurn, date: eventDate, stage: player.realm });
            }
          }
        }
      }
    }
  }

  // 效果诉求登记（只记录不实现：玩家希望某类法宝/丹药有某种效果 → 供开发者升级注册表）
  if (Array.isArray(out.effectRequests)) {
    if (!Array.isArray(world.effectRequests)) world.effectRequests = [];
    for (const r of out.effectRequests) {
      if (!r || !r.name) continue;
      if (world.effectRequests.some((x) => x.name === r.name)) continue;
      world.effectRequests.push({ name: r.name, desc: r.desc || '', turn: eventTurn });
    }
    if (world.effectRequests.length > 20) world.effectRequests = world.effectRequests.slice(-20);
  }

  // 剧情撤回：删除幻觉产生的事迹/剧情标记/关系档案，防止污染后续剧情
  if (Array.isArray(out.retract)) {
    for (const r of out.retract) {
      if (!r) continue;
      const subjects = Array.isArray(r.subjects) ? r.subjects : [];
      const titles = Array.isArray(r.titles) ? r.titles : [];
      const flags = Array.isArray(r.flags) ? r.flags : [];
      if (subjects.length || titles.length) {
        world.events = (world.events || []).filter((e) => {
          if (titles.length && titles.includes(e.title)) return false; // 标题命中即删
          if (subjects.length && titles.length === 0 && subjects.includes(e.subject)) return false; // 只给主体时整条脉络删
          return true;
        });
        // 关系档案同步清理
        for (const name of subjects) {
          const d = world.relationDossier && hasOwn(world.relationDossier, name) && world.relationDossier[name];
          if (!d) continue;
          if (titles.length) {
            d.milestones = (d.milestones || []).filter((m) => !titles.includes(m.title));
            if (!d.milestones.length) delete world.relationDossier[name];
          } else {
            delete world.relationDossier[name];
          }
        }
      }
      for (const f of flags) {
        delete world.flags[f];
      }
      // 补回此前误耗的物品（如 GM 把"培元丹"错扣成"百转培元丹"后纠正）
      if (Array.isArray(r.items)) {
        for (const it of r.items) {
          if (!it || !it.name) continue;
          const refund = it.delta;
          if (refund > 0 && !applyItemChange(world, { name: it.name, desc: it.desc || '', kind: it.kind }, refund)) reject('numeric_overflow', 'retract[].items[].delta');
        }
      }
    }
  }

  // 噬血：战斗吸血（返还所受伤势 30%）；回春：无战斗回合末自愈 5%（濒死时不生效，脱险由叙事决定）
  if (!god && player.hp > 0 && out.died !== true) {
    if (combat && hpLost > 0 && activeHas(world.inventory, 'lifesteal')) {
      const heal = Math.min(player.maxHp - player.hp, Math.round(hpLost * 0.3));
      if (heal > 0) player.hp += heal;
    } else if (!combat && !world.flags.deathImminent && activeHas(world.inventory, 'regen')) {
      const heal = Math.min(player.maxHp - player.hp, Math.max(1, Math.round(player.maxHp * 0.05)));
      player.hp += heal;
    }
  }

  // 秘密拜师：日子一长，旧师可能察觉（过得越久、旧师越在意，越容易露）
  if (Number(out.timeMonths) > 0) {
    const exposure = checkCraftSecretExposure(world, player);
    if (exposure) pillNotes.push(exposure);
  }

  // 结算（半透明展示）：逆天改命 > 战斗 > 闭关被打断 > 关系浮出 > 行路
  recordValidation(world, out, issues);
  world.pendingInterrupt = null; // 只用一回合，避免泄漏到下一回合
  world.guardiansThisTurn = null;
  if (reviveNote) return reviveNote;
  if (combat && hpLost > 0) {
    const enemyLabel = combat.enemy || '强敌';
    const realmNote = combat.realm && combat.realm !== '未知' ? `（${combat.realm}）` : '';
    const wound = hpLost >= player.maxHp * 0.5 ? '重伤' : '负伤';
    const drain = activeHas(world.inventory, 'lifesteal') && hpLost > 0 ? ` · 噬血返还 ${Math.round(hpLost * 0.3)}` : '';
    return `【战斗】${enemyLabel}${realmNote} · 你${wound}（气血-${hpLost}${drain}）`;
  }
  if (interruptNote) return [interruptNote, treatNote, regionNote, ...pillNotes].filter(Boolean).join('\n');
  if (treatNote || regionNote || pillNotes.length) return [treatNote, regionNote, ...pillNotes].filter(Boolean).join('\n');
  if (revealNote) return revealNote;
  if (travelNote) return travelNote;
  return null;
}

// ---------- 游戏历法与任务期限（30天/月、12月/年，不与回合数换算） ----------
function gameDateOrdinal(date) {
  if (!date || typeof date !== 'object' || Array.isArray(date)) return null;
  const { year, month, day } = date;
  if (!Number.isSafeInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 30) return null;
  const total = (year - 1) * 360 + (month - 1) * 30 + day - 1;
  return Number.isSafeInteger(total) ? total : null;
}

function elapsedGameDays(months) {
  if (typeof months !== 'number' || !Number.isFinite(months) || months < 0) return null;
  const days = Math.round(months * 30);
  return Number.isSafeInteger(days) ? days : null;
}

// 旧存档可缺整个日期或仅缺日；锚点与实际推进必须采用相同的兼容规则。
// 已存在但非法的年月日不修正为另一个日期，以免凭空制造期限或超时。
function worldGameDate(world) {
  const date = world && world.date;
  if (date === null || date === undefined) return { year: 1, month: 1, day: 1 };
  if (typeof date !== 'object' || Array.isArray(date)) return null;
  return addGameDays({ ...date, day: date.day === undefined ? 1 : date.day }, 0);
}

export function addGameDays(date, days) {
  const start = gameDateOrdinal(date);
  if (start === null || !Number.isSafeInteger(days)) return null;
  const total = start + days;
  if (!Number.isSafeInteger(total) || total < 0) return null;
  return { year: Math.floor(total / 360) + 1, month: Math.floor((total % 360) / 30) + 1, day: (total % 30) + 1 };
}

export function daysUntil(date, deadlineDate) {
  const start = gameDateOrdinal(date);
  const end = gameDateOrdinal(deadlineDate);
  return start === null || end === null ? null : end - start;
}

function gameDateText(date) {
  return `${date.year}年${date.month}月${date.day}日`;
}

function hasNarrativeDeadline(quest) {
  return typeof quest.timeNode === 'string' && !!quest.timeNode.trim() && !/^(无期限|不限(?:期|时|制)?|不设期限|无时间限制|长期(?:有效)?|永久(?:有效)?)[。.!！]?$/.test(quest.timeNode.trim());
}

// 已确认日期固定，防止模型反复输出相对期限使任务无限续期；只为待确认任务补录。
function applyQuestDeadline(quest, data, anchorDate) {
  if (gameDateOrdinal(quest.deadlineDate) !== null) return;
  const hasDate = Object.prototype.hasOwnProperty.call(data, 'deadlineDate');
  const hasDays = Object.prototype.hasOwnProperty.call(data, 'deadlineDays');
  const hasOldTurns = Object.prototype.hasOwnProperty.call(data, 'deadlineTurns');
  if (!hasDate && !hasDays && !hasOldTurns) return;
  let deadline = gameDateOrdinal(data.deadlineDate) === null ? null : addGameDays(data.deadlineDate, 0);
  if (!deadline && Number.isSafeInteger(data.deadlineDays) && data.deadlineDays >= 0) {
    deadline = addGameDays(anchorDate, data.deadlineDays);
  }
  if (deadline) {
    quest.deadlineDate = deadline;
    quest.deadlinePending = false;
    quest.deadlineVersion = 2;
  } else if (gameDateOrdinal(quest.deadlineDate) === null) {
    quest.deadlineDate = null;
    quest.deadlinePending = true;
    quest.deadlineVersion = 2;
  }
}

export function migrateQuestDeadlines(world) {
  if (!world || !Array.isArray(world.quests)) return 0;
  let count = 0;
  for (const quest of world.quests) {
    if (!quest || typeof quest !== 'object' || Array.isArray(quest)) continue;
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(quest, 'deadlineTurn')) {
      if (quest.deadlineTurn !== null && quest.deadlineTurn !== undefined && !Object.prototype.hasOwnProperty.call(quest, 'legacyDeadlineTurn')) {
        quest.legacyDeadlineTurn = quest.deadlineTurn;
      }
      delete quest.deadlineTurn;
      changed = true;
    }
    const validDate = gameDateOrdinal(quest.deadlineDate) !== null;
    const hadInvalidDate = quest.deadlineDate !== null && quest.deadlineDate !== undefined && !validDate;
    const hasLegacy = quest.legacyDeadlineTurn !== null && quest.legacyDeadlineTurn !== undefined;
    const pending = !validDate && (quest.deadlinePending === true || hasLegacy || hadInvalidDate || hasNarrativeDeadline(quest));
    if (!validDate && quest.deadlineDate !== null) { quest.deadlineDate = null; changed = true; }
    if (quest.deadlinePending !== pending) { quest.deadlinePending = pending; changed = true; }
    if (quest.deadlineVersion !== 2) { quest.deadlineVersion = 2; changed = true; }
    if (changed) count += 1;
  }
  return count;
}

export function questDeadlineInfo(quest, world) {
  const q = quest && typeof quest === 'object' ? quest : {};
  const deadlineDate = addGameDays(q.deadlineDate, 0);
  if (deadlineDate) {
    const remainingDays = daysUntil(world && world.date, deadlineDate);
    const suffix = remainingDays === null ? '' : remainingDays > 0 ? `（剩余${remainingDays}天）` : remainingDays === 0 ? '（今日截止）' : `（已逾期${-remainingDays}天）`;
    return { deadlineDate, remainingDays, pending: false, text: gameDateText(deadlineDate) + suffix };
  }
  const legacy = q.legacyDeadlineTurn !== null && q.legacyDeadlineTurn !== undefined || q.deadlineTurn !== null && q.deadlineTurn !== undefined;
  const invalidDate = q.deadlineDate !== null && q.deadlineDate !== undefined;
  const pending = q.deadlinePending === true || legacy || invalidDate || hasNarrativeDeadline(q);
  return { deadlineDate: null, remainingDays: null, pending, text: pending ? (legacy ? '旧期限待确认' : '期限待确认') : '无期限' };
}

export function expireQuestDeadlines(player, world) {
  migrateQuestDeadlines(world);
  if (!world || !Array.isArray(world.quests) || gameDateOrdinal(world.date) === null) return [];
  const expired = [];
  for (const quest of world.quests) {
    if (!quest || quest.status !== 'active') continue;
    const remaining = daysUntil(world.date, quest.deadlineDate);
    if (remaining === null || remaining >= 0) continue;
    quest.status = 'failed';
    quest.failureReason = `已超过游戏日期期限（截止${gameDateText(quest.deadlineDate)}，当前${gameDateText(world.date)}）`;
    quest.failedAtDate = addGameDays(world.date, 0);
    addChronicleEvent(world, player, quest.title, '已失败（超时）', quest.failureReason, '');
    expired.push(quest);
  }
  return expired;
}

// ---------- 地脉盛衰（区域灵气随岁月漂移）----------
// 规则在这里、数据在 world.js：灵气会涨也会枯，盛则修炼快、货好、价松，枯则反过来。
// 漂移量记在存档 world.regionDrift，静态九域表不动；读档只补字段、不补漂移，不判罚。
// 原文：第220章「灵脉有枯竭之日」；第172章灵药采尽即枯；第358章修士渐多、灵石渐少。
export function ensureRegionDrift(world) {
  if (!world || typeof world !== 'object') return null;
  if (!world.regionDrift || typeof world.regionDrift !== 'object' || Array.isArray(world.regionDrift)) world.regionDrift = {};
  if (!Number.isFinite(world.driftDays) || world.driftDays < 0) world.driftDays = 0;
  if (!Number.isFinite(world.driftSteps) || world.driftSteps < 0) world.driftSteps = 0;
  if (!Array.isArray(world.regionChronicle)) world.regionChronicle = [];
  return world.regionDrift;
}

// 确定性伪随机：同一存档、同一步漂移必得同一结果（不靠 Math.random，测试可复现）
function driftRoll(key, salt) {
  let h = 2166136261 >>> 0;
  const s = `${key}|${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}

// 每步只动一个地方：天下不会一夜之间齐齐变样
function pickDriftRegion(world) {
  const list = allRegions(world).filter((r) => r && r.id !== 'taiqing'); // 仙界与凡界不往来，不参与凡界盛衰
  if (!list.length) return null;
  const i = Math.floor(driftRoll('pick', world.driftSteps || 0) * list.length);
  return list[Math.min(list.length - 1, i)];
}

// 推进 months 个月：每满 stepDays 漂一次，返回本次新生成的地脉纪事
export function evolveRegions(world, months = 0) {
  ensureRegionDrift(world);
  const days = elapsedGameDays(months);
  if (days === null || days <= 0) return [];
  world.driftDays += days;
  const events = [];
  let guard = 0;
  while (world.driftDays >= REGION_DRIFT.stepDays && guard < 240) {
    guard += 1;
    world.driftDays -= REGION_DRIFT.stepDays;
    world.driftSteps += 1;
    const region = pickDriftRegion(world);
    if (!region) break;
    const step = world.driftSteps;
    const beforeQi = regionQi(region, world);
    const roll = driftRoll(region.id, step);
    let dq = 0;
    if (roll < REGION_DRIFT.witherChance) dq = -1;
    else if (roll > 1 - REGION_DRIFT.reviveChance) dq = 1;
    if (!dq) continue; // 大半时候不动：灵气是几十上百年的尺度
    const afterQi = Math.max(1, Math.min(6, beforeQi + dq));
    if (afterQi === beforeQi) continue; // 已到顶或见底
    const beforeDanger = regionDanger(region, world);
    const dFear = driftRoll(`${region.id}d`, step) < REGION_DRIFT.dangerFollow ? (dq > 0 ? -1 : 1) : 0;
    const delta = { qi: afterQi };
    if (dFear) delta.danger = Math.max(1, Math.min(5, beforeDanger + dFear));
    if (!world.regionDrift[region.id]) world.regionDrift[region.id] = {};
    Object.assign(world.regionDrift[region.id], delta);
    const text = dq > 0
      ? `${region.name}地脉复苏：灵气由${qiLabel(beforeQi)}复为${qiLabel(afterQi)}${delta.danger ? '，凶险减一分' : ''}。`
      : `${region.name}灵脉渐枯：灵气由${qiLabel(beforeQi)}落为${qiLabel(afterQi)}${delta.danger ? '，凶险增一分' : ''}。`;
    world.regionChronicle.push({ regionId: region.id, region: region.name, month: monthOrdinal(world.date), text });
    if (world.regionChronicle.length > REGION_DRIFT.maxChronicle) {
      world.regionChronicle.splice(0, world.regionChronicle.length - REGION_DRIFT.maxChronicle);
    }
    events.push(`🌏 ${text}`);
  }
  world.lastDriftEvents = events;
  return events;
}

// 当前所在地的灵气对修炼的倍率（不在任何区域时按寻常算）
export function regionCultMult(world) {
  const region = world && world.geo ? regionById(world.geo.regionId, world) : null;
  return region ? qiCultMult(regionQi(region, world)) : 1;
}

// ---------- 时间流逝 & 寿元消耗 ----------
export function advanceTime(world, player, months = 0) {
  const days = elapsedGameDays(months);
  if (days === null) return;
  const nextDate = addGameDays(worldGameDate(world), days);
  if (!nextDate) return;
  world.date = nextDate;
  const god = world && world.settings && world.settings.godMode === true;
  const evergreen = activeHas(world.inventory, 'evergreen') ? 0.5 : 1; // 长青词条：寿元消耗减半
  if (!god) player.lifespan = Math.max(0, player.lifespan - (months / 12) * evergreen); // 言出法随：寿元不流逝
  // 关系折旧：三个月没往来，信与需都会淡一点（原著的"淡化"才是常态）
  const now = monthOrdinal(world.date);
  for (const npc of world.npcs || []) {
    if (!npc || !npc.bond) continue;
    const last = Number.isFinite(npc.lastTouchMonth) ? npc.lastTouchMonth : now;
    if (now - last < 3) continue;
    npc.bond.trust = clampBond((npc.bond.trust ?? 30) - 2);
    npc.bond.need = clampBond((npc.bond.need ?? 20) - 3);
    npc.lastTouchMonth = now;
  }
  // 护法的伤养好了：到期的"负伤/心神受损"自动清除，可以再来护法
  for (const npc of world.npcs || []) {
    if (npc && npc.condition && Number.isFinite(npc.condition.untilMonth) && npc.condition.untilMonth <= now) {
      delete npc.condition;
    }
  }
  // 抗药性消退：半年不服同一种丹，次数减一（原文第 243 章）
  if (player.pillUsageMonth && now - player.pillUsageMonth >= 6) {
    for (const id of Object.keys(player.pillUsage || {})) {
      const left = (player.pillUsage[id] || 0) - 1;
      if (left > 0) player.pillUsage[id] = left;
      else delete player.pillUsage[id];
    }
    player.pillUsageMonth = now;
  }
  // 地脉盛衰：岁月过去，某些地方的灵气会涨会枯（不发出提示时静默推进）
  evolveRegions(world, months);
}

// ---------- 大势时间轴（有期限的大势必须按时演变，不能无限拖延）----------
export function addMonths(date, m) {
  const y = date && date.year ? date.year : 1;
  const mo = date && date.month ? date.month : 1;
  const total = (y - 1) * 12 + (mo - 1) + Math.round(m);
  return { year: Math.floor(total / 12) + 1, month: (total % 12) + 1, day: (date && date.day) || 1 };
}
export function dateAfter(a, b) {
  const ya = a && a.year ? a.year : 0;
  const yb = b && b.year ? b.year : 0;
  if (ya !== yb) return ya > yb;
  const ma = a && a.month ? a.month : 0;
  const mb = b && b.month ? b.month : 0;
  if (ma !== mb) return ma > mb;
  return ((a && a.day) || 1) > ((b && b.day) || 1);
}
// 每回合调用：秘境类大势到期限后，先给 GM 一回合按剧情收束；仍未收束则引擎强制演变
export function enforceEraTimeline(world, out) {
  if (!world || !world.date) return null;
  // 只有「秘境将启」是有期限的大势；其余大势的旧期限一律忽略
  if (world.eraType !== '秘境将启') {
    world.eraDeadline = undefined;
    world.flags.eraExpired = false;
    return null;
  }
  // 秘境将启：无期限时默认"三月之期"
  if (!world.eraDeadline) {
    world.eraDeadline = addMonths(world.date, 3);
  }
  const past = world.eraDeadline && dateAfter(world.date, world.eraDeadline);
  if (!past) {
    world.flags.eraExpired = false;
    return null;
  }
  // 本回合 GM 已按剧情收束 → 无需强制
  if (out && out.eraChange && typeof out.eraChange === 'object' && out.eraChange.type) {
    world.flags.eraExpired = false;
    return null;
  }
  if (!world.flags.eraExpired) {
    world.flags.eraExpired = true; // 给 GM 一回合收束机会
    return `⏳ 大势期限已至：${world.era} 的日子到了。天道即将推动大势演变。`;
  }
  // 连续两回合未收束 → 引擎强制演变（秘境现世，群雄争夺 → 乱世）
  world.eraType = '乱世';
  world.era = '秘境现世，机缘与杀机并起，天下重归纷争';
  world.eraDeadline = undefined;
  world.flags.eraExpired = false;
  return '🌌 大势已变：秘境现世，天下重归纷争（乱世）。';
}

// ---------- 记一条事迹（供取消任务/超时失败等主动写入）----------
export function addChronicleEvent(world, player, subject, title, desc = '', relation = '') {
  if (!Array.isArray(world.events)) world.events = [];
  const clean = (v) => (typeof v === 'string' && v !== 'undefined' && v !== 'null' ? v.trim() : '');
  const s = clean(subject);
  if (!s) return;
  const t = clean(title);
  if (world.events.some((e) => e.subject === s && e.title === t)) return;
  const turn = world.turn || 0;
  const date = (world.date && world.date.year) ? `${world.date.year}年${world.date.month}月${world.date.day || 1}日` : '';
  world.events.push({ subject: s, title: t, desc: clean(desc), relation: clean(relation), turn, date, stage: player.realm });
}

// ---------- 通关规则引擎（规则判定，不由 AI 拍脑袋）----------
// win=true 表示"达成主通关目标（飞升成仙）"
export const ENDING_RULES = [
  {
    id: 'death',
    title: '身死道消',
    win: false,
    text: '你终是倒在了求道之路上。身死道消，百年苦修，化作一抔黄土。',
    check: (p) => p.hp <= 0,
  },
  {
    id: 'ascend',
    title: '飞升成仙',
    win: true,
    text: '天劫已渡，霞光万道。你踏云而起，羽化登仙，从此位列仙班，与天地同寿。',
    check: (p) => p.realm === '飞升',
  },
  {
    id: 'demon',
    title: '堕入魔道',
    win: false,
    text: '你心魔深种、执念成狂，终于彻底堕入魔道，成为修仙界闻之色变的大魔头。',
    check: (p) => p.morality <= -80 && realmIndex(p.realm) >= realmIndex('化神初期'),
  },
  {
    id: 'lifespan',
    title: '寿元耗尽',
    win: false,
    text: '岁月如刀，寿元已尽。你于无声处坐化，一生求索，终究成空。',
    check: (p) => p.lifespan <= 0,
  },
  {
    id: 'timeup',
    title: '时不我待',
    win: false,
    text: '约定的时日已到，你却仍未飞升。仙路蹉跎，终究与仙缘擦肩而过。',
    check: (p, w) => {
      const limit = (w && w.settings && w.settings.turnLimit) || 0;
      return limit > 0 && (w.turn || 0) > limit && p.realm !== '飞升';
    },
  },
  {
    id: 'ruleworld',
    title: '一统江湖',
    win: false,
    text: '你名满天下、威震八荒，终成武林盟主，一统江湖。只是权势加身，仙路却就此止步。',
    check: (p) => p.reputation >= 90 && p.morality >= 30 && realmIndex(p.realm) >= realmIndex('化神初期'),
  },
];

export function evaluateEndings(player, world) {
  const god = world && world.settings && world.settings.godMode === true;
  for (const r of ENDING_RULES) {
    if (god && !r.win) continue; // 言出法随：只以「飞升成仙」为结局，不会失败
    if (r.check(player, world)) return r;
  }
  return null;
}

// ---------- 成就规则引擎（隐藏成就，规则判定）----------
export const ACHIEVEMENT_RULES = [
  { title: '初窥门径', desc: '踏入炼气期，正式踏上仙途', check: (p) => realmIndex(p.realm) >= realmIndex('炼气初期') },
  { title: '筑基有成', desc: '筑基功成，脱凡入真', check: (p) => realmIndex(p.realm) >= realmIndex('筑基初期') },
  { title: '金丹大道', desc: '结成金丹，寿元大增', check: (p) => realmIndex(p.realm) >= realmIndex('金丹初期') },
  { title: '元婴真人', desc: '元婴出窍，神通初成', check: (p) => realmIndex(p.realm) >= realmIndex('元婴初期') },
  { title: '富可敌国', desc: '身怀千枚灵石，富甲一方', check: (p) => p.spiritStones >= 1000 },
  { title: '名动天下', desc: '声望卓著，名扬天下', check: (p) => p.reputation >= 60 },
  { title: '正道楷模', desc: '心怀正义，正道楷模', check: (p) => p.morality >= 80 },
  { title: '魔心深种', desc: '心魔深种，渐入魔道', check: (p) => p.morality <= -80 },
  { title: '开宗立派', desc: '自立门户，开宗立派', check: (p, w) => !!w.flags.hasSect },
  { title: '誓愿已了', desc: '完成个人誓愿，了却心愿', check: (p, w) => !!w.flags.goalCompleted },
  { title: '名震一方', desc: '声望八十，一方豪强', check: (p) => p.reputation >= 80 },
  { title: '富甲天下', desc: '身怀五千灵石，富甲天下', check: (p) => p.spiritStones >= 5000 },
  { title: '神兵在手', desc: '持有天阶或仙阶装备', check: (p, w) => (w.inventory || []).some((it) => it.grade === '天阶' || it.grade === '仙阶') },
  { title: '道侣情深', desc: '结为道侣，仙途有伴', check: (p, w) => (w.npcs || []).some((n) => /道侣|双修/.test(n.relation || '')) },
];

export function achievementDesc(title) {
  const r = ACHIEVEMENT_RULES.find((x) => x.title === title);
  return r ? r.desc : '';
}

export function evaluateAchievements(player, world) {
  const got = [];
  for (const r of ACHIEVEMENT_RULES) {
    if (world.achievements.includes(r.title)) continue;
    if (r.check(player, world)) got.push(r.title);
  }
  return got;
}

// ---------- 解析 LLM 返回的 JSON（容忍代码块/多余文字）----------
export function parseLLMJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const parse = (candidate) => {
    try { return { parsed: true, value: JSON.parse(candidate) }; }
    catch { return { parsed: false }; }
  };
  // 先解析完整文本；合法数组/标量明确拒绝，绝不截出其内部对象。
  let result = parse(t);
  if (result.parsed) return isPlainRecord(result.value) ? result.value : null;
  const normalized = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  result = parse(normalized);
  if (result.parsed) return isPlainRecord(result.value) ? result.value : null;
  // 只有带额外说明的非 JSON 文本才容忍抽取对象。
  if (/^[\[\]"0-9\-]/.test(t)) return null;
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  result = parse(t.slice(start, end + 1));
  if (!result.parsed) result = parse(normalized.slice(normalized.indexOf('{'), normalized.lastIndexOf('}') + 1));
  return result.parsed && isPlainRecord(result.value) ? result.value : null;
}
