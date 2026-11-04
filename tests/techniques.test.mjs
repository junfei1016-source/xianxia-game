import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  learnTechnique,
  practiceTechnique,
  setMainTechnique,
  checkCraftSecretExposure,
  addJadeSlip,
  studyCraft,
} from '../public/game.js';
import {
  TECHNIQUES,
  TECH_GRADES,
  TECH_TYPES,
  MAX_LAYER,
  techniqueByName,
  techniqueEffect,
  layerUpCost,
} from '../public/techniques.js';

const setup = (realm = '金丹初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId: 'qingwu', sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 2, day: 1 };
  player.realm = realm;
  player.spiritStones = 10000000;
  player.reputation = 50;
  return { player, world };
};

test('功法品阶七等（到圣阶/仙阶）、类型六种，名录足数', () => {
  assert.deepEqual(Object.keys(TECH_GRADES), ['基础功法', '低阶功法', '中阶功法', '高阶功法', '顶阶功法', '圣阶功法', '仙阶功法']);
  assert.equal(TECH_GRADES['圣阶功法'].minRealm, '化神');
  assert.equal(TECH_GRADES['仙阶功法'].minRealm, '大乘');
  assert.equal(TECH_TYPES.length, 6);
  assert.ok(TECHNIQUES.length >= 18);
  const long = techniqueByName('长春功');
  assert.equal(long.grade, '基础功法');
  assert.equal(long.element, '木');
});

test('化神/合体/大乘各有其功法：元磁神光、梵圣真魔功、万水仙诀', () => {
  const yuanci = techniqueByName('元磁神光');
  assert.equal(yuanci.grade, '圣阶功法');
  assert.equal(TECH_GRADES[yuanci.grade].minRealm, '化神');

  const fanSheng = techniqueByName('梵圣真魔功');
  assert.equal(fanSheng.grade, '圣阶功法');

  const wanshui = techniqueByName('万水仙诀');
  assert.equal(wanshui.grade, '仙阶功法');
  assert.equal(TECH_GRADES[wanshui.grade].minRealm, '大乘');

  // 元婴修不了圣阶，化神可以
  const low = setup('元婴后期');
  assert.equal(learnTechnique(low.world, low.player, { name: '元磁神光' }).ok, false);
  const high = setup('化神初期');
  assert.equal(learnTechnique(high.world, high.player, { name: '元磁神光' }).ok, true);
});

test('转修相冲：属性相克的两门功法，散功更重', () => {
  const calm = setup();
  learnTechnique(calm.world, calm.player, { name: '玄水诀' }); // 水
  learnTechnique(calm.world, calm.player, { name: '厚土诀' }); // 土（土克水）
  calm.player.cultivation = 100;
  setMainTechnique(calm.world, calm.player, { name: '厚土诀' });
  const calmLost = 100 - calm.player.cultivation;

  const plain = setup();
  learnTechnique(plain.world, plain.player, { name: '长春功' }); // 木
  learnTechnique(plain.world, plain.player, { name: '烈火诀' }); // 火（木生火，不相克）
  plain.player.cultivation = 100;
  setMainTechnique(plain.world, plain.player, { name: '烈火诀' });
  const plainLost = 100 - plain.player.cultivation;

  assert.ok(calmLost > plainLost, `相克应散得更多（${calmLost} vs ${plainLost}）`);
});

test('修为门槛：炼气修不了顶阶功法', () => {
  const { player, world } = setup('炼气初期');
  const res = learnTechnique(world, player, { name: '太清剑典' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('修为不足'));
});

test('学功法入册，重复学不行', () => {
  const { player, world } = setup();
  const res = learnTechnique(world, player, { name: '长春功' });
  assert.equal(res.ok, true);
  assert.equal(player.techniques.length, 1);
  assert.equal(player.mainTechnique, '长春功', '第一门主修自动上位');
  const again = learnTechnique(world, player, { name: '长春功' });
  assert.equal(again.ok, false);
});

test('修功：火候满了、灵石够，就破层', () => {
  const { player, world } = setup();
  learnTechnique(world, player, { name: '长春功' });
  const t = player.techniques[0];
  t.exp = 99;
  player.spiritStones = 1000000;
  const res = practiceTechnique(world, player, { name: '长春功', days: 30 });
  assert.equal(res.ok, true);
  assert.equal(t.layer, 2);
  assert.ok(player.spiritStones < 1000000);
});

test('灵石不够：火候足了也冲不上去', () => {
  const { player, world } = setup();
  learnTechnique(world, player, { name: '长春功' });
  const t = player.techniques[0];
  t.exp = 99;
  player.spiritStones = 0;
  const res = practiceTechnique(world, player, { name: '长春功', days: 10 });
  assert.equal(t.layer, 1);
  assert.ok(res.note.includes('灵石'), res.note);
});

test('九层封顶', () => {
  const { player, world } = setup();
  learnTechnique(world, player, { name: '长春功' });
  const t = player.techniques[0];
  t.layer = MAX_LAYER;
  t.exp = 0;
  const res = practiceTechnique(world, player, { name: '长春功', days: 30 });
  assert.equal(t.layer, MAX_LAYER);
  assert.ok(res.note.includes('第九层'), res.note);
});

test('转修散功：换主修要掉一成修为', () => {
  const { player, world } = setup();
  learnTechnique(world, player, { name: '长春功' });
  learnTechnique(world, player, { name: '烈火诀' });
  player.cultivation = 100;
  const res = setMainTechnique(world, player, { name: '烈火诀' });
  assert.equal(res.ok, true);
  assert.ok(player.cultivation < 100);
  assert.equal(player.mainTechnique, '烈火诀');
  assert.ok(res.note.includes('散'));
});

test('主修功法加修炼：同境界下收益更高', () => {
  const gain = (s) => {
    learnTechnique(s.world, s.player, { name: '长春功' });
    applyStateUpdates(s.player, s.world, { timeMonths: 12, flags: { closedDoor: true }, stateUpdates: { cultivation: { delta: 10 } } });
    return s.player.cultivation;
  };
  const bare = setup();
  applyStateUpdates(bare.player, bare.world, { timeMonths: 12, flags: { closedDoor: true }, stateUpdates: { cultivation: { delta: 10 } } });
  const g1 = bare.player.cultivation;
  const withTech = setup();
  const g2 = gain(withTech);
  assert.ok(g2 > g1, `主修功法应更高（${g2} vs ${g1}）`);
});

test('剑诀与炼体：一个伤敌、一个护身', () => {
  const sword = techniqueEffect(techniqueByName('青元剑诀'), 5);
  assert.ok(sword.deathMult < 1);
  const body = techniqueEffect(techniqueByName('象甲功'), 5);
  assert.ok(body.damageTaken < 1);
  assert.ok(layerUpCost(techniqueByName('长春功'), 2) > layerUpCost(techniqueByName('长春功'), 1));
});

test('玉简功法：读到即修，名录外的只记在册', () => {
  const { player, world } = setup();
  addJadeSlip(world, { name: '长春功', skill: '丹道', kind: '功法' });
  const res = studyCraft(world, player, { skill: '丹道', from: '玉简' });
  assert.equal(res.ok, true);
  assert.ok(player.techniques.some((t) => t.name === '长春功'));

  const odd = setup();
  addJadeSlip(odd.world, { name: '无名残篇', skill: '丹道', kind: '功法' });
  studyCraft(odd.world, odd.player, { skill: '丹道', from: '玉简' });
  assert.ok(odd.world.skills.some((s) => s.name === '无名残篇'));
  assert.equal(odd.player.techniques.length, 0, '名录外不给功法数值');
});

test('秘密拜师会败露：日子久了被旧师察觉', () => {
  const { player, world } = setup();
  world.npcs = [{ name: '旧师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 60, need: 60 } }];
  player.craftSecrets = { 丹道: { master: '新师', from: '旧师', sinceMonth: 0 } };
  world.date = { year: 5, month: 1, day: 1 }; // 过了四年多
  const note = checkCraftSecretExposure(world, player, () => 0.01);
  assert.ok(note && note.includes('事泄'), String(note));
  assert.equal(player.craftSecrets['丹道'], undefined, '败露后就清掉');
  const old = world.npcs.find((n) => n.name === '旧师');
  assert.ok(old.bond.grudge >= 30);
  assert.ok(player.reputation < 50);
});

test('秘密拜师也可能一直不露', () => {
  const { player, world } = setup();
  player.craftSecrets = { 丹道: { master: '新师', from: '旧师', sinceMonth: 0 } };
  const note = checkCraftSecretExposure(world, player, () => 0.99);
  assert.equal(note, null);
  assert.ok(player.craftSecrets['丹道'], '没露就还在');
});

test('回合结算：学功法、修功都走系统', () => {
  const { player, world } = setup();
  const learn = applyStateUpdates(player, world, { learnTechnique: { name: '象甲功' } });
  assert.ok(learn.includes('【得法】'));
  const train = applyStateUpdates(player, world, { practiceTechnique: { name: '象甲功', days: 10 } });
  assert.ok(train.includes('【修功】'));
  assert.ok(player.techniques[0].exp > 0);
});
