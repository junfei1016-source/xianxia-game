// 死亡必须有叙事背书：died:true 才真正死亡；重伤/危险只坠入「生死一线」濒死
import {
  newPlayerState, newWorldState, applyStateUpdates, evaluateEndings, buildGMMessages, attemptBreakthrough,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

const mk = (settings) => ({ ...newWorldState(), settings: settings || { difficulty: '普通', pace: '慢', turnLimit: 0 } });

// ---------- 1. 叙事明确写死 died:true → 真正死亡 ----------
const p1 = newPlayerState();
const w1 = mk();
applyStateUpdates(p1, w1, { died: true, stateUpdates: { hp: { delta: -10 } } });
assert('died:true → 气血归零', p1.hp === 0);
assert('died:true → 触发死亡结局', evaluateEndings(p1, w1)?.id === 'death');
assert('died:true → 记录死亡标记', w1.flags.deathByRisk === true);

// ---------- 2. 重伤（无 died）→ 只到濒死，不判死 ----------
const p2 = newPlayerState();
const w2 = mk();
applyStateUpdates(p2, w2, { stateUpdates: { hp: { delta: -999 } } });
assert('重伤血尽 → hp=1（濒死）', p2.hp === 1);
assert('重伤血尽 → 坠入生死一线', w2.flags.deathImminent === true);
assert('重伤血尽 → 不触发死亡结局', evaluateEndings(p2, w2) === null);
assert('濒死时再受伤仍不死', (() => { applyStateUpdates(p2, w2, { stateUpdates: { hp: { delta: -50 } } }); return p2.hp === 1 && evaluateEndings(p2, w2) === null; })());

// ---------- 3. 死亡掷骰 → 坠入濒死而非死亡 ----------
const realRandom = Math.random;
try {
  Math.random = () => 0; // 必中骰
  const p3 = newPlayerState();
  const w3 = mk({ difficulty: '炼狱', pace: '慢', turnLimit: 0 });
  applyStateUpdates(p3, w3, { risk: 'lethal' });
  assert('致命行为掷骰命中 → 坠入濒死（非死亡）', w3.flags.deathImminent === true && p3.hp > 0 && p3.hp <= Math.max(1, Math.round(p3.maxHp * 0.2)) + 1);
  assert('掷骰命中 → 不触发死亡结局', evaluateEndings(p3, w3) === null);
  // 濒死状态下不再重复掷骰：hp 不再被压低
  const hpBefore = p3.hp;
  applyStateUpdates(p3, w3, { risk: 'lethal' });
  assert('濒死状态下不重复掷骰', w3.flags.deathImminent === true && p3.hp >= hpBefore);
} finally {
  Math.random = realRandom;
}

// ---------- 4. 脱险：flags.deathImminent:false 解除濒死 ----------
const p4 = newPlayerState();
const w4 = mk();
w4.flags = { deathImminent: true };
applyStateUpdates(p4, w4, { flags: { deathImminent: false }, stateUpdates: { hp: { delta: 30 } } });
assert('脱险解除濒死', w4.flags.deathImminent === false);

// ---------- 5. 言出法随豁免死亡与濒死 ----------
const pg = newPlayerState();
const wg = mk({ difficulty: '炼狱', pace: '慢', turnLimit: 0, godMode: true });
applyStateUpdates(pg, wg, { died: true, stateUpdates: { hp: { delta: -999 } }, risk: 'lethal' });
assert('言出法随：died 被忽略', pg.hp === pg.maxHp && pg.hp > 0);
assert('言出法随：不坠濒死', wg.flags.deathImminent !== true);

// ---------- 6. 濒死指引注入 GM ----------
const w6 = newWorldState();
w6.flags = { deathImminent: true };
const msgs = buildGMMessages(newPlayerState(), w6, [], '我躺平等死');
assert('濒死注入【生死一线】指引', msgs.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('生死一线')));
const w6b = newWorldState();
assert('未濒死不注入', !buildGMMessages(newPlayerState(), w6b, [], '测试').some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('生死一线')));

// ---------- 7. 渡劫失败仍可直接身死（例外路径保留） ----------
const p7 = newPlayerState();
p7.realm = '渡劫后期';
const w7 = mk();
const realRandom2 = Math.random;
try {
  Math.random = () => 0.99; // 必然失败
  const res = attemptBreakthrough(p7, w7, 'ascend');
  assert('渡劫失败返回失败结果', res.success === false);
  // 致死判定随机：只看状态一致性——若死则 hp=0 并触发结局，若不死则活着
  assert('渡劫失败后状态一致', (p7.hp === 0 && evaluateEndings(p7, w7)?.id === 'death') || p7.hp > 0);
} finally {
  Math.random = realRandom2;
}

console.log(fails === 0 ? '\n✅ 死亡叙事背书测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
