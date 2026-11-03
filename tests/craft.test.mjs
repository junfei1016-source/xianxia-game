import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  practiceCraft,
  studyCraft,
  addJadeSlip,
  craftTalisman,
  useTalisman,
  setFormation,
} from '../public/game.js';
import {
  CRAFT_NAMES,
  SKILL_LEVELS,
  skillLevelOf,
  practiceGain,
  craftBonus,
  drawChance,
  talismanByName,
  TALISMANS,
} from '../public/craft.js';

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

test('四艺与五级造诣：每 100 点一级，从初窥门径到出神入化', () => {
  assert.deepEqual(CRAFT_NAMES, ['符箓', '阵法', '丹道', '炼器']);
  assert.equal(skillLevelOf(0).name, '未入门');
  assert.equal(skillLevelOf(100).name, '初窥门径');
  assert.equal(skillLevelOf(250).name, '略有小成');
  assert.equal(skillLevelOf(500).name, '出神入化');
  assert.equal(SKILL_LEVELS.length, 6);
});

test('修习进益随等级递减', () => {
  assert.ok(practiceGain(0, 5) > practiceGain(300, 5));
  assert.equal(practiceGain(0, 3) > 0, true);
});

test('修习：花时间、涨经验，跨级时回执报新境界', () => {
  const { player, world } = setup();
  const report = {};
  applyStateUpdates(player, world, { practiceCraft: { skill: '丹道', days: 6 } }, report);
  assert.ok(player.crafts['丹道'] > 0);
  assert.ok(report.out.timeMonths > 0.1);

  player.crafts['符箓'] = 95;
  const note = applyStateUpdates(player, world, { practiceCraft: { skill: '符箓', days: 6 } });
  assert.ok(note.includes('初窥门径'), note);
});

test('玉简：读一次记下，同一块不能再读', () => {
  const { player, world } = setup();
  addJadeSlip(world, { name: '五行阵图', skill: '阵法' });
  const first = studyCraft(world, player, { skill: '阵法', from: '玉简' });
  assert.equal(first.ok, true);
  assert.ok(player.crafts['阵法'] > 0);
  const second = studyCraft(world, player, { skill: '阵法', from: '玉简' });
  assert.equal(second.ok, false);
  assert.ok(second.reason.includes('没有可读'));
});

test('师父指点：没有师徒名分不行，有则进益更多', () => {
  const bare = setup();
  const no = studyCraft(bare.world, bare.player, { skill: '炼器', from: '师父' });
  assert.equal(no.ok, false);

  const taught = setup();
  taught.world.npcs = [{ name: '玄阳子', relation: '拜师', bond: { debt: 0, grudge: 0, trust: 80, need: 60 } }];
  const yes = studyCraft(taught.world, taught.player, { skill: '炼器', from: '师父' });
  assert.equal(yes.ok, true);

  const slip = setup();
  addJadeSlip(slip.world, { name: '炼器心得', skill: '炼器' });
  studyCraft(slip.world, slip.player, { skill: '炼器', from: '玉简' });
  assert.ok(taught.player.crafts['炼器'] > slip.player.crafts['炼器'], '师父指点应更多');
});

test('造诣加成：丹道/炼器/阵法/符箓各有各的用', () => {
  assert.ok(craftBonus(200, '丹道').brew > 0);
  assert.ok(craftBonus(200, '炼器').forge > 0);
  assert.ok(craftBonus(200, '阵法').breakForm > 0);
  assert.ok(craftBonus(200, '符箓').power > 0);
  assert.equal(craftBonus(0, '丹道').brew, 0);
});

test('制符：造诣不够画不了高阶符', () => {
  const { player, world } = setup();
  give(world, player, '符纸', 5);
  give(world, player, '朱砂', 5);
  const low = craftTalisman(world, player, { name: '疗伤符' }, () => 0);
  assert.equal(low.ok, true, '凡符零造诣也能画');

  const high = craftTalisman(world, player, { name: '回春符' }, () => 0);
  assert.equal(high.ok, false);
  assert.ok(high.reason.includes('造诣不足'));
});

test('制符：缺料不行，成功入包、失败出废符', () => {
  const { player, world } = setup();
  const none = craftTalisman(world, player, { name: '疗伤符' }, () => 0);
  assert.equal(none.ok, false);
  assert.ok(none.reason.includes('缺材料'));

  give(world, player, '符纸', 3);
  give(world, player, '朱砂', 3);
  const ok = craftTalisman(world, player, { name: '疗伤符' }, () => 0);
  assert.equal(ok.success, true);
  const it = world.inventory.find((x) => x.name === '疗伤符');
  assert.equal(it.kind, '符箓');

  const fail = craftTalisman(world, player, { name: '疗伤符' }, () => 0.99);
  assert.equal(fail.success, false);
  assert.ok(world.inventory.some((x) => x.name === '废符'));
});

test('用符：回血、护身 buff、过期失效', () => {
  const { player, world } = setup();
  player.hp = 10;
  give(world, player, '疗伤符', 1);
  const heal = useTalisman(world, player, { name: '疗伤符' });
  assert.equal(heal.ok, true);
  assert.ok(player.hp > 10);
  assert.ok(!world.inventory.some((x) => x.name === '疗伤符'), '符用掉即废');

  const guard = setup();
  give(guard.world, guard.player, '金刚符', 1);
  useTalisman(guard.world, guard.player, { name: '金刚符' });
  assert.ok(guard.world.talismanBuff.damageTaken < 1);
  assert.ok(guard.world.talismanBuff.untilMonth > 0);

  // 过期：把日期推后
  guard.world.date = { year: 3, month: 1, day: 1 };
  const before = guard.player.hp;
  applyStateUpdates(guard.player, guard.world, { stateUpdates: { hp: { delta: -50 } } });
  assert.equal(guard.player.hp, before - 50, '过期后不再减伤');
});

test('造诣提升成符率', () => {
  const t = talismanByName('疗伤符');
  assert.ok(drawChance(t, 400) > drawChance(t, 0));
  assert.ok(TALISMANS.length >= 10);
});

test('珍材代地脉：青芜布大阵，三份灵品材料可代', () => {
  const thin = setup('qingwu');
  give(thin.world, thin.player, '灵玉', 3);
  const fail = setFormation(thin.world, thin.player, { name: '四象阵' });
  assert.equal(fail.ok, false, '不给材料布不成');

  const res = setFormation(thin.world, thin.player, { name: '四象阵', materials: ['灵玉', '灵玉', '灵玉'] });
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('珍材代脉'));
  assert.ok(!thin.world.inventory.some((x) => x.name === '灵玉' && x.qty > 0), '三份灵材应被耗掉');
});

test('阵道造诣让布阵更便宜', () => {
  const novice = setup('dayan');
  const master = setup('dayan');
  master.player.crafts['阵法'] = 400;
  setFormation(novice.world, novice.player, { name: '四象阵' });
  setFormation(master.world, master.player, { name: '四象阵' });
  const spentNovice = 1000000 - novice.player.spiritStones;
  const spentMaster = 1000000 - master.player.spiritStones;
  assert.ok(spentMaster < spentNovice, `阵道高手应更省（${spentMaster} vs ${spentNovice}）`);
});

test('回合结算：制符与用符都走系统', () => {
  const { player, world } = setup();
  give(world, player, '符纸', 2);
  give(world, player, '朱砂', 2);
  const note = applyStateUpdates(player, world, { craftTalisman: { name: '疗伤符' } });
  assert.ok(note.includes('【制符】'));
  const used = applyStateUpdates(player, world, { useTalisman: { name: '疗伤符' } });
  assert.ok(used.includes('【用符】'));
});
