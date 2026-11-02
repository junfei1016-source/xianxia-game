import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  buildGMMessages,
} from '../public/game.js';

const setup = () => ({ player: newPlayerState(), world: newWorldState() });

test('新人物带 links 会结成边，并解析到最终姓名', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [
      { name: '苏瑶', desc: '师姐' },
      { name: '顾长歌', desc: '师兄', links: [{ to: '苏瑶', type: '师承', note: '同门师兄妹' }] },
    ],
  });
  assert.equal(world.npcLinks.length, 1);
  const link = world.npcLinks[0];
  assert.deepEqual([link.a, link.b].sort(), ['苏瑶', '顾长歌'].sort());
  assert.equal(link.type, '师承');
  assert.equal(link.note, '同门师兄妹');
});

test('指代称呼也能解析：aliasMap 里的旧称会落到正式姓名', () => {
  const { player, world } = setup();
  world.aliasMap['老樵夫'] = '王铁山';
  applyStateUpdates(player, world, {
    newNpcs: [
      { name: '王铁山', desc: '樵夫' },
      { name: '柳三娘', desc: '掌柜', links: [{ to: '老樵夫', type: '交易' }] },
    ],
  });
  const link = world.npcLinks.find((l) => l.type === '交易');
  assert.ok(link);
  assert.deepEqual([link.a, link.b].sort(), ['王铁山', '柳三娘'].sort());
});

test('指向不存在的人、或指向自己：一律不结边', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [{ name: '阿七', desc: '杂役', links: [{ to: '不存在的人', type: '师承' }, { to: '阿七', type: '仇怨' }] }],
  });
  assert.equal(world.npcLinks.length, 0);
});

test('血缘自动成边：family 声明的亲属关系不用再写 links', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [
      { name: '陈老爹', desc: '父亲' },
      { name: '陈小满', desc: '女儿', family: { of: '陈老爹', relation: '父女' } },
    ],
  });
  const kin = world.npcLinks.find((l) => l.type === '亲属');
  assert.ok(kin);
  assert.equal(kin.note, '父女');
  // 女儿的身份称呼会被系统自动改名，但边必须落在真实姓名上
  assert.ok(world.npcs.some((n) => n.name === kin.a) && world.npcs.some((n) => n.name === kin.b));
  assert.ok(kin.a !== '陈小满' || kin.b !== '陈老爹');
});

test('同一对人物同一类型不重复记边', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [
      { name: '苏瑶', desc: '' },
      { name: '顾长歌', desc: '', links: [{ to: '苏瑶', type: '同门' }] },
    ],
  });
  applyStateUpdates(player, world, {
    newNpcs: [{ name: '苏瑶', desc: '' }, { name: '顾长歌', desc: '', links: [{ to: '苏瑶', type: '同门' }] }],
  });
  assert.equal(world.npcLinks.filter((l) => l.type === '同门').length, 1);
});

test('牵一发动全身：新人的初始态度受其关系网中人影响', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newNpcs: [{ name: '仇人甲' }] });
  const enemy = world.npcs.find((n) => n.name === '仇人甲');
  enemy.bond = { debt: 0, grudge: 80, trust: 30, need: 20 };

  applyStateUpdates(player, world, {
    newNpcs: [{ name: '仇人乙', links: [{ to: '仇人甲', type: '结义' }] }],
  });
  const ally = world.npcs.find((n) => n.name === '仇人乙');
  assert.equal(ally.bond.grudge, 20, '朋友的朋友的仇人，也记一笔怨');
  assert.equal(ally.bond.trust, 20, '信任会先低一档');
});

test('朋友的朋友：关系网的正面影响同样传导', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newNpcs: [{ name: '恩人甲' }] });
  const friend = world.npcs.find((n) => n.name === '恩人甲');
  friend.bond = { debt: 0, grudge: 0, trust: 85, need: 40 };

  applyStateUpdates(player, world, {
    newNpcs: [{ name: '恩人乙', links: [{ to: '恩人甲', type: '同门' }] }],
  });
  const ally = world.npcs.find((n) => n.name === '恩人乙');
  assert.equal(ally.bond.trust, 40, '基础 30 + 10');
});

test('关系网会进提示词，并在存档快照里带一份', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [
      { name: '苏瑶', desc: '' },
      { name: '顾长歌', desc: '', links: [{ to: '苏瑶', type: '道侣', note: '双修' }] },
    ],
  });
  const text = buildGMMessages(player, world, [], '四处走走').map((m) => m.content).join('\n');
  assert.ok(text.includes('【人物关系网】'));
  assert.ok(text.includes('苏瑶—顾长歌') || text.includes('顾长歌—苏瑶'));
  assert.ok(text.includes('道侣'));
});

test('边数有上限，不会无限膨胀', () => {
  const { player, world } = setup();
  for (let i = 0; i < 70; i++) {
    applyStateUpdates(player, world, {
      newNpcs: [
        { name: `甲${i}`, desc: '' },
        { name: `乙${i}`, desc: '', links: [{ to: `甲${i}`, type: '同门' }] },
      ],
    });
  }
  assert.ok(world.npcLinks.length <= 60, `实际 ${world.npcLinks.length}`);
});

test('校验层接受 links；坏条目被丢弃', () => {
  const { out } = validateStateOutput({
    newNpcs: [{ name: '甲', links: [{ to: '乙', type: '师承' }, { type: '缺 to' }] }],
  });
  assert.equal(out.newNpcs[0].links.length, 1);
  assert.equal(out.newNpcs[0].links[0].to, '乙');
});

test('没有关系网的旧档照常运行', () => {
  const { player, world } = setup();
  delete world.npcLinks;
  applyStateUpdates(player, world, { newNpcs: [{ name: '路人', desc: '' }] });
  assert.equal(world.npcLinks.length, 0);
  const text = buildGMMessages(player, world, [], '看看').map((m) => m.content).join('\n');
  assert.ok(!text.includes('【人物关系网】'));
});
