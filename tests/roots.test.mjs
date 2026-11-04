import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlayerState, newWorldState, applyStateUpdates, awakenRoots, learnTechnique, practiceTechnique, refineRoots } from '../public/game.js';
import { rootTierOf, rootProfile, rootCultMult, rootLayerCap, ROOT_TIERS, rootTraits, rootCraftPenalty } from '../public/roots.js';

const setup = () => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 2, day: 1 };
  player.realm = '金丹初期';
  player.spiritStones = 10000000;
  return { player, world };
};

test('灵根档次：一属天根、两三属真灵根、四五属伪灵根', () => {
  assert.equal(rootTierOf(['水']), '天灵根');
  assert.equal(rootTierOf(['木', '火']), '双灵根');
  assert.equal(rootTierOf(['金', '木', '水']), '三灵根');
  assert.equal(rootTierOf(['金', '木', '水', '火']), '四灵根');
  assert.equal(rootTierOf(['金', '木', '水', '火', '土']), '五灵根');
  assert.equal(rootTierOf(['雷']), '变异灵根');
});

test('修炼快慢：天根 > 真灵根 > 伪灵根', () => {
  const make = (roots) => { const s = setup(); s.player.spiritRoots = roots; return rootCultMult(s.player); };
  const tian = make(['水']);
  const zhen = make(['木', '火']);
  const wei = make(['金', '木', '水', '火']);
  assert.ok(tian > zhen && zhen > wei, `${tian} / ${zhen} / ${wei}`);
  assert.ok(make(['雷']) >= tian, '变异灵根更快');
  assert.equal(rootCultMult(setup().player), 1, '未测灵根不加不减');
});

test('伪灵根练不过四层：功法上限卡死（第 127 章）', () => {
  const { player, world } = setup();
  player.spiritRoots = ['金', '木', '水', '火']; // 伪灵根，上限 5 层
  learnTechnique(world, player, { name: '长春功' });
  const t = player.techniques[0];
  t.layer = rootLayerCap(player);
  const res = practiceTechnique(world, player, { name: '长春功', days: 30 });
  assert.equal(t.layer, rootLayerCap(player), '不该再破层');
  assert.ok(res.note.includes('上限'), res.note);
});

test('天根练得到九层', () => {
  const { player, world } = setup();
  player.spiritRoots = ['水'];
  learnTechnique(world, player, { name: '玄水诀' });
  const t = player.techniques[0];
  t.layer = 8;
  t.exp = 799;
  const res = practiceTechnique(world, player, { name: '玄水诀', days: 30 });
  assert.equal(res.ok, true);
  assert.equal(t.layer, 9, '天根应能破到九层');
});

test('未测灵根不设上限', () => {
  const { player } = setup();
  assert.equal(rootProfile(player).tested, false);
  assert.equal(rootLayerCap(player), 9);
});

test('测灵根一次定终身', () => {
  const { player, world } = setup();
  const first = awakenRoots(world, player, { roots: ['木', '火'] });
  assert.equal(first.ok, true);
  assert.deepEqual(player.spiritRoots, ['木', '火']);
  assert.ok(first.note.includes('双灵根'), first.note);
  const again = awakenRoots(world, player, { roots: ['水'] });
  assert.equal(again.ok, false);
  assert.ok(again.reason.includes('不可更易'));
});

test('测灵根：五行之外收不进来，重复属性去重', () => {
  const { player, world } = setup();
  const res = awakenRoots(world, player, { roots: ['水', '水', '雷', '不存在'] });
  assert.equal(res.ok, true);
  assert.deepEqual(player.spiritRoots, ['水', '雷']);
});

test('灵根决定能不能修属性功法', () => {
  const { player, world } = setup();
  player.spiritRoots = ['火'];
  const no = learnTechnique(world, player, {
    name: '寒渊引', grade: '中阶功法', type: '主修', element: '水',
    requirements: [{ kind: 'element', value: '水' }],
  });
  assert.equal(no.ok, false);
  player.spiritRoots = ['水'];
  const yes = learnTechnique(world, player, {
    name: '寒渊引', grade: '中阶功法', type: '主修', element: '水',
    requirements: [{ kind: 'element', value: '水' }],
  });
  assert.equal(yes.ok, true);
});

test('灵根影响修炼收益：同境界伪灵根更慢', () => {
  const gain = (roots) => {
    const s = setup();
    s.player.spiritRoots = roots;
    applyStateUpdates(s.player, s.world, { timeMonths: 12, flags: { closedDoor: true }, stateUpdates: { cultivation: { delta: 10 } } });
    return s.player.cultivation;
  };
  const tian = gain(['水']);
  const wei = gain(['金', '木', '水', '火']);
  assert.ok(tian > wei, `天根应更快（${tian} vs ${wei}）`);
});

test('回合结算：测灵根走系统并给回执', () => {
  const { player, world } = setup();
  const note = applyStateUpdates(player, world, { awakenRoots: { roots: ['金', '水'] } });
  assert.ok(note.includes('【测灵根】'));
  assert.deepEqual(player.spiritRoots, ['金', '水']);
});

test('异灵根各有偏长：雷伤敌、冰护体、风赶路、暗破禁', () => {
  const make = (root) => { const s = setup(); s.player.spiritRoots = [root]; return rootTraits(s.player); };
  assert.ok(make('雷').deathMult < 1);
  assert.ok(make('冰').damageTaken < 1);
  assert.ok(make('风').travelMult < 1);
  assert.ok(make('暗').breakForm > 0);
  const plain = setup();
  assert.equal(rootTraits(plain.player).deathMult, 1, '未测灵根无偏长');
});

test('补天丹洗炼灵根：洗掉一属、资质上一档（第 490、541 章）', () => {
  const { player, world } = setup();
  player.spiritRoots = ['金', '木', '水', '火'];
  const no = refineRoots(world, player, {});
  assert.equal(no.ok, false, '没有补天丹洗不了');

  applyStateUpdates(player, world, { itemChanges: [{ name: '补天丹', delta: 1 }] });
  const res = refineRoots(world, player, {});
  assert.equal(res.ok, true);
  assert.equal(player.spiritRoots.length, 3);
  assert.ok(!world.inventory.some((x) => x.name === '补天丹' && x.qty > 0));
  assert.ok(res.note.includes('三灵根'), res.note);
});

test('单一灵根无需再洗', () => {
  const { player, world } = setup();
  player.spiritRoots = ['水'];
  applyStateUpdates(player, world, { itemChanges: [{ name: '补天丹', delta: 1 }] });
  const res = refineRoots(world, player, {});
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('单一灵根'));
});

test('伪灵根修五行道法没天赋：画符打折', () => {
  const wei = setup();
  wei.player.spiritRoots = ['金', '木', '水', '火'];
  assert.equal(rootCraftPenalty(wei.player), 0.8);
  const tian = setup();
  tian.player.spiritRoots = ['水'];
  assert.equal(rootCraftPenalty(tian.player), 1);
});
