// 机缘多样性：钩子登记 / 拒绝记忆 / 防同类反复的 GM 指引
import {
  newPlayerState, newWorldState, applyStateUpdates, buildWorldContext, buildGMMessages,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 钩子登记 ----------
const p = newPlayerState();
const w = newWorldState();
applyStateUpdates(p, w, {
  hooks: [
    { theme: '秘境', title: '青冥秘境现世', declined: false },
    { theme: '委托', title: '护送商队', declined: true },
  ],
});
assert('钩子登记 2 条', (w.hookLog || []).length === 2);
assert('拒绝标记保留', w.hookLog[1].declined === true);
assert('回合号已记', w.hookLog.every((h) => typeof h.turn === 'number'));

// ---------- 2. 钩子日志上限 8 条 ----------
for (let i = 0; i < 10; i++) applyStateUpdates(p, w, { hooks: [{ theme: '奇遇', title: 'x' + i }] });
assert('hookLog 上限 8 条', w.hookLog.length === 8);
assert('保留最近', w.hookLog[7].title === 'x9');

// ---------- 3. 世界快照携带钩子 ----------
const ctx = buildWorldContext(w);
assert('快照包含 hooks（最近 8 条）', Array.isArray(ctx.hooks) && ctx.hooks.length === 8 && ctx.hooks[0].theme === '奇遇');

// ---------- 4. GM 指引：被拒与重复主题都要提醒 ----------
const w1 = newWorldState();
w1.hookLog = [
  { theme: '秘境', title: '甲', declined: true, turn: 1 },
  { theme: '秘境', title: '乙', declined: false, turn:2 },
  { theme: '委托', title: '丙', declined: false, turn: 3 },
];
const g1 = buildGMMessages(newPlayerState(), w1, [], '测试').find((m) => m.role === 'system' && m.content.includes('机缘变化'));
assert('有钩子历史时注入【机缘变化】', !!g1);
assert('提及被拒钩子', g1 && g1.content.includes('已拒绝'));
assert('提及不要重复同类', g1 && g1.content.includes('同一主题'));
const w2 = newWorldState();
w2.hookLog = [{ theme: '奇遇', title: 'a', declined: false, turn: 1 }];
assert('钩子太少（<2）不注入', !buildGMMessages(newPlayerState(), w2, [], 'x').some((m) => m.role === 'system' && m.content.includes('机缘变化')));
const w3 = newWorldState();
assert('无钩子不注入', !buildGMMessages(newPlayerState(), w3, [], 'x').some((m) => m.role === 'system' && m.content.includes('机缘变化')));
const w4 = newWorldState();
w4.hookLog = w1.hookLog;
w4.settings = { difficulty: '普通', pace: '慢', turnLimit: 0, godMode: true };
assert('言出法随不注入', !buildGMMessages(newPlayerState(), w4, [], 'x').some((m) => m.role === 'system' && m.content.includes('机缘变化')));

console.log(fails === 0 ? '\n✅ 机缘多样性测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
