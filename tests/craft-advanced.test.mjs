import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  practiceCraft,
  studyCraft,
  craftInsight,
  addJadeSlip,
  useTalisman,
  setTalismanArray,
} from '../public/game.js';
import { isBottlenecked, skillLevelOf, MASTER_CAP_LEVEL, BOTTLENECK_LEVEL } from '../public/craft.js';

const setup = (regionId = 'qingwu', realm = '金丹初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 2, day: 1 };
  player.realm = realm;
  player.spiritStones = 1000000;
  return { player, world };
};

const give = (world, player, name, n = 1) => applyStateUpdates(player, world, { itemChanges: [{ name, delta: n }] });

test('瓶颈：略有小成往上，经验卡在 99 那层纸上', () => {
  const { player, world } = setup();
  player.crafts['丹道'] = 299; // 略有小成，99
  assert.equal(isBottlenecked(299), true);
  const res = practiceCraft(world, player, { skill: '丹道', days: 10 }, () => 0.99);
  assert.equal(res.ok, true);
  assert.equal(player.crafts['丹道'], 299, '撞瓶颈后不该再涨');
  assert.ok(res.note.includes('瓶颈'), res.note);
});

test('自发顿悟：卡得越久，自己悟开的可能越大', () => {
  const { player, world } = setup();
  player.crafts['丹道'] = 299;
  player.craftStuck = { 丹道: 5 };
  const res = practiceCraft(world, player, { skill: '丹道', days: 5 }, () => 0.01);
  assert.equal(res.insight, true);
  assert.ok(res.note.includes('顿悟'), res.note);
  assert.equal(skillLevelOf(player.crafts['丹道']).name, '登堂入室');
});

test('顿悟：卡瓶颈才能悟，悟了直接进一级', () => {
  const { player, world } = setup();
  player.crafts['阵法'] = 299;
  const bad = craftInsight(world, player, { skill: '阵法' });
  assert.equal(bad.ok, true);
  assert.equal(skillLevelOf(player.crafts['阵法']).name, '登堂入室');

  const early = craftInsight(world, player, { skill: '阵法' });
  assert.equal(early.ok, false, '没到瓶颈不能顿悟');
});

test('师父只能教到登堂入室，再往上得靠自己', () => {
  const { player, world } = setup();
  world.npcs = [{ name: '玄阳子', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } }];
  player.crafts['炼器'] = MASTER_CAP_LEVEL * 100; // 登堂入室
  const res = studyCraft(world, player, { skill: '炼器', from: '师父' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('登堂入室'));
});

test('换师父不算叛门：旧师与新师无仇，只是各教一段', () => {
  const { player, world } = setup();
  world.npcs = [
    { name: '旧师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } },
    { name: '新师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } },
  ];
  player.craftMasters['丹道'] = '旧师';
  world.npcs[0].bond.trust = 30; // 新师才是"信得过"的那位
  const res = studyCraft(world, player, { skill: '丹道', from: '师父' });
  assert.equal(res.ok, true);
  assert.ok(!res.note.includes('叛门'), res.note);
  assert.ok(res.note.includes('无甚交集') || res.note.includes('不算背师'), res.note);
  assert.ok(player.reputation >= 0, '声望不动不变负');
  assert.equal(world.npcs.find((n) => n.name === '旧师').bond.grudge, 0);
});

test('叛门：投到与师门为敌的人门下，旧师翻脸、声望受损', () => {
  const { player, world } = setup();
  world.npcs = [
    { name: '旧师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } },
    { name: '新师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } },
  ];
  world.npcLinks = [{ a: '旧师', b: '新师', type: '仇怨' }];
  player.craftMasters['丹道'] = '旧师';
  world.npcs[0].bond.trust = 30;
  const res = studyCraft(world, player, { skill: '丹道', from: '师父' });
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('叛门'), res.note);
  const oldMaster = world.npcs.find((n) => n.name === '旧师');
  assert.ok(oldMaster.bond.grudge > 0);
});

test('秘密拜师：旧师不知道，就不算叛门', () => {
  const { player, world } = setup();
  world.npcs = [
    { name: '旧师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } },
    { name: '新师', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } },
  ];
  world.npcLinks = [{ a: '旧师', b: '新师', type: '仇怨' }];
  player.craftMasters['丹道'] = '旧师';
  world.npcs[0].bond.trust = 30;
  const res = studyCraft(world, player, { skill: '丹道', from: '师父', secret: true });
  assert.equal(res.ok, true);
  assert.ok(!res.note.includes('叛门'), res.note);
  assert.ok(player.craftSecrets['丹道'], '暗中之事宜记一笔');
  assert.equal(player.craftSecrets['丹道'].master, '新师');
  assert.equal(world.npcs.find((n) => n.name === '旧师').bond.grudge, 0);
});

test('玉简·丹方：读到即得丹方', () => {
  const { player, world } = setup();
  addJadeSlip(world, { name: '回春丹方玉简', skill: '丹道', kind: '丹方', recipe: '回春丹' });
  const res = studyCraft(world, player, { skill: '丹道', from: '玉简' });
  assert.equal(res.ok, true);
  assert.ok(world.recipes.some((r) => r.name === '回春丹方'));
});

test('玉简·功法：读到即得功法（入功法册）', () => {
  const { player, world } = setup();
  addJadeSlip(world, { name: '长春功', skill: '丹道', kind: '功法' });
  const res = studyCraft(world, player, { skill: '丹道', from: '玉简' });
  assert.equal(res.ok, true);
  assert.ok(player.techniques.some((t) => t.name === '长春功'), '名录内功法应入功法册');
});

test('符力可并存：金刚符与神行符各管一摊', () => {
  const { player, world } = setup();
  give(world, player, '金刚符', 1);
  give(world, player, '神行符', 1);
  useTalisman(world, player, { name: '金刚符' });
  useTalisman(world, player, { name: '神行符' });
  assert.equal(world.talismanBuffs.length, 2);
  const hp0 = player.hp;
  applyStateUpdates(player, world, { stateUpdates: { hp: { delta: -100 } } });
  assert.ok(player.hp > hp0 - 100, '护身符应减伤');
});

test('同符续时：再贴一张只延时，不多占位', () => {
  const { player, world } = setup();
  give(world, player, '金刚符', 3);
  useTalisman(world, player, { name: '金刚符' });
  const first = world.talismanBuffs[0].untilMonth;
  useTalisman(world, player, { name: '金刚符' });
  assert.equal(world.talismanBuffs.length, 1);
  assert.ok(world.talismanBuffs[0].untilMonth >= first);
});

test('符阵：三张同符合阵，需略有小成', () => {
  const low = setup();
  give(low.world, low.player, '火球符', 3);
  const no = setTalismanArray(low.world, low.player, { name: '火球符' }, () => 0);
  assert.equal(no.ok, false);
  assert.ok(no.reason.includes('略有小成'));

  const ok = setup();
  ok.player.crafts['符箓'] = 200;
  give(ok.world, ok.player, '火球符', 3);
  const res = setTalismanArray(ok.world, ok.player, { name: '火球符' }, () => 0);
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('符阵'));
  assert.ok(ok.world.talismanBuffs[0].name.includes('符阵'));
  assert.ok(!ok.world.inventory.some((x) => x.name === '火球符' && x.qty > 0), '三张应耗掉');
});

test('符阵造诣不足三张也给不了', () => {
  const { player, world } = setup();
  player.crafts['符箓'] = 200;
  give(world, player, '火球符', 2);
  const res = setTalismanArray(world, player, { name: '火球符' }, () => 0);
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('要三张'));
});

test('回合结算：顿悟与符阵都走系统', () => {
  const { player, world } = setup();
  player.crafts['丹道'] = 299;
  const insight = applyStateUpdates(player, world, { craftInsight: { skill: '丹道' } });
  assert.ok(insight.includes('【顿悟】'));

  player.crafts['符箓'] = 200;
  give(world, player, '火球符', 3);
  const array = applyStateUpdates(player, world, { talismanArray: { name: '火球符' } });
  assert.ok(array.includes('【符阵】'));
});
