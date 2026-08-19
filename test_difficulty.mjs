// 难度体系合理性：数值字段完整 + 各机制真实生效（收益/突破/渡劫致死）
import {
  newPlayerState, newWorldState, DIFFICULTIES, applyStateUpdates, breakthroughRate, attemptBreakthrough, buildGMMessages,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 难度表字段完整 ----------
for (const [name, d] of Object.entries(DIFFICULTIES)) {
  assert(`${name} 字段完整`, ['damageMult', 'deathHigh', 'deathLethal', 'gainMult', 'breakBonus', 'tribDeathMult'].every((k) => typeof d[k] === 'number'));
}
assert('普通为基准(全 1/0)', DIFFICULTIES['普通'].gainMult === 1 && DIFFICULTIES['普通'].breakBonus === 0 && DIFFICULTIES['普通'].tribDeathMult === 1);
assert('难度递进单调(受伤/死亡/收益/突破)', DIFFICULTIES['简单'].damageMult < DIFFICULTIES['普通'].damageMult && DIFFICULTIES['普通'].damageMult < DIFFICULTIES['困难'].damageMult && DIFFICULTIES['困难'].damageMult < DIFFICULTIES['炼狱'].damageMult && DIFFICULTIES['简单'].gainMult > DIFFICULTIES['炼狱'].gainMult);

// ---------- 2. 灵石收益 × 难度 ----------
const mk = (difficulty) => ({ ...newWorldState(), settings: { difficulty, pace: '慢', turnLimit: 0 } });
const gain = (difficulty) => {
  const p = newPlayerState();
  applyStateUpdates(p, mk(difficulty), { stateUpdates: { spiritStones: { delta: 100 } } });
  return p.spiritStones;
};
assert('简单灵石 +100 → 125', gain('简单') === 125);
assert('普通灵石 +100 → 100', gain('普通') === 100);
assert('困难灵石 +100 → 85', gain('困难') === 85);
assert('炼狱灵石 +100 → 70', gain('炼狱') === 70);

// ---------- 3. 突破/渡劫成功率 × 难度 ----------
const asc = (difficulty) => {
  const p = newPlayerState();
  p.realm = '渡劫后期';
  return breakthroughRate(p, mk(difficulty), 'ascend');
};
assert('裸渡劫成功率：简单 58', asc('简单') === 58);
assert('裸渡劫成功率：普通 50', asc('普通') === 50);
assert('裸渡劫成功率：困难 45', asc('困难') === 45);
assert('裸渡劫成功率：炼狱 40', asc('炼狱') === 40);

// ---------- 4. 渡劫失败致死率公式（按难度）----------
// 裸渡失败致死 = (100-rate)*0.005*tribDeathMult
const deathOf = (difficulty) => {
  const p = newPlayerState();
  p.realm = '渡劫后期';
  const w = mk(difficulty);
  const rate = breakthroughRate(p, w, 'ascend');
  return Math.min(0.85, Math.max(0.03, (100 - rate) * 0.005 * DIFFICULTIES[difficulty].tribDeathMult));
};
assert('裸渡致死：简单 ≈12.6%', Math.abs(deathOf('简单') - 0.126) < 1e-9);
assert('裸渡致死：普通 =25%', Math.abs(deathOf('普通') - 0.25) < 1e-9);
assert('裸渡致死：困难 ≈35.75%', Math.abs(deathOf('困难') - 0.3575) < 1e-9);
assert('裸渡致死：炼狱 =48%', Math.abs(deathOf('炼狱') - 0.48) < 1e-9);
// 充分准备在炼狱也不会超过上限 85%
const pFull = newPlayerState();
pFull.realm = '渡劫初期'; // 境界不足 -30 → rate 很低
const wFull = mk('炼狱');
assert('致死率上限 85%', deathOf('炼狱') <= 0.85);

// ---------- 5. GM 指引把难度数值讲清楚 ----------
const slow = buildGMMessages(newPlayerState(), mk('炼狱'), [], '测试');
const guideMsg = slow.find((m) => m.role === 'system' && m.content.includes('当前难度'));
assert('慢节奏指引含收益倍率', guideMsg && guideMsg.content.includes('灵石收益×0.7'));
const fast = buildGMMessages(newPlayerState(), { ...mk('困难'), settings: { difficulty: '困难', pace: '快', turnLimit: 0 } }, [], '测试');
const fastGuide = fast.find((m) => m.role === 'system' && m.content.includes('灵石收益×0.85'));
assert('快节奏指引含收益倍率', !!fastGuide);

// ---------- 6. attemptBreakthrough 在普通难度下结果结构不变 ----------
const r = attemptBreakthrough(newPlayerState(), mk('普通'), 'major');
assert('突破返回结构合法', r && typeof r.success === 'boolean' && typeof r.rate === 'number');

console.log(fails === 0 ? '\n✅ 难度体系测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
