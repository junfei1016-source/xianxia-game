// 效果词条注册表：机械词条机制 / 功能法宝常驻 / 槽位（双持·多宝）/ 渡劫防叠加 / 逆天改命
import {
  newPlayerState, newWorldState, applyStateUpdates, advanceTime,
  AFFIX_REGISTRY, AFFIX_REGISTRY_KEYS, affixEffects, affixLabels,
  isFunctionalTreasure, activeItems, activeHas, equipItem,
  equipDefenseMult, breakthroughRate, attemptBreakthrough, evaluateEndings,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };
const mk = () => { const w = newWorldState(); w.eraType = 'test'; return w; };

// ---------- 1. 注册表完整 ----------
assert('注册表 19 个词条', AFFIX_REGISTRY_KEYS.length === 19);
assert('每个词条都有 test/label/desc/fx', AFFIX_REGISTRY_KEYS.every((k) => AFFIX_REGISTRY[k].test instanceof RegExp && typeof AFFIX_REGISTRY[k].label === 'string' && typeof AFFIX_REGISTRY[k].desc === 'string' && typeof AFFIX_REGISTRY[k].fx === 'object'));

// ---------- 2. 词条解析与合并 ----------
assert('组合词条合并效果', (() => { const f = affixEffects('悟道·护体'); return f.cultMult === 1.1 && f.defMult === 0.9 && f.matched.length === 2; })());
assert('叙事词条无效果', (() => { const f = affixEffects('御风而行'); return f.cultMult === 1 && f.revive === false && f.matched.length === 0; })());
assert('词条标签列表', affixLabels('悟道').length === 1 && affixLabels('悟道')[0].kind === 'cult');
assert('叙事词条标签为空', affixLabels('花里胡哨').length === 0);

// ---------- 3. 功能法宝常驻 ----------
assert('护体法宝=功能法宝', isFunctionalTreasure({ name: 'x', kind: '法宝', affix: '护体' }));
assert('悟道法宝=修行法宝', !isFunctionalTreasure({ name: 'x', kind: '法宝', affix: '悟道' }));
assert('武器非功能法宝', !isFunctionalTreasure({ name: 'x', kind: '武器', affix: '护体' }));
const wA = mk();
wA.inventory = [{ name: '护体珠', kind: '法宝', affix: '护体' }];
assert('未装备的功能法宝也生效（激活池=1）', activeItems(wA.inventory).length === 1);
assert('护体减伤常驻生效', affixEffects('护体').defMult === 0.9 && activeHas(wA.inventory, 'stealth') === false);
const wA2 = mk();
wA2.inventory = [{ name: '聚灵珠', kind: '法宝', affix: '悟道' }];
assert('未装备的修行法宝不生效', activeItems(wA2.inventory).length === 0);

// ---------- 4. 槽位：双持 / 多宝 ----------
const wB = mk();
wB.inventory = [
  { name: '双持臂甲', kind: '法宝', affix: '双持' },          // 常驻功能法宝
  { name: '青锋剑', kind: '武器', grade: '玄阶' },
  { name: '赤焰刀', kind: '武器', grade: '玄阶' },
  { name: '破风枪', kind: '武器', grade: '玄阶' },
];
equipItem(wB, wB.inventory[1]);
equipItem(wB, wB.inventory[2]);
assert('双持：两把武器同时装备', wB.inventory[1].equipped && wB.inventory[2].equipped);
equipItem(wB, wB.inventory[3]);
assert('双持满槽后替换第一把', !wB.inventory[1].equipped && wB.inventory[2].equipped && wB.inventory[3].equipped);
const wC = mk();
wC.inventory = [
  { name: '普通剑', kind: '武器', grade: '玄阶' },
  { name: '普通刀', kind: '武器', grade: '玄阶' },
];
equipItem(wC, wC.inventory[0]);
equipItem(wC, wC.inventory[1]);
assert('无双持：第二把武器替换第一把', !wC.inventory[0].equipped && wC.inventory[1].equipped);
const wD = mk();
wD.inventory = [
  { name: '玲珑塔', kind: '法宝', affix: '多宝' },           // 常驻功能法宝
  { name: '聚灵珠', kind: '法宝', affix: '悟道' },
  { name: '护心镜', kind: '法宝', grade: '地阶' },
];
equipItem(wD, wD.inventory[1]);
equipItem(wD, wD.inventory[2]);
assert('多宝：两件修行/战斗法宝同时装备', wD.inventory[1].equipped && wD.inventory[2].equipped);

// ---------- 5. 锋芒：敌人境界按低一阶 ----------
const p5 = newPlayerState();
const w5 = mk();
w5.inventory = [{ name: '破甲锥', kind: '法宝', affix: '锋芒' }];
applyStateUpdates(p5, w5, { combat: { enemy: '敌', realm: '炼气初期' }, stateUpdates: { hp: { delta: -100 } } });
assert('锋芒：越一阶按同级计伤（-60）', p5.hp === 40);
const p5b = newPlayerState();
applyStateUpdates(p5b, mk(), { combat: { enemy: '敌', realm: '炼气初期' }, stateUpdates: { hp: { delta: -100 } } });
assert('无锋芒：越一阶受伤加重（-120 → 濒死保底）', p5b.hp === 1 || p5b.hp === 100 - 120);

// ---------- 6. 疾风（战斗）与隐匿（非战斗）降致死 ----------
const realRandom = Math.random;
try {
  Math.random = () => 0.013; // 0.015（无疾风命中）与 0.012（疾风未命中）之间
  const p6 = newPlayerState();
  const w6 = mk();
  applyStateUpdates(p6, w6, { risk: 'high', combat: { enemy: '敌', realm: '凡人' } });
  assert('无疾风：高危掷骰命中（濒死）', w6.flags.deathImminent === true);
  const p6b = newPlayerState();
  const w6b = mk();
  w6b.inventory = [{ name: '疾风靴', kind: '衣物', affix: '疾风', equipped: true }];
  applyStateUpdates(p6b, w6b, { risk: 'high', combat: { enemy: '敌', realm: '凡人' } });
  assert('疾风：同概率下免于濒死', !w6b.flags.deathImminent);
  Math.random = () => 0.045; // 0.05（无隐匿命中）与 0.04（隐匿未命中）之间
  const p6c = newPlayerState();
  const w6c = mk();
  applyStateUpdates(p6c, w6c, { risk: 'high' });
  assert('无隐匿：非战斗高危命中', w6c.flags.deathImminent === true);
  const p6d = newPlayerState();
  const w6d = mk();
  w6d.inventory = [{ name: '藏锋玉', kind: '法宝', affix: '隐匿' }];
  applyStateUpdates(p6d, w6d, { risk: 'high' });
  assert('隐匿：同概率下免于濒死', !w6d.flags.deathImminent);
} finally { Math.random = realRandom; }

// ---------- 7. 铁骨：重伤保底 15% ----------
const p7 = newPlayerState();
const w7 = mk();
w7.inventory = [{ name: '金刚骨', kind: '法宝', affix: '铁骨' }];
applyStateUpdates(p7, w7, { stateUpdates: { hp: { delta: -999 } } });
assert('铁骨：气血保底 15%（15/100）', p7.hp === 15);
assert('铁骨：不坠濒死', w7.flags.deathImminent !== true);

// ---------- 8. 噬血 / 回春 ----------
const p8 = newPlayerState();
const w8 = mk();
w8.inventory = [{ name: '噬血刃', kind: '武器', affix: '噬血', equipped: true }];
applyStateUpdates(p8, w8, { combat: { enemy: '敌', realm: '凡人' }, stateUpdates: { hp: { delta: -30 } } });
// 同级战斗伤×0.6 → -18，噬血返还 round(18*0.3)=5 → 100-18+5=87
assert('噬血：-30（同级×0.6）返还 5（87/100）', p8.hp === 87);
const p8b = newPlayerState();
p8b.hp = 50;
const w8b = mk();
w8b.inventory = [{ name: '回春玉', kind: '法宝', affix: '回春' }];
applyStateUpdates(p8b, w8b, { stateUpdates: { cultivation: { delta: 5 } } });
assert('回春：无战斗回合末 +5（55/100）', p8b.hp === 55);

// ---------- 9. 破障 / 镇心 ----------
const p9 = newPlayerState();
const w9 = mk();
w9.inventory = [{ name: '破障丹炉', kind: '法宝', affix: '破障' }];
assert('破障：大境界突破 60 → 70', breakthroughRate(p9, w9, 'major') === 70);
const p9b = newPlayerState();
p9b.realm = '渡劫后期';
assert('破障：不影响渡劫（50）', breakthroughRate(p9b, w9, 'ascend') === 50);
try {
  Math.random = () => 0.99;
  const r1 = attemptBreakthrough(newPlayerState(), mk(), 'major');
  assert('无镇心：突破失败走火入魔', r1.qiDeviation === true);
  const w9b = mk();
  w9b.inventory = [{ name: '清心佩', kind: '法宝', affix: '镇心' }];
  const r2 = attemptBreakthrough(newPlayerState(), w9b, 'major');
  assert('镇心：突破失败不走火入魔', r2.qiDeviation === false);
} finally { Math.random = realRandom; }

// ---------- 10. 长青 / 气运 / 聚财 / 威仪 ----------
const p10 = newPlayerState();
const w10 = mk();
w10.inventory = [{ name: '长青木', kind: '法宝', affix: '长青' }];
advanceTime(w10, p10, 120);
assert('长青：闭关十年寿元只减 5 岁', p10.lifespan === 95);
const p10b = newPlayerState();
applyStateUpdates(p10b, mk(), { stateUpdates: { cultivation: { delta: 10 }, spiritStones: { delta: 100 }, reputation: { delta: 10 } } });
assert('无词条基准：修为10/灵石100/声望10', p10b.cultivation === 10 && p10b.spiritStones === 100 && p10b.reputation === 10);
const p10c = newPlayerState();
const w10c = mk();
w10c.inventory = [{ name: '气运珠', kind: '法宝', affix: '气运' }, { name: '聚财盆', kind: '法宝', affix: '聚财' }, { name: '威仪冠', kind: '衣物', affix: '威仪', equipped: true }];
applyStateUpdates(p10c, w10c, { stateUpdates: { cultivation: { delta: 10 }, spiritStones: { delta: 100 }, reputation: { delta: 10 } } });
assert('气运/聚财/威仪：11/110/12', p10c.cultivation === 11 && p10c.spiritStones === 110 && p10c.reputation === 12);

// ---------- 11. 逆天改命：免死一次（消耗） ----------
const p11 = newPlayerState();
const w11 = mk();
w11.inventory = [{ name: '涅槃珠', kind: '法宝', affix: '逆天改命' }];
applyStateUpdates(p11, w11, { died: true });
assert('逆天改命：免死复活（30/100）', p11.hp === 30 && evaluateEndings(p11, w11) === null);
assert('词条消耗（物品移除）', w11.inventory.length === 0);
try {
  const seq = [0.99, 0]; // 突破失败 + 致死骰命中
  let si = 0;
  Math.random = () => (si < seq.length ? seq[si++] : 0.5);
  const p11b = newPlayerState();
  p11b.realm = '渡劫后期';
  const w11b = mk();
  w11b.inventory = [{ name: '涅槃珠', kind: '法宝', affix: '逆天改命' }];
  const r = attemptBreakthrough(p11b, w11b, 'ascend');
  assert('渡劫失败被逆天改命救回（不死）', r.death === false && r.success === false && p11b.hp === 30 && w11b.inventory.length === 0);
} finally { Math.random = realRandom; }

// ---------- 12. 渡劫加成防叠加（取单件最高） ----------
const p12 = newPlayerState();
p12.realm = '渡劫后期';
const w12 = mk();
w12.inventory = [
  { name: '神品宝镜', kind: '法宝', rarity: '神品', equipped: true },
  { name: '仙品剑', kind: '武器', rarity: '仙品', equipped: true },
  { name: '仙品甲', kind: '衣物', rarity: '仙品', equipped: true },
];
assert('渡劫加成取最高（50+15=65，不再叠加到85）', breakthroughRate(p12, w12, 'ascend') === 65);

// ---------- 13. 效果诉求登记 ----------
const p13 = newPlayerState();
const w13 = mk();
applyStateUpdates(p13, w13, { effectRequests: [{ name: '储物袋', desc: '希望真的能收纳物品' }, { name: '储物袋', desc: '重复' }] });
assert('诉求登记去重', (w13.effectRequests || []).length === 1 && w13.effectRequests[0].name === '储物袋');

console.log(fails === 0 ? '\n✅ 词条注册表测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
