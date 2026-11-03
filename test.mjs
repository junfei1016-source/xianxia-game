import {
  newPlayerState, newWorldState, applyStateUpdates, advanceTime,
  reputationMultiplier, moralityGainMultiplier, fortuneMultiplier, alignmentLabel,
  isIdentityName, surnameOf, autoNameNpcs, factionAlignment,
  ERA_TYPES, eraTypeFromText,
  ORIGINS, originTypeFromText,
  gradeMult, breakthroughNeed, cultGainMult, buildWorldContext, lengthLimit, kindFromText, ITEM_KINDS,
  relationCultMult, factionCultMult, combatDiff, combatDamageMult, combatDeathMult, equipDefenseMult, equipAttackMult, closedDoorMult,
  RARITIES, RARITY_LEVELS, rarityMult, affixEffects, breakthroughRate, attemptBreakthrough,
  evaluateEndings, evaluateAchievements, parseLLMJSON,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// parseLLMJSON 容错
const fenced = '```json\n{"narrative":"hi","stateUpdates":{"hp":{"delta":-10}}}\n```';
const p1 = parseLLMJSON(fenced);
assert('解析代码块包裹的 JSON', p1 && p1.narrative === 'hi' && p1.stateUpdates.hp.delta === -10);
const stray = '前方文字 {"a": 1} 后方文字';
const p2 = parseLLMJSON(stray);
assert('解析夹带文字的 JSON', p2 && p2.a === 1);
assert('非 JSON 返回 null', parseLLMJSON('这里没有json') === null);
const curly = parseLLMJSON('{“narrative”:“黑袍人逼近”}');
assert('解析弯引号 JSON', curly && curly.narrative === '黑袍人逼近');
const validWithCurlyText = parseLLMJSON('{"narrative":"他说“你好”"}');
assert('合法 JSON 内弯引号不被破坏', validWithCurlyText && validWithCurlyText.narrative === '他说“你好”');

// applyStateUpdates：数值夹取 + 突破 + 去重 + 目标 + 标记
const player = newPlayerState();
const world = newWorldState();
world.date = { year: 5, month: 1, day: 1 }; // 跨过"凡人至少 3 年"的下限，专测突破结算
applyStateUpdates(player, world, {
  stateUpdates: { hp: { delta: -200 }, morality: { delta: -150 }, spiritStones: { delta: 50 }, cultivation: { delta: 40 } },
  realmChange: '炼气初期',
  newNpcs: [{ name: '张三', desc: 'x' }, { name: '张三', desc: 'dup' }],
  goal: { type: '复仇', target: '李四', desc: '为家族报仇', status: '进行中' },
  flags: { hasSect: true },
});
assert('重伤只到濒死不致死（hp=1 + 生死一线）', world.flags.deathImminent === true);
assert('突破时气血随上限同步充盈（1→101，伤势保留）', player.hp === 101);
assert('正邪夹取到 -100', player.morality === -100);
assert('灵石 +50', player.spiritStones === 50);
assert('境界突破到炼气初期', player.realm === '炼气初期');
assert('突破后修为进度清零', player.cultivation === 0);
assert('境界提升自动延长寿元', player.lifespan === 150);
assert('境界提升自动提高气血上限', player.maxHp === 200);
assert('新NPC去重', world.npcs.length === 1 && world.npcs[0].name === '张三');
assert('誓愿目标已合并', world.goal.type === '复仇' && world.goal.target === '李四');
assert('剧情标记已写入', world.flags.hasSect === true);

// 满血突破：气血保持满血（100/100 → 200/200），不留"看似掉血"的空槽
const fullP = newPlayerState();
const fullW = newWorldState();
fullW.date = { year: 5, month: 1, day: 1 };
applyStateUpdates(fullP, fullW, { realmChange: '炼气初期' });
assert('满血突破后仍满血（200/200）', fullP.hp === 200 && fullP.maxHp === 200);
// 半血突破：同幅恢复（50/100 → 150/200），伤势差额保留
const halfP = newPlayerState();
halfP.hp = 50;
const halfW = newWorldState();
halfW.date = { year: 5, month: 1, day: 1 };
applyStateUpdates(halfP, halfW, { realmChange: '炼气初期' });
assert('半血突破同幅恢复（150/200）', halfP.hp === 150 && halfP.maxHp === 200);

// 目标达成 → 标记
applyStateUpdates(player, world, { goal: { status: '达成' } });
assert('目标达成写入 goalCompleted', world.flags.goalCompleted === true);

// 防御：提取器输出平铺属性时也能应用
const flatPlayer = newPlayerState();
const flatWorld = newWorldState();
applyStateUpdates(flatPlayer, flatWorld, { spiritStones: 30, hp: { delta: -20 } });
assert('平铺数字按 delta 应用', flatPlayer.spiritStones === 30 && flatPlayer.hp === 80);

// 通关判定
assert('死亡结局', evaluateEndings({ ...newPlayerState(), hp: 0 })?.id === 'death');
const asc = evaluateEndings({ ...newPlayerState(), realm: '飞升' });
assert('飞升结局且为主目标', asc?.id === 'ascend' && asc.win === true);
const demon = evaluateEndings({ ...newPlayerState(), morality: -90, realm: '化神初期' });
assert('堕入魔道结局', demon?.id === 'demon');

// 法言天地（外挂模式）：免伤、免死、寿元不流逝，只以飞升通关
const godWorld = { settings: { godMode: true } };
assert('法言天地不死', evaluateEndings({ ...newPlayerState(), hp: 0 }, godWorld) === null);
assert('法言天地不堕魔', evaluateEndings({ ...newPlayerState(), morality: -90, realm: '化神初期' }, godWorld) === null);
assert('法言天地仍可飞升通关', evaluateEndings({ ...newPlayerState(), realm: '飞升' }, godWorld)?.id === 'ascend');
const gp = newPlayerState();
applyStateUpdates(gp, { ...newWorldState(), settings: { godMode: true } }, { stateUpdates: { hp: { delta: -999 } }, risk: 'lethal' });
assert('法言天地免伤且不掷死亡骰', gp.hp === gp.maxHp && gp.hp > 0);
const gtPlayer = newPlayerState();
advanceTime({ ...newWorldState(), settings: { godMode: true } }, gtPlayer, 120);
assert('法言天地寿元不流逝', gtPlayer.lifespan === 100);

// 成就判定
assert('凡人无成就', evaluateAchievements(newPlayerState(), newWorldState()).length === 0);
assert('炼气解锁初窥门径', evaluateAchievements({ ...newPlayerState(), realm: '炼气初期' }, newWorldState()).includes('初窥门径'));
assert('开宗立派成就', evaluateAchievements({ ...newPlayerState(), realm: '炼气初期' }, { ...newWorldState(), flags: { hasSect: true } }).includes('开宗立派'));

// 难度 / 节奏
const hpHard = newPlayerState();
applyStateUpdates(hpHard, { ...newWorldState(), settings: { difficulty: '困难', pace: '慢', turnLimit: 0 } }, { stateUpdates: { hp: { delta: -10 } } });
assert('困难难度受伤加重(1.5x)', hpHard.hp === 85);
const cultFast = newPlayerState();
applyStateUpdates(cultFast, { ...newWorldState(), settings: { difficulty: '普通', pace: '快', turnLimit: 0 } }, { stateUpdates: { cultivation: { delta: 10 } } });
assert('快节奏修为加速(2x)', cultFast.cultivation === 20);

// 新结局：寿元耗尽 / 回合上限
assert('寿元耗尽结局', evaluateEndings({ ...newPlayerState(), lifespan: 0 })?.id === 'lifespan');
const timeupWorld = { ...newWorldState(), turn: 51, settings: { difficulty: '普通', pace: '慢', turnLimit: 50 } };
assert('回合上限结局', evaluateEndings(newPlayerState(), timeupWorld)?.id === 'timeup');
assert('飞升时不受回合上限限制', evaluateEndings({ ...newPlayerState(), realm: '飞升' }, timeupWorld)?.id === 'ascend');

// 支线任务登记与完成
const qWorld = newWorldState();
applyStateUpdates(newPlayerState(), qWorld, { newQuests: [{ title: '护送商队', objective: '护送到青州', timeNode: '三日内', reward: '30灵石' }] });
assert('支线任务登记', qWorld.quests.some((q) => q.title === '护送商队' && q.type === 'side' && q.status === 'active'));
applyStateUpdates(newPlayerState(), qWorld, { questUpdates: [{ title: '护送商队', status: 'completed' }] });
assert('支线任务完成', qWorld.quests.find((q) => q.title === '护送商队').status === 'completed');
assert('任务完成记入事迹', qWorld.events.some((e) => e.subject === '护送商队' && e.title === '已完成'));

// 目标达成记入事迹
const gWorld = newWorldState();
applyStateUpdates(newPlayerState(), gWorld, { goal: { type: '复仇', desc: '为家族报仇', status: '达成' } });
assert('目标达成记入事迹', gWorld.events.some((e) => e.subject === '复仇' && e.title === '达成'));

// 势力关系标签
const fWorld = newWorldState();
fWorld.factions = [{ name: '剑宗', desc: '正道大派' }];
applyStateUpdates(newPlayerState(), fWorld, { factionRelations: [{ name: '剑宗', relation: '结盟' }] });
assert('势力关系结盟', fWorld.factions.find((f) => f.name === '剑宗').relation === '结盟');

// 支线任务期限
const dWorld = newWorldState();
applyStateUpdates(newPlayerState(), dWorld, { newQuests: [{ title: '护送商队', objective: '护送到青州', timeNode: '三日内', reward: '30灵石', deadlineDays: 3 }] });
const dq = dWorld.quests.find((q) => q.title === '护送商队');
assert('任务期限按游戏日期记录（三日后为1年1月4日）', dq && dq.deadlineDate?.year === 1 && dq.deadlineDate?.month === 1 && dq.deadlineDate?.day === 4);
assert('新任务不再保存回合截止字段', dq && dq.deadlineTurn === undefined);

// 自动命名：身份代称→姓名，血缘同姓
const nWorld = newWorldState();
const res = autoNameNpcs(nWorld, [
  { name: '老樵夫', desc: '卖柴老人' },
  { name: '老樵夫的儿子', desc: '少年', family: { of: '老樵夫', relation: '父子' } },
]);
const father = res[0];
const son = res[1];
assert('身份代称自动命名', father.name !== '老樵夫' && nWorld.aliasMap['老樵夫'] === father.name);
assert('血缘同姓', surnameOf(son.name) === surnameOf(father.name) && surnameOf(father.name) !== '');
assert('已有姓名保留', autoNameNpcs(newWorldState(), [{ name: '苏瑶', desc: '' }])[0].name === '苏瑶');

// 势力阵营立场
assert('势力阵营从描述推断', factionAlignment({ desc: '正道六宗之一' }) === '正道' && factionAlignment({ desc: '魔道三大势力之首' }) === '魔道' && factionAlignment({ desc: '散修联盟' }) === '中立');
assert('势力阵营显式字段优先', factionAlignment({ alignment: '魔道', desc: '正道大派' }) === '魔道');
assert('血煞魔宫判为魔道(名字优先)', factionAlignment({ name: '血煞魔宫', desc: '魔道三大势力之首，侵扰正道边境' }) === '魔道');
assert('青州剑宗判为正道', factionAlignment({ name: '青州剑宗', desc: '正道六宗之一' }) === '正道');

// 事迹主体对齐姓名（身份代称 → aliasMap 姓名）
const evWorld = newWorldState();
evWorld.aliasMap = { '老樵夫': '王铁山' };
applyStateUpdates(newPlayerState(), evWorld, { newEvents: [{ subject: '老樵夫', title: '初遇', desc: '' }] });
assert('事迹主体对齐姓名', evWorld.events[0].subject === '王铁山');

// 天下大势
assert('大势从文本推断', eraTypeFromText('魔道大兴，正道式微') === '乱世' && eraTypeFromText('盛世太平') === '盛世');
assert('大势乘数有得有失', ERA_TYPES['末法时代'].cultMult < 1 && ERA_TYPES['盛世'].dangerMult < 1 && ERA_TYPES['盛世'].gainMult > 1);
const eWorld = newWorldState();
eWorld.eraType = '末法时代';
const ePlayer = newPlayerState();
applyStateUpdates(ePlayer, eWorld, { stateUpdates: { cultivation: { delta: 20 } } });
assert('末法时代修炼变慢(0.75x)', ePlayer.cultivation === 15);

// 出身加成
assert('魔道世家出身偏魔道', ORIGINS['魔道世家'].morality < 0);
assert('出身从文本推断', originTypeFromText('魔门弃徒，流浪江湖') === '魔门弃徒');
assert('世家出身推断', originTypeFromText('青州修仙世家子弟') === '世家子弟');

// 深交后揭示性格
const rWorld = newWorldState();
rWorld.npcs = [{ name: '苏瑶', desc: '', relation: '初识', personality: '傲娇', personalityRevealed: false }];
applyStateUpdates(newPlayerState(), rWorld, { npcRelations: [{ name: '苏瑶', relation: '结为挚友' }] });
const suyao = rWorld.npcs.find((n) => n.name === '苏瑶');
assert('深交后揭示性格', suyao.relation === '结为挚友' && suyao.personalityRevealed === true);

// 闭关时长放大修为
const ccPlayer = newPlayerState();
const ccWorld = newWorldState();
applyStateUpdates(ccPlayer, ccWorld, { timeMonths: 3, stateUpdates: { cultivation: { delta: 15 } } });
assert('闭关三月修为放大三倍', ccPlayer.cultivation === 45);

// 时间压缩：闭关十年(120月)如实放大，修为顶满
const yyPlayer = newPlayerState();
applyStateUpdates(yyPlayer, newWorldState(), { timeMonths: 120, stateUpdates: { cultivation: { delta: 10 } } });
assert('闭关十年修为顶满(120倍放大)', yyPlayer.cultivation === 100);

// 修为增益：玩家可控倍率
const gPlayer = newPlayerState();
applyStateUpdates(gPlayer, { ...newWorldState(), settings: { difficulty: '普通', pace: '慢', turnLimit: 50, cultGain: '2x' } }, { stateUpdates: { cultivation: { delta: 10 } } });
assert('修为增益2x翻倍', gPlayer.cultivation === 20);
assert('修为增益解析', cultGainMult('3x') === 3 && cultGainMult('0.5x') === 0.5 && cultGainMult(undefined) === 1 && cultGainMult('垃圾') === 1);

// 世界上下文瘦身（快照精简）
const cwWorld = newWorldState();
cwWorld.items = Array.from({ length: 30 }, (_, i) => ({ name: '物品' + i, desc: '图鉴说明' }));
cwWorld.events = Array.from({ length: 25 }, (_, i) => ({ subject: '苏瑶', title: '事' + i, desc: '记录' }));
cwWorld.quests = [
  { id: 'q1', type: 'side', title: '活跃任务', status: 'active' },
  { id: 'q2', type: 'side', title: '已完成任务', status: 'completed' },
];
cwWorld.memory = 'X'.repeat(1000);
cwWorld.inventory = [{ name: '剑', desc: '', qty: 1 }];
cwWorld.skills = [{ name: '功法', desc: '', grade: '基础' }];
const ctx = buildWorldContext(cwWorld);
assert('快照不含图鉴全集', !('items' in ctx));
assert('快照事迹截断到最近10条', ctx.events.length === 10);
assert('快照只含活跃任务', ctx.quests.length === 1 && ctx.quests[0].title === '活跃任务');
assert('快照记忆截断到1000字', ctx.memory.length === 1000);
assert('快照保留背包与功法', ctx.inventory.length === 1 && ctx.skills.length === 1);

// 叙事篇幅档位
assert('篇幅档位', lengthLimit('精简') === '约150字' && lengthLimit('标准') === '约250字' && lengthLimit('丰富') === '约400字' && lengthLimit(undefined) === '约250字');

// 功法品阶加成
const sWorld = newWorldState();
sWorld.skills = [{ name: '天阶剑诀', desc: '', grade: '天阶' }];
const sPlayer = newPlayerState();
applyStateUpdates(sPlayer, sWorld, { stateUpdates: { cultivation: { delta: 10 } } });
assert('天阶功法修炼加成(2x)', sPlayer.cultivation === 20);
assert('品阶倍率', gradeMult('仙阶') > gradeMult('地阶') && gradeMult('基础') === 1.0);

// 物品品类推断
assert('品类推断：丹药', kindFromText('疗伤丹') === '丹药' && kindFromText('聚气散') === '丹药');
assert('品类推断：武器', kindFromText('青锋剑') === '武器' && kindFromText('玄铁枪') === '武器');
assert('品类推断：法宝', kindFromText('玄天镜') === '法宝' && kindFromText('镇魂铃') === '法宝');
assert('品类推断：衣物', kindFromText('云纹道袍') === '衣物' && kindFromText('玄铁战甲') === '衣物');
assert('品类推断：天材地宝', kindFromText('千年灵芝') === '天材地宝' && kindFromText('万年雪莲') === '天材地宝');
assert('品类推断：材料', kindFromText('铁矿石') === '材料' && kindFromText('妖兽皮') === '材料');
assert('品类操作方式', ITEM_KINDS['丹药'].action === 'use' && ITEM_KINDS['法宝'].action === 'equip' && ITEM_KINDS['武器'].action === 'equip' && ITEM_KINDS['衣物'].action === 'equip' && ITEM_KINDS['材料'].action === null);

// 物品带品类入库 + 已装备法宝修炼加成
const iWorld = newWorldState();
applyStateUpdates(newPlayerState(), iWorld, { itemChanges: [
  { name: '疗伤丹', desc: '恢复气血', delta: 3 },
  { name: '玉髓葫芦', desc: '天阶法宝', delta: 1, kind: '法宝', grade: '天阶' },
] });
const iPill = iWorld.inventory.find((t) => t.name === '疗伤丹');
const iTreasure = iWorld.inventory.find((t) => t.name === '玉髓葫芦');
assert('物品自动标注品类', iPill.kind === '丹药' && iTreasure.kind === '法宝' && iTreasure.grade === '天阶');

// 物品数量规范化：丹药/装备整数，天材地宝/材料允许半份
const qtWorld = newWorldState();
applyStateUpdates(newPlayerState(), qtWorld, { itemChanges: [
  { name: '疗伤丹', desc: 'x', delta: 1.7 },
  { name: '茯苓草', desc: 'x', delta: 1.5, kind: '天材地宝' },
  { name: '碎骨粉', desc: 'x', delta: 1, kind: '材料' },
] });
applyStateUpdates(newPlayerState(), qtWorld, { itemChanges: [
  { name: '碎骨粉', desc: 'x', delta: -0.3, kind: '材料' },
] });
assert('丹药数量取整（1.7→2）', qtWorld.inventory.find((t) => t.name === '疗伤丹').qty === 2);
assert('天材地宝允许半份（1.5 保留）', qtWorld.inventory.find((t) => t.name === '茯苓草').qty === 1.5);
assert('材料半份步进（1 - 0.3 → 0.5）', qtWorld.inventory.find((t) => t.name === '碎骨粉').qty === 0.5);
iTreasure.equipped = true;
const tPlayer = newPlayerState();
applyStateUpdates(tPlayer, iWorld, { stateUpdates: { cultivation: { delta: 10 } } });
assert('已装备天阶法宝修炼加成(2x)', tPlayer.cultivation === 20);

// 文字装备：equipChanges 标记装备 + 同类互斥
const eqWorld = newWorldState();
applyStateUpdates(newPlayerState(), eqWorld, { itemChanges: [
  { name: '玄铁甲', desc: '衣物', delta: 1, kind: '衣物', grade: '地阶' },
  { name: '金丝软甲', desc: '衣物', delta: 1, kind: '衣物', grade: '玄阶' },
] });
applyStateUpdates(newPlayerState(), eqWorld, { equipChanges: [{ name: '玄铁甲', equipped: true }] });
assert('文字装备生效', eqWorld.inventory.find((t) => t.name === '玄铁甲').equipped === true);
applyStateUpdates(newPlayerState(), eqWorld, { equipChanges: [{ name: '金丝软甲', equipped: true }] });
assert('装备同类互斥(自动卸下旧装备)', eqWorld.inventory.find((t) => t.name === '玄铁甲').equipped === false && eqWorld.inventory.find((t) => t.name === '金丝软甲').equipped === true);

// 关系/势力修炼加成（v1.4.0 起按四维账本的"信/需"算，标签只决定种子）
assert('道侣关系加成(约1.235x)', Math.abs(relationCultMult([{ relation: '结为道侣' }]) - 1.235) < 1e-9);
assert('师徒关系加成(约1.175x)', Math.abs(relationCultMult([{ relation: '拜师' }]) - 1.16) < 1e-9);
assert('挚友关系加成(约1.175x)', Math.abs(relationCultMult([{ relation: '结为挚友' }]) - 1.175) < 1e-9);
assert('关系加成可叠加但有上限', relationCultMult([{ relation: '结为挚友' }, { relation: '结为道侣' }]) === 1.3);
assert('无关系无加成', relationCultMult([]) === 1.0 && relationCultMult([{ relation: '结仇' }]) === 1.0);
assert('势力结盟加成', factionCultMult([{ relation: '结盟' }]) === 1.05 && factionCultMult([{ relation: '结盟' }, { relation: '结盟' }, { relation: '结盟' }]) === 1.15);
assert('势力结盟上限15%', factionCultMult([{ relation: '结盟' }, { relation: '结盟' }, { relation: '结盟' }, { relation: '结盟' }, { relation: '结盟' }]) === 1.15);
assert('无结盟无加成', factionCultMult([{ relation: '中立' }, { relation: '敌对' }]) === 1.0);
// 关系加成实际作用于修炼
const relWorld = newWorldState();
relWorld.npcs = [{ name: '苏瑶', relation: '结为道侣' }];
const relPlayer = newPlayerState();
applyStateUpdates(relPlayer, relWorld, { stateUpdates: { cultivation: { delta: 10 } } });
assert('道侣让修炼+23.5%', relPlayer.cultivation === 12);

// 战斗数值（轻量版）：境界差决定伤害/生还
assert('境界差计算', combatDiff('炼气初期', '筑基初期') === 3 && combatDiff('金丹初期', '炼气初期') === -6 && combatDiff('炼气初期', '未知') === 0);
assert('受伤倍率随境界差', combatDamageMult(0) < 1 && combatDamageMult(1) > 1 && combatDamageMult(3) > combatDamageMult(1));
assert('死亡倍率随境界差', combatDeathMult(0) < 1 && combatDeathMult(2) > combatDeathMult(1));
// 战斗伤害实际按境界差放大
const cbWorld = newWorldState();
const cbPlayer = newPlayerState();
cbPlayer.realm = '炼气初期';
cbPlayer.maxHp = 200; cbPlayer.hp = 200;
const cbNote = applyStateUpdates(cbPlayer, cbWorld, { combat: { enemy: '金丹修士', realm: '金丹初期' }, stateUpdates: { hp: { delta: -20 } } });
assert('越级战斗受伤更重', cbPlayer.hp < 200 - 20);
assert('战斗返回半透明结算行', typeof cbNote === 'string' && cbNote.includes('【战斗】') && cbNote.includes('金丹修士'));

// 装备参战：衣物/法宝减伤，武器降致死
assert('仙阶衣物减伤(0.4x)', Math.abs(equipDefenseMult([{ equipped: true, kind: '衣物', grade: '仙阶' }]) - 0.4) < 1e-9);
assert('无衣物无减伤', equipDefenseMult([{ equipped: true, kind: '武器', grade: '仙阶' }]) === 1);
assert('仙阶武器降致死(0.4x)', Math.abs(equipAttackMult([{ equipped: true, kind: '武器', grade: '仙阶' }]) - 0.4) < 1e-9);
const armedPlayer = newPlayerState();
armedPlayer.realm = '炼气初期';
armedPlayer.maxHp = 200; armedPlayer.hp = 200;
const armedWorld = newWorldState();
armedWorld.inventory = [{ name: '玄铁战甲', kind: '衣物', grade: '天阶', equipped: true }];
applyStateUpdates(armedPlayer, armedWorld, { combat: { enemy: '金丹修士', realm: '金丹初期' }, stateUpdates: { hp: { delta: -20 } } });
assert('天阶战甲让受伤更轻', armedPlayer.hp > cbPlayer.hp);

// 新结局：一统江湖
assert('一统江湖结局', evaluateEndings({ ...newPlayerState(), realm: '化神初期', reputation: 90, morality: 50 })?.id === 'ruleworld');

// 装备稀有度 / 词条
assert('稀有度修炼加成', rarityMult('神品') === 1.3 && rarityMult('仙品') === 1.2 && rarityMult('凡品') === 1.0);
assert('词条：修炼类加修炼', affixEffects('修炼更快').cultMult === 1.1);
assert('词条：护体减伤', affixEffects('护体金光').defMult === 0.9);
assert('词条：逆天改命免死', affixEffects('逆天改命').revive === true);
assert('脑洞词条无机械效果', affixEffects('御风而行').cultMult === 1 && affixEffects('御风而行').revive === false);
assert('稀有度五档齐全', RARITY_LEVELS.length === 5);

// 渡劫成功率
const ascWorld = newWorldState();
ascWorld.inventory = [{ name: '护身仙甲', kind: '衣物', grade: '仙阶', rarity: '仙品', affix: '护体', equipped: true }];
ascWorld.npcs = [{ name: '苏瑶', relation: '结为道侣' }];
const ascP = newPlayerState();
ascP.realm = '渡劫后期'; ascP.morality = 40;
assert('渡劫成功率计算(50+10+10+10=80)', breakthroughRate(ascP, ascWorld, 'ascend') === 80);
assert('境界不足扣30', breakthroughRate({ ...ascP, realm: '渡劫初期' }, ascWorld, 'ascend') === 50);
// attemptBreakthrough 返回结构合法（随机，只验结构）
const breakRes = attemptBreakthrough(ascP, ascWorld, 'ascend');
assert('突破返回结果结构', breakRes && typeof breakRes.success === 'boolean' && typeof breakRes.rate === 'number' && typeof breakRes.note === 'string');

// 连续闭关收益递减
assert('闭关递减曲线', closedDoorMult(1) === 1 && closedDoorMult(2) === 0.85 && closedDoorMult(3) === 0.7 && closedDoorMult(4) === 0.6);
const cdWorld = newWorldState();
const cdP1 = newPlayerState();
applyStateUpdates(cdP1, cdWorld, { flags: { closedDoor: true }, timeMonths: 1, stateUpdates: { cultivation: { delta: 10 } } });
assert('首次闭关按时长结算', Math.abs(cdP1.cultivation - 2.78) < 0.01 && cdWorld.closedStreak === 1);
const cdP2 = newPlayerState();
applyStateUpdates(cdP2, cdWorld, { flags: { closedDoor: true }, timeMonths: 1, stateUpdates: { cultivation: { delta: 10 } } });
assert('连续闭关第二次递减(0.85x)', Math.abs(cdP2.cultivation - 2.36) < 0.02 && cdWorld.closedStreak === 2);
applyStateUpdates(newPlayerState(), cdWorld, { stateUpdates: { cultivation: { delta: 10 } } });
assert('非闭关行动重置连续闭关计数', cdWorld.closedStreak === 0);

// 新成就
assert('名震一方成就', evaluateAchievements({ ...newPlayerState(), reputation: 85 }, newWorldState()).includes('名震一方'));
assert('富甲天下成就', evaluateAchievements({ ...newPlayerState(), spiritStones: 6000 }, newWorldState()).includes('富甲天下'));
const godGearWorld = newWorldState();
godGearWorld.inventory = [{ name: '仙剑', grade: '天阶' }];
assert('神兵在手成就', evaluateAchievements(newPlayerState(), godGearWorld).includes('神兵在手'));
const loveWorld = newWorldState();
loveWorld.npcs = [{ name: '苏瑶', relation: '结为道侣' }];
assert('道侣情深成就', evaluateAchievements(newPlayerState(), loveWorld).includes('道侣情深'));

// 每阶突破所需修为（前低后高）
assert('凡人首破只需五成', breakthroughNeed('凡人') === 50);
assert('炼气突破需六成', breakthroughNeed('炼气初期') === 60 && breakthroughNeed('炼气后期') === 60);
assert('筑基突破需七成', breakthroughNeed('筑基中期') === 70);
assert('金丹突破需八成', breakthroughNeed('金丹初期') === 80);
assert('元婴突破需八成五', breakthroughNeed('元婴后期') === 85);
assert('化神突破需九成', breakthroughNeed('化神中期') === 90);
assert('合体/大乘/渡劫突破需圆满', breakthroughNeed('合体初期') === 100 && breakthroughNeed('大乘初期') === 100 && breakthroughNeed('渡劫初期') === 100);
assert('门槛逐阶递增', breakthroughNeed('炼气初期') < breakthroughNeed('筑基初期') && breakthroughNeed('元婴初期') < breakthroughNeed('化神初期') && breakthroughNeed('化神初期') < breakthroughNeed('渡劫初期'));

// 背包物品：获得/消耗，图鉴永久保留
const bWorld = newWorldState();
applyStateUpdates(newPlayerState(), bWorld, { itemChanges: [{ name: '疗伤丹', desc: '恢复气血', delta: 3 }] });
assert('获得物品进背包并记图鉴', bWorld.inventory.some((i) => i.name === '疗伤丹' && i.qty === 3) && bWorld.items.some((i) => i.name === '疗伤丹'));
applyStateUpdates(newPlayerState(), bWorld, { itemChanges: [{ name: '疗伤丹', delta: -1 }] });
assert('消耗物品减数量', bWorld.inventory.find((i) => i.name === '疗伤丹').qty === 2);
applyStateUpdates(newPlayerState(), bWorld, { itemChanges: [{ name: '疗伤丹', delta: -2 }] });
assert('数量归零移除背包但图鉴保留', !bWorld.inventory.some((i) => i.name === '疗伤丹') && bWorld.items.some((i) => i.name === '疗伤丹'));

// 事迹：按主体记录 + 去重
const cWorld = newWorldState();
applyStateUpdates(newPlayerState(), cWorld, { newEvents: [
  { subject: '苏瑶', title: '初遇', desc: '救下苏瑶', relation: '初识' },
  { subject: '苏瑶', title: '结为挚友', desc: '患难与共', relation: '挚友' },
  { subject: '万剑冢', title: '破阵', desc: '得到传承' },
] });
assert('事迹按主体记录', cWorld.events.length === 3 && cWorld.events.every((e) => e.subject));
applyStateUpdates(newPlayerState(), cWorld, { newEvents: [{ subject: '苏瑶', title: '初遇', desc: '重复' }] });
assert('事迹去重', cWorld.events.filter((e) => e.subject === '苏瑶').length === 2);

// 时间流逝 & 寿元消耗（以"天"为粒度）
const tw = newWorldState();
const tp = newPlayerState();
advanceTime(tw, tp, 15);
assert('时间推进15个月', tw.date.year === 2 && tw.date.month === 4 && tw.date.day === 1);
assert('寿元消耗1.25年', Math.abs(tp.lifespan - 98.75) < 1e-9);
const tw2 = newWorldState();
advanceTime(tw2, newPlayerState(), 0.6);
assert('小数月按天换算(0.6月=18天)', tw2.date.day === 19 && tw2.date.month === 1 && tw2.date.year === 1);
// 短场景不流逝时间（默认 0）
const tw3 = newWorldState();
const tp3 = newPlayerState();
advanceTime(tw3, tp3, 0);
assert('短场景时间不流逝', tw3.date.day === 1 && tw3.date.month === 1 && tw3.date.year === 1 && tp3.lifespan === 100);
// 一天粒度：0.033 月 ≈ 1 天
const tw4 = newWorldState();
advanceTime(tw4, newPlayerState(), 0.033);
assert('一天粒度推进(次日)', tw4.date.day === 2 && tw4.date.month === 1);

// 正邪分来源收益 / 气运 / 阵营
assert('正道行为随正道上浮', Math.abs(moralityGainMultiplier(100, 'righteous', 0.2) - 1.2) < 1e-9);
assert('掠夺行为随魔道上浮', Math.abs(moralityGainMultiplier(-100, 'plunder', 0.2) - 1.2) < 1e-9);
assert('魔道做正道行为打折', Math.abs(moralityGainMultiplier(-100, 'righteous', 0.2) - 0.8) < 1e-9);
assert('气运：正道增修为、魔道降修为', fortuneMultiplier(100, 0.2) > 1 && fortuneMultiplier(-100, 0.2) < 1);
assert('阵营判定三派', alignmentLabel(50) === '正道' && alignmentLabel(-50) === '魔道' && alignmentLabel(0) === '中庸');

console.log(fails === 0 ? '\n✅ 全部规则引擎测试通过' : `\n❌ ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
