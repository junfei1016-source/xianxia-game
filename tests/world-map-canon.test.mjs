// 地图骨架按《凡人修仙传》立：越国—元武—天罗在这一带，乱星海要过古传送阵，灵界只能飞升。
// 原文：第 127 章（越国七派）、第 144/161 章（建州、太岳山脉、黄枫谷坊市）、第 221 章（元武国、天罗国）、
// 第 253/255 章（天罗国魔道六宗隔着姜国车骑国打越国）、第 358 章（慕兰草原与九国盟）、
// 第 365/366 章（乱星海、尾星岛、鬼雾）、第 389 章（星宫、天星城）、第 531 章（深渊海域万兽、奇渊岛）、
// 第 1315 章（飞升灵界须在天渊城服役）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allRegions,
  regionById,
  regionByName,
  travelDays,
  factionsIn,
  pickStarter,
} from '../public/world.js';

const EXPECT = [
  ['qingwu', '越国·建州'],
  ['luoxia', '黄枫谷坊市'],
  ['dayan', '元武国'],
  ['chisha', '天罗国'],
  ['hanyuan', '乱星海·尾星岛'],
  ['guixu', '天星城'],
  ['wanyao', '慕兰草原'],
  ['xingyun', '奇渊岛'],
  ['taiqing', '灵界·天渊城'],
];

test('九个区域的名字沿用原著地名', () => {
  assert.equal(allRegions().length, EXPECT.length);
  for (const [id, name] of EXPECT) {
    assert.equal(regionById(id).name, name, `${id} 的名字应是 ${name}`);
    assert.equal(regionByName(name).id, id, `${name} 应能反查到 ${id}`);
  }
});

test('再也没有旧地图的六国/荒原/仙域名', () => {
  const names = allRegions().map((r) => r.name).join('|');
  for (const ghost of ['青芜国', '落霞坊', '大衍王朝', '赤沙荒原', '寒渊海', '归墟城', '万妖岭', '星陨荒原', '太清仙域']) {
    assert.ok(!names.includes(ghost), `旧地名还在：${ghost}`);
  }
});

test('距离感与原著一致：越国挨着元武，天罗隔着两个小国，乱星海得跨海', () => {
  const toQingwu = (id) => travelDays('qingwu', id);
  assert.equal(toQingwu('luoxia'), 2, '坊市就在建州，两日');
  assert.ok(toQingwu('dayan') <= 25, '越国与元武国交界，走陆路，不该超过一个月');
  assert.ok(toQingwu('chisha') >= 40, '天罗国隔着姜国、车骑国，路要走上月余');
  assert.ok(toQingwu('wanyao') >= 60, '慕兰草原在九国之外，更远');
  assert.ok(toQingwu('hanyuan') >= 100, '乱星海要过古传送阵，不是走去就到的');
  assert.ok(travelDays('hanyuan', 'guixu') < 40, '乱星海内部：尾星岛到天星城不算远');
  assert.ok(travelDays('hanyuan', 'xingyun') < 40, '尾星岛到奇渊岛同在外海');
});

test('凡界各域互通，灵界只能飞升', () => {
  const mortal = EXPECT.filter(([id]) => id !== 'taiqing').map(([id]) => id);
  for (const a of mortal) {
    for (const b of mortal) {
      if (a === b) continue;
      const days = travelDays(a, b);
      assert.ok(Number.isFinite(days) && days > 0, `${a} → ${b} 应当可达`);
    }
  }
  for (const id of mortal) {
    assert.equal(travelDays(id, 'taiqing'), null, `${id} 不该有通往灵界的路`);
  }
  assert.equal(travelDays('qingwu', 'taiqing'), null);
});

test('地气有梯度：建州最薄，元武稍厚，天星城与奇渊岛最浓，灵界最高', () => {
  const qi = (id) => regionById(id).qi;
  assert.ok(qi('qingwu') < qi('dayan'), '越国灵气弱于元武国');
  assert.ok(qi('dayan') <= qi('guixu'), '元武不比乱星海中枢浓');
  assert.ok(qi('guixu') <= qi('taiqing'), '灵界最浓');
  assert.ok(qi('taiqing') <= 6);
  const danger = (id) => regionById(id).danger;
  assert.ok(danger('qingwu') < danger('chisha'), '建州安稳，天罗凶险');
  assert.ok(danger('xingyun') >= danger('hanyuan'), '奇渊岛（深渊海域）最凶');
  assert.equal(danger('xingyun'), 5);
});

test('每个区域都有本地势力，驻地都对得上', () => {
  for (const [id] of EXPECT) {
    const here = factionsIn(id);
    assert.ok(here.length > 0, `${id} 没有任何势力驻地`);
    for (const f of here) assert.equal(f.seat, id);
  }
});

test('开局只从这四个地方起步：建州、坊市、元武、天罗', () => {
  const allowed = new Set(['qingwu', 'luoxia', 'dayan', 'chisha']);
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 60; i += 1) {
    assert.ok(allowed.has(pickStarter(rand)), '开局落点越界');
  }
});
