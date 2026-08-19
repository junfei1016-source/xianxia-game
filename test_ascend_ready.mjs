// 渡劫准备 → 飞升 验证（纯规则引擎，无 LLM，秒级）
import { newPlayerState, newWorldState, breakthroughRate, attemptBreakthrough } from './public/game.js';

function makePlayer(equipped, npcs) {
  const p = newPlayerState();
  p.realm = '渡劫后期';
  p.cultivation = 100;
  p.morality = 40; p.reputation = 60; // 道心达标
  p.maxHp = 10000; p.hp = 10000; p.lifespan = 10000;
  const w = newWorldState();
  w.inventory = equipped;
  w.npcs = npcs;
  return { p, w };
}

function simulate(name, equipped, npcs, n = 20) {
  const { p, w } = makePlayer(equipped, npcs);
  const rate = breakthroughRate(p, w, 'ascend');
  let win = 0, fail = 0, dead = 0;
  for (let i = 0; i < n; i++) {
    const p2 = JSON.parse(JSON.stringify(p));
    const w2 = JSON.parse(JSON.stringify(w));
    const r = attemptBreakthrough(p2, w2, 'ascend');
    if (r.success) win++;
    else if (r.death) dead++;
    else fail++;
  }
  console.log(`【${name}】成功率 ${rate}% → ${n}次模拟: 飞升${win} 失败${fail} 死亡${dead}`);
}

console.log('=== 渡劫准备 → 飞升 验证 ===');
// 1. 充分准备
simulate('神品护身镜+破劫词条+道侣+道心', [
  { name: '玄天护身镜', kind: '法宝', grade: '仙阶', rarity: '神品', affix: '护体·破劫', equipped: true },
], [{ name: '苏瑶', relation: '结为道侣' }]);
// 2. 神品+逆天改命（免死）
simulate('神品+逆天改命(免死)', [
  { name: '涅槃珠', kind: '法宝', grade: '神品', rarity: '神品', affix: '逆天改命·涅槃', equipped: true },
], [{ name: '苏瑶', relation: '结为道侣' }]);
// 3. 半准备（玄品法宝，无道侣）
simulate('玄品法宝+道心(无道侣)', [
  { name: '青玉印', kind: '法宝', grade: '地阶', rarity: '玄品', affix: '', equipped: true },
], []);
// 4. 裸渡劫
simulate('裸渡劫(无准备)', [], []);
console.log('=== 结束 ===');
