// ============================================================
//  world.js —— 世界骨架（"天地"）
//
//  这一层只做三件事：
//   1) 存一张可校验的区域/势力/关系表（来源：world-framework 的示例世界）；
//   2) 给每回合提供一小片切片（buildSlice），不把整张表塞进提示词；
//   3) 提供路程、物价系数这些可以由代码算、不必让模型编的数字。
//
//  规则层（game.js）只消费这里的纯函数，不在这里写剧情判定。
// ============================================================

export const WORLD_VERSION = '1.0.0';

const REGIONS = [
  {
    id: 'qingwu', name: '青芜国', terrain: '丘陵水乡', qi: 2, danger: 1,
    products: ['凡品', '灵品'],
    travel_days: { luoxia: 3, dayan: 8, chisha: 12, hanyuan: 15 },
    desc: '新手立足之地。三小派互相牵制，王朝只管凡人，不管修士。',
  },
  {
    id: 'luoxia', name: '落霞坊', terrain: '河谷集市', qi: 2, danger: 2,
    products: ['凡品', '灵品'],
    travel_days: { qingwu: 3, dayan: 8, chisha: 10, hanyuan: 14 },
    desc: '中立坊市，万宝阁在此设分号。价格公道，但坊内禁斗，杀人者遭全坊通缉。',
  },
  {
    id: 'dayan', name: '大衍王朝', terrain: '平原都城', qi: 3, danger: 3,
    products: ['灵品', '玄品'],
    travel_days: { qingwu: 8, luoxia: 8, chisha: 9, hanyuan: 11 },
    desc: '凡俗最强王朝，镇魔司专缉魔修。世家与朝廷共治，宗门在此须低头。',
  },
  {
    id: 'chisha', name: '赤沙荒原', terrain: '荒漠戈壁', qi: 1, danger: 4,
    products: ['灵品', '玄品'],
    travel_days: { qingwu: 12, luoxia: 10, dayan: 9, hanyuan: 18 },
    desc: '灵气枯竭，正道不管。血刀寨与散修混居，价格翻倍但什么都能买到。',
  },
  {
    id: 'hanyuan', name: '寒渊海', terrain: '群岛深海', qi: 3, danger: 5,
    products: ['玄品', '仙品'],
    travel_days: { qingwu: 15, luoxia: 14, dayan: 11, chisha: 18 },
    desc: '海外群岛，鲛人族盘踞。深海遗迹出仙品材料，但十去九不回。',
  },
];

const FACTIONS = [
  { id: 'shiyun', name: '拾云门', type: '宗门', alignment: '正道', tier: 2, seat: 'qingwu', desc: '青芜国第一大宗，收徒看灵根，与白鹿观表面和睦。' },
  { id: 'bailu', name: '白鹿观', type: '宗门', alignment: '中立', tier: 3, seat: 'qingwu', desc: '专精符箓的道观，向散修卖符。实为血刀寨暗桩，替其销赃。', hidden: '血刀寨暗桩' },
  { id: 'tieshan', name: '铁山帮', type: '帮派', alignment: '魔道', tier: 4, seat: 'qingwu', desc: '收保护费、劫商队的凡俗帮派，是血刀寨的眼线。' },
  { id: 'qingwu_court', name: '青芜王朝', type: '朝廷', alignment: '中立', tier: 5, seat: 'qingwu', desc: '只管凡人，对修士恭顺，暗地向拾云门纳贡换庇护。' },
  { id: 'wanbao', name: '万宝阁', type: '商会', alignment: '中立', tier: 2, seat: 'luoxia', desc: '跨区域商会，只认钱不认人。拍卖会与消息都归它管。' },
  { id: 'sanxiu', name: '散修盟', type: '散修联盟', alignment: '中立', tier: 4, seat: 'luoxia', desc: '散修互助组织，管挂牌、接活、通气，盟主一年一换。' },
  { id: 'cui', name: '崔氏世家', type: '世家', alignment: '中立', tier: 2, seat: 'dayan', desc: '大衍王朝第一世家，掌丹药贡路，与拾云门联姻。' },
  { id: 'zhenmo', name: '镇魔司', type: '朝廷', alignment: '正道', tier: 1, seat: 'dayan', desc: '大衍王朝的修士衙门，专缉魔修，对中立修士盘查。' },
  { id: 'xuedao', name: '血刀寨', type: '帮派', alignment: '魔道', tier: 2, seat: 'chisha', desc: '赤沙荒原的马匪修士，靠劫掠与黑市为生，与正道有世仇。' },
  { id: 'huishi', name: '灰市', type: '商会', alignment: '中立', tier: 3, seat: 'chisha', desc: '赤沙荒原的黑市组织，只做买卖不问来路。' },
  { id: 'jiaoren', name: '鲛人族', type: '妖族', alignment: '中立', tier: 2, seat: 'hanyuan', desc: '深海妖族，控潮汐与沉船。入海须持鳞符，否则视为猎物。' },
  { id: 'xingluo', name: '星罗岛', type: '宗门', alignment: '正道', tier: 3, seat: 'hanyuan', desc: '海外散修结社，靠打捞沉船遗宝维生，与鲛人族有旧约。' },
];

const RELATIONS = [
  { a: 'shiyun', b: 'bailu', type: '竞争', note: '抢灵脉与弟子，表面和睦。' },
  { a: 'shiyun', b: 'xuedao', type: '世仇', note: '三十年前血刀寨屠了拾云门外门。' },
  { a: 'bailu', b: 'xuedao', type: '暗桩', note: '白鹿观替血刀寨销赃、递消息。' },
  { a: 'tieshan', b: 'xuedao', type: '从属', note: '铁山帮是血刀寨在青芜的眼线。' },
  { a: 'wanbao', b: 'sanxiu', type: '盟约', note: '散修盟替万宝阁收散货，抽一成。' },
  { a: 'zhenmo', b: 'xuedao', type: '敌对', note: '镇魔司通缉血刀寨寨主，赏格三千灵石。' },
  { a: 'cui', b: 'shiyun', type: '盟约', note: '联姻结盟：崔氏供丹药，拾云门供护法。' },
  { a: 'jiaoren', b: 'xingluo', type: '盟约', note: '旧约：星罗岛每年供三成沉船收获，换鳞符通行。' },
  { a: 'zhenmo', b: 'cui', type: '竞争', note: '朝廷与世家争夺丹药贡路之利。' },
  { a: 'huishi', b: 'xuedao', type: '盟约', note: '灰市替血刀寨出货，抽两成。' },
  { a: 'xingluo', b: 'xuedao', type: '敌对', note: '血刀寨劫过星罗岛的船，结下梁子。' },
];

// 价格带：以「下品灵石」为单位。稀有度由获得难度决定，与提取器口径一致。
const PRICE_BANDS = {
  凡品: [1, 20],
  灵品: [50, 500],
  玄品: [800, 5000],
  仙品: [20000, 100000],
  神品: [500000, 2000000],
};

const REGION_PRICE_MULT = {
  qingwu: 1.0, luoxia: 0.9, dayan: 1.1, chisha: 2.0, hanyuan: 1.3,
};

// 大势对物价的影响（与游戏 ERA_TYPES 的收益口径分开：这里只算市价）
const ERA_PRICE_MULT = { 盛世: 0.9, 乱世: 1.2, 末法时代: 1.5, 秘境将启: 1.1, 正魔大战: 1.25 };

// 境界阶梯的粗排序（本地实现，避免与 game.js 循环依赖）
const REALM_RANK = { 凡人: 0, 炼气: 1, 筑基: 2, 金丹: 3, 元婴: 4, 化神: 5, 炼虚: 6, 合体: 7, 大乘: 8, 渡劫: 9, 飞升: 10 };
function realmRank(realm) {
  const key = Object.keys(REALM_RANK).find((k) => String(realm || '').startsWith(k));
  return key === undefined ? 0 : REALM_RANK[key];
}

export function regionById(id) {
  return REGIONS.find((r) => r.id === id) || null;
}
export function regionByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  return REGIONS.find((r) => r.name === raw) ||
    REGIONS.find((r) => raw.includes(r.name) || r.name.includes(raw)) || null;
}
export function factionById(id) {
  return FACTIONS.find((f) => f.id === id) || null;
}
export function factionsIn(regionId) {
  return FACTIONS.filter((f) => f.seat === regionId);
}
export function relationsOf(factionId) {
  return RELATIONS.filter((r) => r.a === factionId || r.b === factionId);
}
export function allRegions() { return REGIONS.slice(); }
export function allFactions() { return FACTIONS.slice(); }
export function allRelations() { return RELATIONS.slice(); }

// 路程：表里有就直接用；没有就按相邻图做最短路（跨区域赶路必须中转）。
export function travelDays(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return 0;
  const from = regionById(fromId);
  const to = regionById(toId);
  if (!from || !to) return null;
  const direct = from.travel_days && from.travel_days[toId];
  if (Number.isFinite(direct)) return direct;
  // BFS 最短路
  const seen = new Set([fromId]);
  let frontier = [[fromId, 0]];
  while (frontier.length) {
    const next = [];
    for (const [id, dist] of frontier) {
      const r = regionById(id);
      if (!r) continue;
      for (const [nid, d] of Object.entries(r.travel_days || {})) {
        if (seen.has(nid)) continue;
        if (nid === toId) return dist + d;
        seen.add(nid);
        next.push([nid, dist + d]);
      }
    }
    frontier = next;
  }
  return null; // 不连通（例如凡界到灵界）
}

export function priceMultiplier(regionId, eraType) {
  const r = REGION_PRICE_MULT[regionId] ?? 1;
  const e = ERA_PRICE_MULT[eraType] ?? 1;
  return Math.round(r * e * 100) / 100;
}

export function priceOf(rarity, regionId, eraType) {
  const band = PRICE_BANDS[rarity];
  if (!band) return null;
  const m = priceMultiplier(regionId, eraType);
  return { min: Math.round(band[0] * m), max: Math.round(band[1] * m) };
}

function pickWeighted(list, rand) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let hit = rand() * total;
  for (const x of list) { hit -= x.w; if (hit <= 0) return x.region; }
  return list[list.length - 1].region;
}

// 开局区域：青芜（新手）权重最高，寒渊海作为高风险选择保留少量可能。
export function pickStarter(rand = Math.random) {
  return pickWeighted([
    { region: 'qingwu', w: 6 },
    { region: 'luoxia', w: 2 },
    { region: 'dayan', w: 2 },
    { region: 'chisha', w: 1 },
  ], rand);
}

// 幂等迁移：旧档没有 geo 时补一个，不改变任何已有数值，读档不判罚。
export function ensureWorldGeo(world, opts = {}) {
  if (!world || typeof world !== 'object') return null;
  const existing = world.geo && regionById(world.geo.regionId);
  if (existing) return world.geo;
  const fromName = regionByName(opts.preferredName) ||
    regionByName(world.startingLocation && world.startingLocation.name);
  const regionId = (fromName && fromName.id) || opts.fallbackId || pickStarter();
  world.geo = { regionId, sinceTurn: world.turn || 0, migrated: !!world.turn };
  return world.geo;
}

export function currentRegion(world) {
  const geo = world && world.geo;
  return (geo && regionById(geo.regionId)) || null;
}

// 移动：返回 { from, to, days }；不连通或原地返回 null。
export function moveToRegion(world, targetId) {
  const to = regionById(targetId);
  if (!to) return null;
  const geo = ensureWorldGeo(world);
  if (!geo || geo.regionId === targetId) return null;
  const days = travelDays(geo.regionId, targetId);
  if (days === null) return null; // 跨界面，只能飞升
  const from = regionById(geo.regionId);
  world.geo = { ...geo, regionId: targetId, sinceTurn: world.turn || 0 };
  return { from, to, days };
}

const FACTION_TIER_LABEL = { 1: '一级', 2: '二级', 3: '三级', 4: '四级', 5: '五级' };

// 每回合的切片：只给当前区域、**已打过交道的**当地势力、路口和物价系数。约 200~260 字。
export function buildSlice(player, world) {
  const geo = world && world.geo;
  if (!geo) return '';
  const region = regionById(geo.regionId);
  if (!region) return '';
  const allHere = factionsIn(region.id);
  const knownNames = new Set((world.factions || []).map((f) => f.name));
  let here = allHere.filter((f) => knownNames.has(f.name));
  // 旧档或空名单：只给当家人，别把整张名单摊开
  if (!here.length) here = allHere.filter((f) => f.tier <= 2).slice(0, 2);
  const unknownCount = Math.max(0, allHere.length - here.length);
  const facText = here.map((f) => `${f.name}(${FACTION_TIER_LABEL[f.tier]}·${f.alignment}${f.hidden ? '·表里不一' : ''})`).join('、');
  const roads = Object.entries(region.travel_days || {})
    .map(([id, d]) => { const r = regionById(id); return r ? `${r.name}${d}日` : ''; })
    .filter(Boolean).join('、');
  const mult = priceMultiplier(region.id, world.eraType);
  const topRarity = region.products[region.products.length - 1];
  const overLevel = realmRank(player && player.realm) - region.danger * 2 >= 2;

  const lines = [
    `【世界切片】区域：${region.name}（${region.desc}）灵气${region.qi}·危险${region.danger}。`,
    facText ? `已知势力：${facText}。` : '',
    unknownCount > 0 ? `此外还有 ${unknownCount} 家势力未与之打过交道。` : '',
    roads ? `可达：${roads}。` : '',
    `物价×${mult.toFixed(2)}；本地产出上限${topRarity}。`,
    overLevel ? '此地已压不住你，寻常收获寥寥；要机缘须往更险处。' : '',
    '【铁律】路程按上表计日、物价按系数、势力强弱按等级；不得自行编造距离、价格或势力地位。',
  ].filter(Boolean);
  return lines.join('\n');
}

// 开局只登场一部分本地势力：当家人必然在场（你落脚就绕不开），其余随机抽 1~2 家。
// 没登场的势力仍然存在于世界表里，等剧情走到时再露面——不需要一次把名单摊开。
export function startingFactions(regionId, rand = Math.random) {
  const local = factionsIn(regionId);
  if (!local.length) return [];
  const home = local.filter((f) => f.tier <= 2).sort((a, b) => a.tier - b.tier)[0] || local[0];
  const rest = local.filter((f) => f.id !== home.id);
  // 洗牌后取 1~2 家：全上会把世界写成名录，全不上又显得空
  const pool = rest.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const extra = 1 + Math.floor(rand() * Math.min(2, pool.length));
  const picked = [home, ...pool.slice(0, Math.min(extra, pool.length))];
  return picked.map((f) => ({
    name: f.name,
    desc: f.desc,
    type: f.type,
    alignment: f.alignment,
    tier: f.tier,
    seat: f.seat,
    hidden: f.hidden || '',
    relation: '中立',
    seeded: true,
    notedTurn: 0,
  }));
}

export function openingRelations(regionId) {
  const ids = new Set(factionsIn(regionId).map((f) => f.id));
  return RELATIONS.filter((r) => ids.has(r.a) || ids.has(r.b)).map((r) => ({
    a: factionById(r.a)?.name,
    b: factionById(r.b)?.name,
    type: r.type,
    note: r.note,
  }));
}
