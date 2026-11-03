import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  equipDefenseMult,
  breakthroughRate,
  itemPrice,
  tradeItem,
} from '../public/game.js';
import {
  TREASURE_TIERS,
  TREASURES,
  treasureByName,
  wieldFactor,
  treasurePower,
  canRefine,
  refineCost,
} from '../public/treasures.js';

const setup = (realm = '金丹初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  player.spiritStones = 100000;
  player.reputation = 50; // 基准议价
  return { player, world };
};

const give = (world, player, name, n = 1) => applyStateUpdates(player, world, {
  itemChanges: [{ name, delta: n }],
});

test('名录：九个阶位齐全，价目随阶位递增', () => {
  const names = Object.keys(TREASURE_TIERS);
  assert.deepEqual(names, ['法器', '下品法宝', '中品法宝', '上品法宝', '极品法宝', '古宝', '灵宝', '通天灵宝', '玄天之宝']);
  const prices = names.map((n) => TREASURE_TIERS[n].price);
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] === 0) continue; // 玄天之宝不标价
    assert.ok(prices[i] > prices[i - 1], `${names[i]} 应比 ${names[i - 1]} 贵`);
  }
  assert.ok(TREASURES.length >= 15);
  assert.ok(treasureByName('青竹蜂云剑'));
  assert.ok(treasureByName('虚天鼎'));
});

test('修为决定驱动：够 = 全额，差一境 = 半，差两境 = 驱动不了', () => {
  assert.equal(wieldFactor('金丹后期', '上品法宝'), 1);
  assert.equal(wieldFactor('筑基后期', '上品法宝'), 0.5);
  assert.equal(wieldFactor('炼气后期', '上品法宝'), 0);
  assert.equal(wieldFactor('炼气初期', '法器'), 1);
});

test('威力 = 阶位威力 × 驱动系数；本命再 ×1.25', () => {
  const sword = { tier: '上品法宝' };
  assert.equal(treasurePower(sword, '金丹初期'), 1.4);
  assert.equal(treasurePower(sword, '筑基初期'), 0.7);
  assert.equal(treasurePower(sword, '炼气初期'), 0);
  assert.equal(treasurePower({ ...sword, bonded: true }, '金丹初期'), 1.75);
  assert.equal(treasurePower({ name: '没阶位' }, '金丹初期'), null);
});

test('收进背包时按名录归一：阶位与词条由表定，模型写的 grade 不作数', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    itemChanges: [{ name: '青竹蜂云剑', delta: 1, kind: '法宝', grade: '仙阶', rarity: '神品' }],
  });
  const it = world.inventory.find((x) => x.name === '青竹蜂云剑');
  assert.equal(it.tier, '上品法宝');
  assert.equal(it.kind, '法宝');
  assert.ok(it.affix.includes('锋芒'));
  assert.equal(it.grade, '', '名录法宝不采用模型自报的品阶');
});

test('装备后修炼加成按阶位：金丹满额加成，筑基驱动不动就没有加成', () => {
  // 用没有「悟道」词条的上品法宝，避免词条倍率混进来
  const withSword = setup('金丹初期');
  give(withSword.world, withSword.player, '金蚨子母刃');
  applyStateUpdates(withSword.player, withSword.world, { equipChanges: [{ name: '金蚨子母刃', equipped: true }] });
  const bare = setup('金丹初期');

  const gain = (s) => {
    applyStateUpdates(s.player, s.world, { timeMonths: 12, flags: { closedDoor: true }, stateUpdates: { cultivation: { delta: 10 } } });
    return s.player.cultivation;
  };
  const armedGain = gain(withSword);
  const bareGain = gain(bare);
  assert.ok(Math.abs(armedGain / bareGain - 1.4) < 0.08, `金丹带剑应约为 1.4 倍（${armedGain} / ${bareGain}）`);

  // 筑基驱动上品法宝只剩半额（0.7），低于 1 的上限保护 → 实际无加成
  const low = setup('筑基初期');
  give(low.world, low.player, '金蚨子母刃');
  applyStateUpdates(low.player, low.world, { equipChanges: [{ name: '金蚨子母刃', equipped: true }] });
  const lowBare = setup('筑基初期');
  const lowArmed = gain(low);
  const lowBareGain = gain(lowBare);
  assert.ok(Math.abs(lowArmed - lowBareGain) < 0.05, `筑基驱动不动，不应有加成（${lowArmed} vs ${lowBareGain}）`);
});

test('防具型法宝降低受伤：金丹驱动的元磁神山比未驱动时更硬', () => {
  const strong = setup('金丹初期');
  give(strong.world, strong.player, '元磁神山');
  applyStateUpdates(strong.player, strong.world, { equipChanges: [{ name: '元磁神山', equipped: true }] });
  const strongMult = equipDefenseMult(strong.world.inventory, strong.player);

  const weak = setup('炼气初期');
  give(weak.world, weak.player, '元磁神山');
  applyStateUpdates(weak.player, weak.world, { equipChanges: [{ name: '元磁神山', equipped: true }] });
  const weakMult = equipDefenseMult(weak.world.inventory, weak.player);

  assert.ok(strongMult < weakMult, '驱动得动才减伤');
  assert.equal(weakMult, 1, '驱动不了就不加分');
});

test('祭炼本命：金丹可祭，耗气血与灵石，威力提升', () => {
  const { player, world } = setup('金丹初期');
  give(world, player, '青竹蜂云剑');
  const hpBefore = player.hp;
  const stonesBefore = player.spiritStones;
  const note = applyStateUpdates(player, world, { refineTreasure: [{ name: '青竹蜂云剑' }] });
  const it = world.inventory.find((x) => x.name === '青竹蜂云剑');
  assert.equal(it.bonded, true);
  assert.ok(note.includes('本命法宝'));
  assert.ok(player.hp < hpBefore);
  assert.ok(player.spiritStones < stonesBefore);
  assert.equal(player.spiritStones, stonesBefore - refineCost(treasureByName('青竹蜂云剑')).stones);
});

test('本命只能一件；法器不能祭；境界不够不能祭', () => {
  const { player, world } = setup('金丹初期');
  give(world, player, '青竹蜂云剑');
  give(world, player, '金蚨子母刃');
  applyStateUpdates(player, world, { refineTreasure: [{ name: '青竹蜂云剑' }] });
  const second = applyStateUpdates(player, world, { refineTreasure: [{ name: '金蚨子母刃' }] });
  assert.ok(second.includes('本命只能有一件'));

  const low = setup('筑基初期');
  give(low.world, low.player, '青竹蜂云剑');
  const lowNote = applyStateUpdates(low.player, low.world, { refineTreasure: [{ name: '青竹蜂云剑' }] });
  assert.ok(lowNote.includes('金丹以上'));

  const faqi = setup('金丹初期');
  give(faqi.world, faqi.player, '青叶飞剑');
  const faqiNote = applyStateUpdates(faqi.player, faqi.world, { refineTreasure: [{ name: '青叶飞剑' }] });
  assert.ok(faqiNote.includes('本命'));
  assert.equal(canRefine('金丹初期', treasureByName('青叶飞剑')), false);
});

test('交易：法宝按阶位价成交，古宝以上不流通', () => {
  const { player, world } = setup('金丹初期');
  assert.equal(itemPrice(world, player, '金砖'), TREASURE_TIERS['下品法宝'].price);
  const buy = tradeItem(world, player, { action: 'buy', item: '金砖' });
  assert.equal(buy.ok, true);
  assert.ok(world.inventory.some((it) => it.name === '金砖' && it.tier === '下品法宝'));

  assert.equal(itemPrice(world, player, '紫铖兜'), null, '古宝不流通');
  const no = tradeItem(world, player, { action: 'buy', item: '紫铖兜' });
  assert.equal(no.ok, false);
});

test('突破加成按阶位：带古宝比空手更容易渡劫', () => {
  const bare = setup('元婴初期');
  const armed = setup('元婴初期');
  give(armed.world, armed.player, '紫铖兜');
  applyStateUpdates(armed.player, armed.world, { equipChanges: [{ name: '紫铖兜', equipped: true }] });
  assert.ok(breakthroughRate(armed.player, armed.world, 'ascend') > breakthroughRate(bare.player, bare.world, 'ascend'));
});

test('校验层接受 refineTreasure，坏条目丢弃', () => {
  const { out } = validateStateOutput({ refineTreasure: [{ name: '青竹蜂云剑' }, {}] });
  assert.equal(out.refineTreasure.length, 1);
});
