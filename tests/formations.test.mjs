import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  setFormation,
  dismantleFormation,
  rollSeclusionInterrupt,
  FORMATION_LIMIT,
} from '../public/game.js';
import {
  FORMATIONS,
  FORMATION_TIERS,
  formationByName,
  formationEffects,
  canSetFormation,
  isPortable,
} from '../public/formations.js';

const setup = (regionId = 'qingwu', realm = '金丹初期') => {
  const player = newPlayerState();
  const world = newWorldState();
  world.geo = { regionId, sinceTurn: 0, migrated: false };
  world.date = { year: 1, month: 1, day: 1 };
  player.realm = realm;
  player.spiritStones = 10000000;
  player.reputation = 50;
  return { player, world };
};

test('名录：九级俱全，类型覆盖聚灵/困敌/杀伐/护山/幻术/传送/封印', () => {
  assert.equal(Object.keys(FORMATION_TIERS).length, 9);
  const types = new Set(FORMATIONS.map((f) => f.type));
  for (const t of ['聚灵', '困敌', '杀伐', '护山', '幻术', '传送']) {
    assert.ok(types.has(t), `缺 ${t} 类阵法`);
  }
  assert.ok(FORMATIONS.length >= 18);
  for (let rank = 1; rank <= 9; rank++) {
    const tierName = Object.keys(FORMATION_TIERS)[rank - 1];
    assert.ok(FORMATIONS.some((f) => f.tier === tierName), `缺 ${tierName} 阵法`);
  }
});

test('四级以下可携带，五级起是大阵', () => {
  assert.equal(isPortable(formationByName('聚灵阵')), true);
  assert.equal(isPortable(formationByName('护洞阵')), true);
  assert.equal(isPortable(formationByName('四象阵')), false);
  assert.equal(isPortable(formationByName('周天星斗大阵')), false);
});

test('修为门槛：炼气布不了五级大阵', () => {
  const low = setup('qingwu', '炼气初期');
  const res = setFormation(low.world, low.player, { name: '四象阵' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('修为不足'));
  assert.equal(canSetFormation('炼气初期', formationByName('四象阵')), false);
  assert.equal(canSetFormation('金丹初期', formationByName('四象阵')), true);
});

test('布阵要灵石：不够就布不成，钱不动', () => {
  const { player, world } = setup();
  player.spiritStones = 100;
  const res = setFormation(world, player, { name: '聚灵阵' });
  assert.equal(res.ok, false);
  assert.ok(res.reason.includes('灵石不足'));
  assert.equal(player.spiritStones, 100);
  assert.equal(world.formations.length, 0);
});

test('布阵成功：扣灵石、入册，同地不可重复', () => {
  const { player, world } = setup();
  const before = player.spiritStones;
  const res = setFormation(world, player, { name: '聚灵阵' });
  assert.equal(res.ok, true);
  assert.ok(player.spiritStones < before);
  assert.equal(world.formations.length, 1);
  const again = setFormation(world, player, { name: '聚灵阵' });
  assert.equal(again.ok, false);
  assert.ok(again.reason.includes('已布'));
});

test('最多两座阵', () => {
  const { player, world } = setup();
  setFormation(world, player, { name: '聚灵阵' });
  setFormation(world, player, { name: '护洞阵' });
  const third = setFormation(world, player, { name: '迷仙阵' });
  assert.equal(third.ok, false);
  assert.ok(third.reason.includes(String(FORMATION_LIMIT)));
});

test('聚灵阵加修炼：同境界下收益更高', () => {
  const gain = (s) => {
    applyStateUpdates(s.player, s.world, { timeMonths: 12, flags: { closedDoor: true }, stateUpdates: { cultivation: { delta: 10 } } });
    return s.player.cultivation;
  };
  const bare = setup('qingwu', '金丹初期');
  const formed = setup('qingwu', '金丹初期');
  setFormation(formed.world, formed.player, { name: '聚灵阵' });
  const g1 = gain(bare);
  const g2 = gain(formed);
  assert.ok(g2 > g1, `聚灵阵应更高（${g2} vs ${g1}）`);
});

test('护山阵减伤：同一伤害，阵里掉血更少', () => {
  const hurt = (s) => {
    applyStateUpdates(s.player, s.world, { stateUpdates: { hp: { delta: -50 } } });
    return s.player.hp;
  };
  const bare = setup();
  const formed = setup();
  setFormation(formed.world, formed.player, { name: '护洞阵' });
  const hp1 = hurt(bare);
  const hp2 = hurt(formed);
  assert.ok(hp2 > hp1, `护洞阵应少掉血（${hp2} vs ${hp1}）`);
});

test('幻阵压低闭关被打断的概率', () => {
  const bare = setup();
  const formed = setup();
  setFormation(formed.world, formed.player, { name: '迷仙阵' });
  const seq = () => 0.08;
  const hit = rollSeclusionInterrupt(bare.world, bare.player, '闭关十年', seq);
  const miss = rollSeclusionInterrupt(formed.world, formed.player, '闭关十年', seq);
  assert.ok(hit, '无阵时该被打断');
  assert.equal(miss, null, '有幻阵时同一掷点不该被打断');
});

test('撤阵：从册中移除', () => {
  const { player, world } = setup();
  setFormation(world, player, { name: '聚灵阵' });
  const res = dismantleFormation(world, player, { name: '聚灵阵' });
  assert.equal(res.ok, true);
  assert.equal(world.formations.length, 0);
});

test('传送阵减半路程', () => {
  const { player, world } = setup('dayan'); // 大阵须借地脉，元武国灵气 3
  setFormation(world, player, { name: '传送阵' });
  assert.equal(world.formations.length, 1);
  const report = {};
  applyStateUpdates(player, world, { travelTo: '越国·建州' }, report);
  assert.ok(report.out.timeMonths > 0);
  const months = report.out.timeMonths;
  // 元武国到建州 20 日 ≈ 0.67 月，减半后约 10 日 ≈ 0.33 月
  assert.ok(months < 0.4, `应减半（实际 ${months}）`);
});

test('合计效果取最强：两座聚灵不叠加', () => {
  const fx = formationEffects([{ name: '聚灵阵' }, { name: '聚灵小阵' }]);
  assert.equal(fx.cultMult, 1.15);
});

test('回合结算：setFormation 走系统并给回执', () => {
  const { player, world } = setup();
  const note = applyStateUpdates(player, world, { setFormation: { name: '聚灵阵' } });
  assert.ok(note.includes('【布阵】'));
  assert.equal(world.formations.length, 1);
});
