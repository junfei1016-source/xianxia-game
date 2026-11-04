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

import { materialNamesInRegion } from './materials.js';

export const WORLD_VERSION = '1.4.0';

const REGIONS = [
  {
    id: 'qingwu', name: '青芜国', terrain: '丘陵水乡', qi: 2, danger: 1,
    products: ['凡品', '灵品'],
    travel_days: { luoxia: 3, dayan: 8, chisha: 12, hanyuan: 15, guixu: 18, wanyao: 25, xingyun: 20 },
    desc: '新手立足之地。三小派互相牵制，王朝只管凡人，不管修士。',
  },
  {
    id: 'luoxia', name: '落霞坊', terrain: '河谷集市', qi: 2, danger: 2,
    products: ['凡品', '灵品'],
    travel_days: { qingwu: 3, dayan: 8, chisha: 10, hanyuan: 14, guixu: 10, wanyao: 22, xingyun: 18 },
    desc: '中立坊市，万宝阁在此设分号。价格公道，但坊内禁斗，杀人者遭全坊通缉。',
  },
  {
    id: 'dayan', name: '大衍王朝', terrain: '平原都城', qi: 3, danger: 3,
    products: ['灵品', '玄品'],
    travel_days: { qingwu: 8, luoxia: 8, chisha: 9, hanyuan: 11, guixu: 15, wanyao: 12, xingyun: 16 },
    desc: '凡俗最强王朝，镇魔司专缉魔修。世家与朝廷共治，宗门在此须低头。',
  },
  {
    id: 'chisha', name: '赤沙荒原', terrain: '荒漠戈壁', qi: 1, danger: 4,
    products: ['灵品', '玄品'],
    travel_days: { qingwu: 12, luoxia: 10, dayan: 9, hanyuan: 18, guixu: 20, wanyao: 15, xingyun: 8 },
    desc: '灵气枯竭，正道不管。血刀寨与散修混居，价格翻倍但什么都能买到。',
  },
  {
    id: 'hanyuan', name: '寒渊海', terrain: '群岛深海', qi: 3, danger: 5,
    products: ['玄品', '仙品'],
    travel_days: { qingwu: 15, luoxia: 14, dayan: 11, chisha: 18, guixu: 16, wanyao: 9, xingyun: 11 },
    desc: '海外群岛，鲛人族盘踞。深海遗迹出仙品材料，但十去九不回。',
  },
  {
    id: 'guixu', name: '归墟城', terrain: '悬空巨城', qi: 4, danger: 3,
    products: ['玄品'],
    travel_days: { qingwu: 18, luoxia: 10, dayan: 15, chisha: 20, hanyuan: 16, wanyao: 14, xingyun: 13 },
    desc: '悬于云海之上的中立巨城，靠星舟与传送阵进出。万族在此议价，规矩只有一条：城里不许见血。',
  },
  {
    id: 'wanyao', name: '万妖岭', terrain: '妖山', qi: 4, danger: 5,
    products: ['仙品'],
    travel_days: { qingwu: 25, luoxia: 22, dayan: 12, chisha: 15, hanyuan: 9, guixu: 14, xingyun: 10 },
    desc: '妖族世居的绵延妖山，七妖王各据一岭。人族入山须持妖王信物，否则视作血食。',
  },
  {
    id: 'xingyun', name: '星陨荒原', terrain: '陨坑荒原', qi: 3, danger: 5,
    products: ['仙品'],
    travel_days: { qingwu: 20, luoxia: 18, dayan: 16, chisha: 8, hanyuan: 11, guixu: 13, wanyao: 10 },
    desc: '上古天星坠地之处，陨铁与星砂遍地，遗族与陨铁盟为矿脉争了千年。',
  },
  {
    id: 'taiqing', name: '太清仙域', terrain: '仙山云海', qi: 6, danger: 3,
    products: ['仙品', '神品'],
    travel_days: {}, // 仙界不与凡界通paths：只能飞升
    desc: '传说中的仙界一角，灵气浓得化作云海。凡界无路可至，唯有飞升。',
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
  { id: 'guixufu', name: '归墟府', type: '朝廷', alignment: '正道', tier: 1, seat: 'guixu', desc: '归墟城的秩序掌控者，城中禁斗之规由它执行，靠星舟税养城。' },
  { id: 'xingzhou', name: '星舟行会', type: '商会', alignment: '中立', tier: 2, seat: 'guixu', desc: '垄断跨界星舟与传送阵，票价说一不二，万宝阁也让它三分。' },
  { id: 'qiyao', name: '七妖王', type: '妖族', alignment: '中立', tier: 1, seat: 'wanyao', desc: '万妖岭七位妖王共治，各自划界，人族的"信物"就是它们的牙印。' },
  { id: 'qingqiu', name: '青丘', type: '妖族', alignment: '中立', tier: 2, seat: 'wanyao', desc: '狐族一脉，善幻术与丹药，与七妖王面和心不和。' },
  { id: 'xingyun_clan', name: '星陨遗族', type: '散修联盟', alignment: '中立', tier: 2, seat: 'xingyun', desc: '自称上古星官后裔，守着陨坑里的星砂矿，与陨铁盟世代争矿。' },
  { id: 'yuntie', name: '陨铁盟', type: '帮派', alignment: '魔道', tier: 3, seat: 'xingyun', desc: '以陨铁锻兵起家的矿帮，强征遗族矿洞，血债累累。' },
  { id: 'taiqing_gong', name: '太清仙宫', type: '朝廷', alignment: '正道', tier: 1, seat: 'taiqing', desc: '仙界秩序的执掌者，凡人飞升在此登记，仙籍与凡籍一刀两断。' },
  { id: 'taishu', name: '太清书院', type: '宗门', alignment: '中立', tier: 2, seat: 'taiqing', desc: '仙域里的讲道之所，藏有天书残卷，对凡界飞升者既不亲也不拒。' },
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
  { a: 'wanbao', b: 'xingzhou', type: '竞争', note: '万宝阁想自开星舟线，行会寸步不让。' },
  { a: 'guixufu', b: 'xingzhou', type: '盟约', note: '城规靠行会的船运撑着，行会靠城规的禁斗护着。' },
  { a: 'guixufu', b: 'taiqing_gong', type: '从属', note: '归墟城的仙籍由太清仙宫册封，名义上听调。' },
  { a: 'qiyao', b: 'qingqiu', type: '竞争', note: '七妖王忌惮青丘幻术，划界时从不与狐族相邻。' },
  { a: 'qingqiu', b: 'cui', type: '交易', note: '青丘的丹方换崔氏的灵药，两家都说是"私谊"。' },
  { a: 'xingyun_clan', b: 'yuntie', type: '世仇', note: '陨铁盟强占矿洞，遗族的祭坛被推平了三座。' },
  { a: 'yuntie', b: 'huishi', type: '交易', note: '陨铁经灰市出货，绕过镇魔司的关防。' },
  { a: 'zhenmo', b: 'yuntie', type: '敌对', note: '镇魔司的缉魔令上，陨铁盟排在血刀寨之后第二位。' },
  { a: 'taiqing_gong', b: 'taishu', type: '竞争', note: '仙宫管仙籍，书院管传道，谁说了算争了万年。' },
  { a: 'taiqing_gong', b: 'jiaoren', type: '从属', note: '鲛人族的祖鳞是仙宫赐下的，故奉其号令。' },
  { a: 'xingluo', b: 'xingyun_clan', type: '盟约', note: '两族都自称星官后裔，认了同宗，互通沉船与星砂的消息。' },
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
  guixu: 1.6, wanyao: 1.8, xingyun: 1.7, taiqing: 3.0,
};

// 大势对物价的影响（与游戏 ERA_TYPES 的收益口径分开：这里只算市价）
const ERA_PRICE_MULT = { 盛世: 0.9, 乱世: 1.2, 末法时代: 1.5, 秘境将启: 1.1, 正魔大战: 1.25 };

// ============================================================
//  天时：世道不报名，只露征兆
//
//  原文里从来没有"天下大势"这种分类告诉玩家。韩立知道的是：米价涨了、路上多了结伙的散修、
//  宗门提前开山收徒、灵气一年淡过一年、禁地被封六十年（第 172 章）——世道是靠**征兆**被感知的。
//  所以内部仍分五种世道（管收益、危险、修炼、期限、采集稀有度），但对玩家只放三层征兆：
//    天象（天怎么变）／市面（钱货怎么变）／人事（人怎么变）。
//  境界越高读得越多：凡人只觉"不对劲"，筑基能说清哪不对，元婴才看得出灵气与劫气。
// ============================================================
export const ERA_SIGNS = {
  盛世: {
    sky: ['今岁风雨调顺，夜里少见异光', '开春雷声来得早，田里的苗都好', '入冬不冷，河冰迟迟不结'],
    market: ['坊市里灵米价平，行商络绎不绝', '药铺里常见货，掌柜也肯赊账', '灵石换物比往年划算'],
    people: ['宗门又开山收徒，街上多是新面孔', '官府遣人修桥铺路，路上少见盘查', '有世家子弟出入，排场不小'],
  },
  乱世: {
    sky: ['近年雨水不调，秋后常起怪风', '夜里见过赤色的星，村里老人说是兵兆', '冬日一场黑雾压了三天不散'],
    market: ['灵米价又涨了，行商少了小半', '药铺里疗伤丹断货，掌柜抬价三成', '有商队在路上被劫，货价一日一变'],
    people: ['路上多了结伙的散修，眼神不善', '关防忽然严了，进城要报来历', '有溃兵打扮的人进坊市换粮', '宗门闭门不收人，只说"待时局定了"'],
  },
  末法时代: {
    sky: ['灵气一年淡过一年，打坐时几乎觉不着', '古井干涸，村里老人说"地脉走了"', '夜里的灵光越来越少，天也显得灰'],
    market: ['灵石越发难挣，一物难求', '符纸涨价，画符的散修改行做买卖', '丹药价高且杂，多有不实的'],
    people: ['老人都在讲几百年前的好年景', '宗门遣人四处找灵脉，连荒山都不放过', '有散修说在某处见过上古遗迹'],
  },
  秘境将启: {
    sky: ['接连三月地动，山里有雾不散', '夜里常有异光自东南起，隐约有雷鸣', '河水忽然倒流一截，船家不敢行'],
    market: ['坊市里都在打听秘境的消息，地图涨价', '有人高价收探路的散修，一趟十块灵石', '丹药、符箓都被扫货'],
    people: ['各宗门都在暗中集结人手', '有"假秘境"的骗局，已有散修上当', '路上多了自称"守境人"的怪人'],
  },
  正魔大战: {
    sky: ['天上常有血色残云，白昼也见星', '雷声连着半月不歇，村人说有大事', '夜里的阴风带来血气'],
    market: ['军需涨价，灵石、丹药、法宝都在扫', '正道城池盘查魔修，物价抬了一截', '黑市里什么都卖，价却越来越高'],
    people: ['两派都在拉人，散修被逼着站队', '有逃兵自西边来，讲那边屠了三个村', '城门口挂着悬赏，赏格一日高过一日'],
  },
};

// 传闻从谁嘴里说出来（名字越具体，玩家越记得住）
export const RUMOR_SOURCES = ['茶馆掌柜', '行商', '同门师兄', '坊市药童', '落脚处的樵夫', '酒肆里的散修', '游方道人', '驿馆伙计'];

export function signsOf(eraType) {
  return ERA_SIGNS[eraType] || ERA_SIGNS['乱世'];
}


// ============================================================
//  地脉枯荣：灵气被采狠了会流失，封山久了才回补
//
//  原文根据（逐条核对过原文，不是转述）：
//   · 第 220 章《灵眼之泉》：天地灵气"有的地方浓郁一些，有的地方淡薄一点"，
//     灵气浓重之地会"形成或大或小的灵脉"；灵脉一旦成形，"便会自动散发出淡淡的灵气，
//     让当地的灵气循环不绝，不会有枯竭之日"；灵脉中灵气郁结最浓处称"灵眼"，
//     "当然最适合修仙者打坐修炼了"。
//     ⇒ 有灵脉的地方不会自己枯；灵气浓淡决定修炼快慢。
//   · 第 172 章《选择》：禁地"频繁的开启，会让其内的灵气大量流失，灵药的产生和生长的速度
//     都会减缓起来"；圈封五六十年能让灵气密度"恢复到正常的水准"，若要把灵药数量养回来
//     "必须把圈封的时间拖延到足足千年"。七大派明知是"杀鸡取卵"仍得做，因为灵药短缺会
//     牵动筑基丹，进而关系七大派兴亡。
//     ⇒ **枯是采出来的**；只有停止开采才回补，而且回补远慢于流失。
//
//  所以本作不做"灵气随机涨落"：一地的 qi 只会被开采压下去，封山后能回到原样，
//  上限永远是表里的底值。状态存存档 world.regionQi，静态九域表不动。
// ============================================================
export const QI_LABELS = { 1: '枯涸', 2: '稀薄', 3: '寻常', 4: '丰沛', 5: '浓郁', 6: '灵涌' };

// 枯荣参数（数据层只给常量；何时加压、何时回补由 game.js 判定）
export const REGION_QI_RULES = {
  harvestCost: { 凡品: 4, 灵品: 8, 玄品: 14, 仙品: 22, 神品: 30 }, // 采一次压多少压力
  pressurePerLevel: 30,   // 压力攒满这么多，灵气掉一寸
  idleDecayPerMonth: 2,   // 不采时压力每月自消
  recoverPerMonths: 24,   // 掉下去的灵气，封山两年回一寸（第 172 章：五六十年的圈封才见效）
  maxChronicle: 12,
};

function clampQi(qi) {
  return Math.max(1, Math.min(6, Math.round(Number(qi) || 1)));
}

export function qiLabel(qi) {
  return QI_LABELS[clampQi(qi)] || '寻常';
}

// 某地的枯荣记录：{ qi: 当前灵气, pressure: 开采压力, idle: 连续无采月数 }
export function regionQiState(world, regionId) {
  const all = world && world.regionQi;
  if (!all || typeof all !== 'object' || !regionId) return null;
  const hit = Object.prototype.hasOwnProperty.call(all, regionId) ? all[regionId] : null;
  return hit && typeof hit === 'object' ? hit : null;
}

// 这一刻的实际灵气：以存档里的当前值为准；上限是表里的底值（灵脉会回到常态，不会更好）
export function regionQi(region, world = null) {
  if (!region) return 3;
  const base = clampQi(region.qi);
  const st = regionQiState(world, region.id);
  if (!st || !Number.isFinite(st.qi)) return base;
  return Math.max(1, Math.min(base, clampQi(st.qi)));
}

// 灵气对修炼的影响：寻常(3) 为基准，枯涸 0.90、灵涌 1.15——差异可感，压不过功法与灵根
export function qiCultMult(qi) {
  return Math.round((1 + (clampQi(qi) - 3) * 0.05) * 100) / 100;
}
// 灵气对物价的影响：本地灵药被采枯了，物以稀为贵（第 172 章：灵药短缺牵动筑基丹与七大派兴亡）
export function qiPriceMult(qi) {
  return Math.round((1 + (3 - clampQi(qi)) * 0.04) * 100) / 100;
}

// 境界阶梯的粗排序（本地实现，避免与 game.js 循环依赖）
const REALM_RANK = { 凡人: 0, 炼气: 1, 筑基: 2, 金丹: 3, 元婴: 4, 化神: 5, 炼虚: 6, 合体: 7, 大乘: 8, 渡劫: 9, 飞升: 10 };
function realmRank(realm) {
  const key = Object.keys(REALM_RANK).find((k) => String(realm || '').startsWith(k));
  return key === undefined ? 0 : REALM_RANK[key];
}

// ---------- 开局定图：一局的地图在开头就钉死 ----------
// 以前地图是"静态九域 + 局中随时新开的地"。现在改成：**开局一次性把地图写进存档 world.map**，
// 之后谁都不许改——区域、路程、物价系数都以存档里的这份为准。
// 好处：势力、路程、物价、秘境、采集点全挂在同一张图上，叙事不会前后矛盾；
// 旧档没有 map 的，读档时按"静态表 + 已有的动态区域"补一份，幂等、不判罚。
function dynamicRegions(world) {
  return world && Array.isArray(world.dynamicRegions) ? world.dynamicRegions : [];
}

export function worldMapOf(world) {
  return world && world.map && Array.isArray(world.map.regions) && world.map.regions.length ? world.map : null;
}

// 把地图钉进存档（幂等：已有就原样返回，绝不覆盖）
export function lockWorldMap(world) {
  if (!world || typeof world !== 'object') return null;
  const existing = worldMapOf(world);
  if (existing) return existing;
  const regions = [...REGIONS, ...dynamicRegions(world)].map((r) => ({
    id: r.id,
    name: r.name,
    terrain: r.terrain,
    qi: r.qi,
    danger: r.danger,
    products: Array.isArray(r.products) ? r.products.slice() : [],
    travel_days: { ...(r.travel_days || {}) },
    desc: r.desc,
    ...(Number.isFinite(r.price) ? { price: r.price } : {}),
    ...(r.dynamic ? { dynamic: true } : {}),
  }));
  const travel = { ...((world && world.dynamicTravel) || {}) };
  world.map = { version: WORLD_VERSION, lockedAtTurn: world.turn || 0, regions, travel };
  return world.map;
}

export function regionById(id, world = null) {
  const map = worldMapOf(world);
  if (map) return map.regions.find((r) => r.id === id) || null;
  return dynamicRegions(world).find((r) => r.id === id) || REGIONS.find((r) => r.id === id) || null;
}
export function regionByName(name, world = null) {
  if (!name) return null;
  const raw = String(name).trim();
  const all = worldMapOf(world) ? worldMapOf(world).regions : [...dynamicRegions(world), ...REGIONS];
  return all.find((r) => r.name === raw) ||
    all.find((r) => raw.includes(r.name) || r.name.includes(raw)) || null;
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
export function allRegions(world = null) {
  const map = worldMapOf(world);
  return map ? map.regions.slice() : [...REGIONS, ...dynamicRegions(world)];
}
export function allFactions() { return FACTIONS.slice(); }
export function allRelations() { return RELATIONS.slice(); }

// 路程：表里有就直接用；没有就按相邻图做最短路（跨区域赶路必须中转）。
// world 用于查玩家开辟的动态区域与动态路程。
export function travelDays(fromId, toId, world = null) {
  if (!fromId || !toId || fromId === toId) return 0;
  const from = regionById(fromId, world);
  const to = regionById(toId, world);
  if (!from || !to) return null;
  const direct = from.travel_days && from.travel_days[toId];
  if (Number.isFinite(direct)) return direct;
  const mapTravel = (world && world.map && world.map.travel) || null;
  const dyn = (mapTravel && mapTravel[`${fromId}|${toId}`]) ??
    (world && world.dynamicTravel && world.dynamicTravel[`${fromId}|${toId}`]);
  if (Number.isFinite(dyn)) return dyn;
  const extra = mapTravel || (world && world.dynamicTravel) || {};
  const neighbors = (id) => {
    const r = regionById(id, world);
    if (!r) return [];
    const list = Object.entries(r.travel_days || {});
    for (const [k, d] of Object.entries(extra)) {
      const [a, b] = k.split('|');
      if (a === id) list.push([b, d]);
    }
    return list;
  };
  // BFS 最短路
  const seen = new Set([fromId]);
  let frontier = [[fromId, 0]];
  while (frontier.length) {
    const next = [];
    for (const [id, dist] of frontier) {
      for (const [nid, d] of neighbors(id)) {
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

export function priceMultiplier(regionId, eraType, world = null) {
  const region = regionById(regionId, world);
  const r = REGION_PRICE_MULT[regionId] ?? (region && region.price) ?? 1;
  const e = ERA_PRICE_MULT[eraType] ?? 1;
  // 灵气对物价只算「漂移量」：底值差异已经由 REGION_PRICE_MULT 承担，再乘一遍是重复计价。
  // 于是没有漂移时此系数恒为 1，旧档与旧测试的价格口径不变。
  const q = region
    ? Math.round((qiPriceMult(regionQi(region, world)) / qiPriceMult(region.qi)) * 100) / 100
    : 1;
  return Math.round(r * e * q * 100) / 100;
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
  const existing = world.geo && regionById(world.geo.regionId, world);
  if (existing) return world.geo;
  const fromName = regionByName(opts.preferredName, world) ||
    regionByName(world.startingLocation && world.startingLocation.name, world);
  const regionId = (fromName && fromName.id) || opts.fallbackId || pickStarter();
  world.geo = { regionId, sinceTurn: world.turn || 0, migrated: !!world.turn };
  return world.geo;
}

export function currentRegion(world) {
  const geo = world && world.geo;
  return (geo && regionById(geo.regionId, world)) || null;
}

// 移动：返回 { from, to, days }；不连通或原地返回 null。
export function moveToRegion(world, targetId) {
  const to = regionById(targetId, world);
  if (!to) return null;
  const geo = ensureWorldGeo(world);
  if (!geo || geo.regionId === targetId) return null;
  const days = travelDays(geo.regionId, targetId, world);
  if (days === null) return null; // 跨界面，只能飞升
  const from = regionById(geo.regionId, world);
  world.geo = { ...geo, regionId: targetId, sinceTurn: world.turn || 0 };
  return { from, to, days };
}

// 势力的"底细"：引擎知道真相，但不写进开局切片。玩家起疑（调查类动作）才把线索交给 GM，
// 查到实证（提取器 reveals）之后才在图鉴与切片里标记。真相与线索分离，避免一开口就剧透。
const SECRETS = {
  bailu: {
    of: 'xuedao',
    truth: '白鹿观明面中立，实为血刀寨暗桩，替其销赃、递消息。',
    trail: '夜里常有戴斗笠的人从后门进出；账上多出一笔来路不明的灵石，记作"香火"。',
  },
  qingwu_court: {
    of: 'shiyun',
    truth: '青芜王朝年年向拾云门纳贡，换修士护国；国库那笔银子记作"河工"。',
    trail: '每年秋后国库少一笔银子，账册写作"河工"，可河工这些年一次没修过。',
  },
};

export function secretOf(factionId) {
  return SECRETS[factionId] || null;
}

export function factionByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  return FACTIONS.find((f) => f.name === raw) || null;
}

// 当前区域里"有底细"的势力（不论玩家是否见过）。
export function secretFactionsIn(regionId) {
  return FACTIONS.filter((f) => f.seat === regionId && SECRETS[f.id]);
}

const FACTION_TIER_LABEL = { 1: '一级', 2: '二级', 3: '三级', 4: '四级', 5: '五级' };

// 每回合的切片：只给当前区域、**已打过交道的**当地势力、路口和物价系数。约 200~260 字。
export function buildSlice(player, world) {
  const geo = world && world.geo;
  if (!geo) return '';
  const region = regionById(geo.regionId, world);
  if (!region) return '';
  const allHere = factionsIn(region.id);
  const knownNames = new Set((world.factions || []).map((f) => f.name));
  let here = allHere.filter((f) => knownNames.has(f.name));
  // 旧档或空名单：只给当家人，别把整张名单摊开
  if (!here.length) here = allHere.filter((f) => f.tier <= 2).slice(0, 2);
  const unknownCount = Math.max(0, allHere.length - here.length);
  const secrets = (world && world.knownSecrets) || {};
  const facText = here.map((f) => {
    const state = secrets[f.id];
    const tag = f.hidden && state === 'revealed' ? '·表里不一' : (state === 'hinted' ? '·有蹊跷' : '');
    return `${f.name}(${FACTION_TIER_LABEL[f.tier]}·${f.alignment}${tag})`;
  }).join('、');
  // 已查明的底细才写进切片，供 GM 引用；没查明的连字样都不出现
  const revealedText = here
    .filter((f) => secrets[f.id] === 'revealed' && SECRETS[f.id])
    .map((f) => `${f.name}：${SECRETS[f.id].truth}`)
    .join('');
  const roads = Object.entries(region.travel_days || {})
    .map(([id, d]) => { const r = regionById(id, world); return r ? `${r.name}${d}日` : ''; })
    .filter(Boolean).join('、');
  const mult = priceMultiplier(region.id, world.eraType, world);
  const topRarity = region.products[region.products.length - 1];
  const mats = materialNamesInRegion(region.id, 4);
  const eq = regionQi(region, world);
  const ed = region.danger;
  const overLevel = realmRank(player && player.realm) - ed * 2 >= 2;
  // 地脉纪事：本地最近两条，让"这地方被采枯过 / 正在缓过来"能被叙事看见
  const chronicle = (Array.isArray(world.regionQiLog) ? world.regionQiLog : [])
    .filter((c) => c && c.regionId === region.id)
    .slice(-2)
    .map((c) => c.text);

  const lines = [
    `【世界切片】区域：${region.name}（${region.desc}）灵气${eq}（${qiLabel(eq)}）·危险${ed}。`,
    chronicle.length ? `【地脉】${chronicle.join('；')}` : '',
    facText ? `已知势力：${facText}。` : '',
    unknownCount > 0 ? `此外还有 ${unknownCount} 家势力未与之打过交道。` : '',
    roads ? `可达：${roads}。` : '',
    `物价×${mult.toFixed(2)}；本地产出上限${topRarity}。`,
    mats.length ? `可采：${mats.join('、')}。` : '',
    revealedText ? `【已查明】${revealedText}` : '',
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
    id: f.id,
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

// ============================================================
//  区域生成标准（玩家开辟新域时，模型只能"提议"，入图与否由这里判定）
//
//  标准来自九域的取值规律：灵气 1~6、危险 1~5、产出随灵气与危险抬升、
//  每块地都要有路（1~60 日）、描述不超 90 字。九域的表本身不动，
//  玩家开出来的地存进存档（world.dynamicRegions），可跨回合、可读档。
// ============================================================
export const REGION_STANDARD = {
  nameLen: [2, 8],
  terrainLen: [2, 8],
  qi: [1, 6],
  danger: [1, 5],
  travel: [1, 60],
  descLen: 90,
  maxDynamic: 24,
  rarities: ['凡品', '灵品', '玄品', '仙品', '神品'],
};

const RARITY_RANK = { 凡品: 0, 灵品: 1, 玄品: 2, 仙品: 3, 神品: 4 };

export function validateRegionProposal(proposal, world = null) {
  const issues = [];
  const p = proposal && typeof proposal === 'object' ? proposal : {};
  const name = String(p.name || '').trim();
  const terrain = String(p.terrain || '').trim();
  const qi = Number(p.qi);
  const danger = Number(p.danger);
  const products = Array.isArray(p.products)
    ? p.products.filter((x) => REGION_STANDARD.rarities.includes(x))
    : [];
  const desc = String(p.desc || '').trim();
  const links = Array.isArray(p.links)
    ? p.links
    : (p.travel_days && typeof p.travel_days === 'object'
      ? Object.entries(p.travel_days).map(([to, days]) => ({ to, days }))
      : []);

  if (name.length < 2 || name.length > 8) issues.push('区域名须 2~8 字');
  else if (regionByName(name, world)) issues.push(`「${name}」已存在`);
  if (terrain.length < 2 || terrain.length > 8) issues.push('地形须 2~8 字');
  if (!Number.isInteger(qi) || qi < 1 || qi > 6) issues.push('灵气须为 1~6 的整数');
  if (!Number.isInteger(danger) || danger < 1 || danger > 5) issues.push('危险须为 1~5 的整数');
  if (!products.length) issues.push('至少指定一种产出');
  if (desc.length > REGION_STANDARD.descLen) issues.push(`描述不得超过 ${REGION_STANDARD.descLen} 字`);

  // 产出与地气匹配：上限 = floor((灵气+危险)/2)；仙品要 4 级以上，神品要灵气 ≥5
  if (products.length && Number.isInteger(qi) && Number.isInteger(danger)) {
    const maxRank = Math.min(4, Math.floor((qi + danger) / 2));
    const top = Math.max(...products.map((x) => RARITY_RANK[x]));
    if (top > maxRank) {
      issues.push(`灵气${qi}·危险${danger} 的地界出不了${REGION_STANDARD.rarities[top]}（上限${REGION_STANDARD.rarities[maxRank]}）`);
    }
    if (top >= 3 && qi < 4 && danger < 4) issues.push('仙品以上须灵气≥4 或危险≥4');
    if (top >= 4 && qi < 5) issues.push('神品须灵气≥5');
  }

  const validLinks = [];
  for (const l of links) {
    const to = regionByName(String((l && l.to) || '').trim(), world);
    const days = Number(l && l.days);
    if (!to) { issues.push(`路通往未知区域「${(l && l.to) || ''}」`); continue; }
    if (!Number.isInteger(days) || days < REGION_STANDARD.travel[0] || days > REGION_STANDARD.travel[1]) {
      issues.push(`通往${to.name}的路程须为 1~60 的整数日`);
      continue;
    }
    validLinks.push({ to: to.id, days });
  }
  if (!validLinks.length) issues.push('新区域至少要有一条通往外界的路');

  const dynamicCount = world && Array.isArray(world.dynamicRegions) ? world.dynamicRegions.length : 0;
  if (dynamicCount >= REGION_STANDARD.maxDynamic) issues.push(`一局最多开辟 ${REGION_STANDARD.maxDynamic} 个新区域`);

  if (issues.length) return { ok: false, issues, region: null };

  const rawId = String(p.id || `dyn_${name}`).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const id = rawId || `dyn_${dynamicCount + 1}`;
  const price = Math.round((1 + (qi - 2) * 0.1 + (danger - 2) * 0.1) * 100) / 100;
  const region = {
    id,
    name,
    terrain,
    qi,
    danger,
    products: products.slice().sort((a, b) => RARITY_RANK[a] - RARITY_RANK[b]),
    travel_days: Object.fromEntries(validLinks.map((l) => [l.to, l.days])),
    desc,
    price: Math.max(0.7, Math.min(3, price)),
    dynamic: true,
  };
  return { ok: true, region, links: validLinks, issues: [] };
}

// 入图：写进存档，并把来回两程都记上（路程必须对称）
// 开局定图之后，这条路就关了——一局的地图在开头钉死，中途不许再长出新地界。
export function addRegion(world, proposal) {
  if (!world) return { ok: false, issues: ['没有存档'], region: null };
  if (worldMapOf(world)) return { ok: false, issues: ['本局地图已在开局定死，不能再开辟新域；未知之地只能作为传闻或遗迹存在'], region: null };
  const res = validateRegionProposal(proposal, world);
  if (!res.ok) return res;
  if (!Array.isArray(world.dynamicRegions)) world.dynamicRegions = [];
  if (!world.dynamicTravel || typeof world.dynamicTravel !== 'object') world.dynamicTravel = {};
  world.dynamicRegions.push(res.region);
  for (const l of res.links) {
    world.dynamicTravel[`${res.region.id}|${l.to}`] = l.days;
    world.dynamicTravel[`${l.to}|${res.region.id}`] = l.days;
  }
  const roads = res.links.map((l) => {
    const r = regionById(l.to, world);
    return `${r ? r.name : l.to} ${l.days}日`;
  }).join('、');
  return { ...res, note: `【新域】「${res.region.name}」已入图：灵气${res.region.qi}·危险${res.region.danger}，往来 ${roads}。` };
}
