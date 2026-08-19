import {
  newPlayerState, newWorldState, applyStateUpdates, factionAlignment, buildWorldContext,
} from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. newFactions 动态建档 ----------
const p1 = newPlayerState();
const w1 = newWorldState();
applyStateUpdates(p1, w1, {
  newFactions: [
    { name: '玄天剑宗', desc: '名门正派，以剑立宗', type: '宗门', alignment: '正道' },
    { name: '血煞魔宫', desc: '魔道巨擘', type: '魔门' },
    { name: '四海商盟', desc: '行商天下', type: '商会' },
  ],
});
assert('newFactions 创建 3 个势力', w1.factions.length === 3);
const jz = w1.factions.find((f) => f.name === '玄天剑宗');
assert('显式 alignment 保留', jz && jz.alignment === '正道');
assert('type 标签保留', jz && jz.type === '宗门');
const xsmg = w1.factions.find((f) => f.name === '血煞魔宫');
assert('缺省 alignment 自动判定为魔道', xsmg && xsmg.alignment === '魔道');
const shsm = w1.factions.find((f) => f.name === '四海商盟');
assert('中立势力判定', shsm && factionAlignment(shsm) === '中立');
assert('建档时间戳 notedTurn 已记', jz && typeof jz.notedTurn === 'number');

// ---------- 2. 去重：同名势力不重复建档 ----------
applyStateUpdates(p1, w1, { newFactions: [{ name: '玄天剑宗', desc: '重复', type: '宗门' }] });
assert('同名势力去重', w1.factions.length === 3 && w1.factions.find((f) => f.name === '玄天剑宗').desc === '名门正派，以剑立宗');

// ---------- 3. 空名/无名势力忽略 ----------
applyStateUpdates(p1, w1, { newFactions: [{ name: '', desc: '无名' }, null, { desc: '没名字' }] });
assert('空名/无效项被忽略', w1.factions.length === 3);

// ---------- 4. factionRelations 对未知势力自动建档 ----------
const p2 = newPlayerState();
const w2 = newWorldState();
applyStateUpdates(p2, w2, {
  factionRelations: [{ name: '天机阁', relation: '结盟', desc: '情报组织', type: '帮派' }],
});
assert('factionRelations 未知势力自动建档', w2.factions.length === 1 && w2.factions[0].name === '天机阁');
assert('自动建档带关系', w2.factions[0].relation === '结盟');
// 已知势力只更新关系
applyStateUpdates(p2, w2, { factionRelations: [{ name: '天机阁', relation: '敌对' }] });
assert('已知势力只更新关系不重复建档', w2.factions.length === 1 && w2.factions[0].relation === '敌对');

// ---------- 5. buildWorldContext 势力上限（防冗杂） ----------
const p3 = newPlayerState();
const w3 = newWorldState();
w3.turn = 100;
for (let i = 0; i < 30; i++) {
  w3.factions.push({ name: '势力' + i, desc: '', type: '', alignment: '中立', relation: '', notedTurn: 100 - i });
}
w3.factions[5].relation = '结盟';
w3.factions[6].relation = '敌对';
w3.factions[7].seeded = true;
const ctx = buildWorldContext(w3);
assert('上下文势力数 ≤ 12', ctx.factions.length <= 12);
assert('结盟/敌对/开局势力优先保留', ['势力5', '势力6', '势力7'].every((n) => ctx.factions.some((f) => f.name === n)));
assert('最近被提及的势力优先保留', ['势力0', '势力1', '势力2'].every((n) => ctx.factions.some((f) => f.name === n)));

// ---------- 6. 结盟加成不受新势力影响（只有结盟算） ----------
const p4 = newPlayerState();
const w4 = newWorldState();
applyStateUpdates(p4, w4, { newFactions: [{ name: '青云门', desc: '', type: '宗门' }] });
assert('新势力默认无修炼加成', w4.factions.length === 1 && w4.factions[0].relation === '');

console.log(fails === 0 ? '\n✅ 势力动态创建测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
