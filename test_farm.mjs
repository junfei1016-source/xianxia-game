// 重复刷取防护：行动记录 / 连续重复计数 / 收益递减 / 指引注入
import {
  newPlayerState, newWorldState, normalizeAction, updateFarmLog, farmMult, applyStateUpdates, buildGMMessages,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 行动归一化 ----------
assert('归一化去掉标点空白', normalizeAction('去后山采药！') === '去后山采药');
assert('归一化等价判定', normalizeAction('去后山采药') === normalizeAction('去后山采药，'));

// ---------- 2. 连续重复计数 ----------
const w = newWorldState();
w.eraType = 'test'; // 大势倍率归 1，便于断言
assert('首次行动 streak=1', updateFarmLog(w, '去后山采药') === 1);
assert('不同行动 streak=1', updateFarmLog(w, '在城中打听消息') === 1);
assert('再次重复 streak=2', updateFarmLog(w, '去后山采药') === 2);
assert('第三次重复 streak=3', updateFarmLog(w, '去后山采药！') === 3);
assert('中间穿插后仍算窗口内重复', updateFarmLog(w, '去后山采药') === 4);
// 超过窗口（7 次之后最早的那条滑出）
for (let i = 0; i < 6; i++) updateFarmLog(w, '别的行动' + i);
assert('窗口滑出后恢复 streak=1', updateFarmLog(w, '去后山采药') === 1);

// ---------- 3. 收益递减曲线 ----------
assert('farmMult 曲线', farmMult(1) === 1 && farmMult(2) === 0.85 && farmMult(3) === 0.7 && farmMult(4) === 0.6 && farmMult(9) === 0.6);

// ---------- 4. 机械落实：修为与灵石收益递减 ----------
const p3 = newPlayerState();
const w3 = newWorldState();
w3.eraType = 'test';
w3.farmStreak = 3;
applyStateUpdates(p3, w3, { stateUpdates: { cultivation: { delta: 10 }, spiritStones: { delta: 100 } } });
assert('重复第3次：修为 +10 → 7', p3.cultivation === 7);
assert('重复第3次：灵石 +100 → 70', p3.spiritStones === 70);
// 第一次行动不受影响
const p1 = newPlayerState();
const w1 = newWorldState();
w1.eraType = 'test';
w1.farmStreak = 1;
applyStateUpdates(p1, w1, { stateUpdates: { cultivation: { delta: 10 }, spiritStones: { delta: 100 } } });
assert('首次行动收益不打折', p1.cultivation === 10 && p1.spiritStones === 100);

// ---------- 5. 言出法随豁免 ----------
const pg = newPlayerState();
const wg = newWorldState();
wg.eraType = 'test';
wg.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, godMode: true };
wg.farmStreak = 5;
applyStateUpdates(pg, wg, { stateUpdates: { cultivation: { delta: 10 }, spiritStones: { delta: 100 } } });
assert('言出法随豁免防刷', pg.cultivation === 10 && pg.spiritStones === 100);

// ---------- 6. GM 指引注入（中立演绎边际递减） ----------
const wg2 = newWorldState();
wg2.eraType = 'test';
wg2.farmStreak = 3;
const msgs = buildGMMessages(newPlayerState(), wg2, [], '去后山采药');
const guide = msgs.find((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('重复刷取'));
assert('重复第3次注入指引', !!guide);
assert('指引要求中立演绎', guide && guide.content.includes('中立'));
const wg1 = newWorldState();
const msgs1 = buildGMMessages(newPlayerState(), wg1, [], '去后山采药');
assert('无重复时不注入', !msgs1.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('重复刷取')));

console.log(fails === 0 ? '\n✅ 防刷机制测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
