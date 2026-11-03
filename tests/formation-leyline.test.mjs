import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  setFormation,
  upgradeFormation,
  breakFormation,
} from '../public/game.js';
import {
  formationEffects,
  formationByName,
  upgradeCost,
  FORMATION_MAX_LEVEL,
  leylinePhase,
  canSetOnLeyline,
} from '../public/formations.js';
import { regionById } from '../public/world.js';

const setup = (regionId = 'dayan', realm = '元婴初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 2, day: 1 }; // 二月为"平"
  player.realm = realm;
  player.spiritStones = 100000000;
  return { player, world };
};

test('大阵须借地脉：青芜灵气 2 承不住，大衍灵气 3 可以', () => {
  assert.equal(canSetOnLeyline(regionById('qingwu')), false);
  assert.equal(canSetOnLeyline(regionById('dayan')), true);

  const thin = setup('qingwu');
  const res = setFormation(thin.world, thin.player, { name: '四象阵' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('地脉太薄'));

  const thick = setup('dayan');
  assert.equal(setFormation(thick.world, thick.player, { name: '四象阵' }).ok, true);
});

test('小阵不挑地脉：青芜可以布聚灵阵', () => {
  const { player, world } = setup('qingwu');
  assert.equal(setFormation(world, player, { name: '聚灵阵' }).ok, true);
});

test('加固：三层到顶，灵石照扣，效果更强', () => {
  const { player, world } = setup('dayan');
  setFormation(world, player, { name: '四象阵' });
  const before = formationEffects(world.formations, world).damageTaken;
  const stones = player.spiritStones;
  const r1 = upgradeFormation(world, player, { name: '四象阵' });
  assert.equal(r1.ok, true);
  assert.ok(player.spiritStones < stones);
  assert.equal(world.formations[0].level, 2);

  upgradeFormation(world, player, { name: '四象阵' });
  assert.equal(world.formations[0].level, FORMATION_MAX_LEVEL);
  const capped = upgradeFormation(world, player, { name: '四象阵' });
  assert.equal(capped.ok, false);
  assert.ok(capped.reason.includes('顶'));

  const after = formationEffects(world.formations, world).damageTaken;
  assert.ok(after < before, `加固后应更硬（${after} vs ${before}）`);
});

test('升级代价随层数上涨', () => {
  const f = formationByName('四象阵');
  assert.equal(upgradeCost(f, 1), Math.round(formationCostOf(f) * 0.6));
  assert.ok(upgradeCost(f, 2) > upgradeCost(f, 1));

  function formationCostOf(x) { return 50000; }
});

test('地脉涨落：旺月的大阵比衰月强', () => {
  const strong = setup('dayan');
  strong.world.date = { year: 1, month: 1, day: 1 }; // 旺
  setFormation(strong.world, strong.player, { name: '四象阵' });

  const weak = setup('dayan');
  weak.world.date = { year: 1, month: 3, day: 1 }; // 衰
  setFormation(weak.world, weak.player, { name: '四象阵' });

  assert.equal(leylinePhase(strong.world), '旺');
  assert.equal(leylinePhase(weak.world), '衰');
  const s = formationEffects(strong.world.formations, strong.world).damageTaken;
  const w = formationEffects(weak.world.formations, weak.world).damageTaken;
  assert.ok(s < w, `旺月应更硬（${s} vs ${w}）`);
});

test('小阵不吃地脉：聚灵小阵旺衰同效', () => {
  const a = setup('qingwu');
  a.world.date = { year: 1, month: 1, day: 1 };
  a.world.formations = [{ name: '聚灵小阵', level: 1, region: 'qingwu' }];
  const b = setup('qingwu');
  b.world.date = { year: 1, month: 3, day: 1 };
  b.world.formations = [{ name: '聚灵小阵', level: 1, region: 'qingwu' }];
  assert.equal(formationEffects(a.world.formations, a.world).cultMult, formationEffects(b.world.formations, b.world).cultMult);
});

test('破阵·寻阵眼：眼力到了就拆得掉', () => {
  const { player, world } = setup('dayan');
  world.foeFormations = [{ name: '金锁阵', tier: '二级' }];
  const res = breakFormation(world, player, { name: '金锁阵', method: '寻阵眼', days: 3 }, () => 0.1);
  assert.equal(res.ok, true);
  assert.ok(res.note.includes('阵眼'));
  assert.equal(world.foeFormations.length, 0);
});

test('破阵失败：受伤，阵还在', () => {
  const { player, world } = setup('dayan');
  world.foeFormations = [{ name: '金锁阵', tier: '二级' }];
  const hp0 = player.hp;
  const res = breakFormation(world, player, { name: '金锁阵', method: '寻阵眼', days: 3 }, () => 0.99);
  assert.ok(res.hpLoss > 0);
  assert.ok(player.hp < hp0);
  assert.equal(world.foeFormations.length, 1);
});

test('硬闯失败伤得更重', () => {
  const sneak = setup('dayan');
  sneak.world.foeFormations = [{ name: '金锁阵', tier: '二级' }];
  const a = breakFormation(sneak.world, sneak.player, { name: '金锁阵', method: '寻阵眼' }, () => 0.99);

  const rush = setup('dayan');
  rush.world.foeFormations = [{ name: '金锁阵', tier: '二级' }];
  const b = breakFormation(rush.world, rush.player, { name: '金锁阵', method: '以力破阵' }, () => 0.99);

  assert.ok(b.hpLoss > a.hpLoss, `硬闯应更伤（${b.hpLoss} vs ${a.hpLoss}）`);
});

test('没有敌阵就破不了', () => {
  const { player, world } = setup('dayan');
  const res = breakFormation(world, player, { name: '金锁阵', method: '寻阵眼' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('没有'));
});

test('回合结算：登记敌阵、破阵扣时间', () => {
  const { player, world } = setup('dayan');
  applyStateUpdates(player, world, { foeFormation: { name: '金锁阵', tier: '二级' } });
  assert.equal(world.foeFormations.length, 1);

  const report = {};
  applyStateUpdates(player, world, { breakFormation: { name: '金锁阵', method: '寻阵眼', days: 4 } }, report);
  assert.ok(report.out.timeMonths > 0.1);
});
