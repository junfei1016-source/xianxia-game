import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlayerState, newWorldState, learnTechnique, practiceTechnique, applyStateUpdates } from '../public/game.js';
import { TECH_GRADES, normalizeTechnique, checkTechniqueRequirements, techniqueEffects } from '../public/techniques.js';

const setup = (regionId = 'qingwu', realm = '金丹初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 2, day: 1 };
  player.realm = realm;
  player.spiritStones = 10000000;
  return { player, world };
};

test('框架：任意功法名都收，只要给品阶', () => {
  const { player, world } = setup();
  const res = learnTechnique(world, player, { name: '无名剑诀', grade: '中阶功法', type: '剑诀', element: '金' });
  assert.equal(res.ok, true);
  assert.equal(player.techniques[0].grade, '中阶功法');
  assert.equal(player.techniques[0].type, '剑诀');
  assert.equal(player.techniques[0].element, '金');
});

test('框架：品阶默认基础，非法属性归一为「无」', () => {
  const t = normalizeTechnique({ name: '杂功', grade: '不存在的品阶', element: '雷' });
  assert.equal(t.grade, '基础功法');
  assert.equal(t.element, '无');
  assert.equal(t.type, '主修');
});

test('特定要求·地利：没有元磁山就练不成', () => {
  const { player, world } = setup('qingwu', '化神初期');
  const spec = { name: '元磁引', grade: '圣阶功法', type: '主修', element: '土', requirements: [{ kind: 'place', value: '元磁山' }] };
  const no = learnTechnique(world, player, spec);
  assert.equal(no.ok, false);
  assert.ok(no.reason.includes('地利'), no.reason);
});

test('特定要求·灵根：属不合收不进来', () => {
  const { player, world } = setup();
  player.spiritRoots = ['火'];
  const res = learnTechnique(world, player, {
    name: '寒渊诀残卷', grade: '中阶功法', type: '主修', element: '水',
    requirements: [{ kind: 'element', value: '水' }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('灵根'));

  player.spiritRoots = ['水'];
  assert.equal(learnTechnique(world, player, {
    name: '寒渊诀残卷', grade: '中阶功法', type: '主修', element: '水',
    requirements: [{ kind: 'element', value: '水' }],
  }).ok, true);
});

test('特定要求·所需之物与前置功法', () => {
  const { player, world } = setup();
  const needPill = {
    name: '筑基秘功', grade: '中阶功法', type: '主修', element: '无',
    requirements: [{ kind: 'item', value: '筑基丹' }, { kind: 'previous', value: '长春功' }],
  };
  assert.equal(learnTechnique(world, player, needPill).ok, false);

  applyStateUpdates(player, world, { itemChanges: [{ name: '筑基丹', delta: 1 }] });
  learnTechnique(world, player, { name: '长春功' });
  const ok = learnTechnique(world, player, needPill);
  assert.equal(ok.ok, true, ok.reason);
});

test('特定要求·修为：条件不足写明缺什么', () => {
  const { player, world } = setup('qingwu', '炼气后期');
  const res = learnTechnique(world, player, {
    name: '太乙玄功', grade: '高阶功法', type: '主修', element: '木',
    requirements: [{ kind: 'realm', value: '化神' }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('修为') || res.reason.includes('条件'));
});

test('名录外功法照样吃效果：剑诀伤敌、主修加修炼', () => {
  const { player, world } = setup();
  learnTechnique(world, player, { name: '自创剑歌', grade: '高阶功法', type: '剑诀', element: '火' });
  const fx = techniqueEffects(player.techniques);
  assert.ok(fx.deathMult < 1);

  const self = setup();
  learnTechnique(self.world, self.player, { name: '自创心法', grade: '高阶功法', type: '主修', element: '火' });
  assert.ok(techniqueEffects(self.player.techniques).cultMult > 1);
});

test('框架接入回合：任意功法可学可练', () => {
  const { player, world } = setup();
  const learn = applyStateUpdates(player, world, { learnTechnique: { name: '山野吐纳法', grade: '低阶功法', type: '主修', element: '土' } });
  assert.ok(learn.includes('【得法】'));
  const train = applyStateUpdates(player, world, { practiceTechnique: { name: '山野吐纳法', days: 10 } });
  assert.ok(train.includes('【修功】'));
  assert.ok(player.techniques[0].exp > 0);
});
