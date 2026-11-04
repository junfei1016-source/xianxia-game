import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  buildGMMessages,
  buildWorldContext,
  linkIsKnown,
} from '../public/game.js';

const setup = () => ({ player: newPlayerState(), world: newWorldState() });

const makeLink = (world, patch) => {
  applyStateUpdates(newPlayerState(), world, { newNpcs: [patch] });
  return world.npcLinks[world.npcLinks.length - 1];
};

test('默认明暗：亲缘/师承/同门/道侣/结义是明面，仇怨/交易/主仆是暗的', () => {
  const { world } = setup();
  applyStateUpdates(newPlayerState(), world, { newNpcs: [{ name: '甲' }] });
  const known = makeLink(world, { name: '乙', links: [{ to: '甲', type: '师承' }] });
  const hidden = makeLink(world, { name: '丙', links: [{ to: '甲', type: '仇怨' }] });
  const deal = makeLink(world, { name: '丁', links: [{ to: '甲', type: '交易' }] });
  const servant = makeLink(world, { name: '戊', links: [{ to: '甲', type: '主仆' }] });
  assert.equal(linkIsKnown(known), true);
  assert.equal(linkIsKnown(hidden), false);
  assert.equal(linkIsKnown(deal), false);
  assert.equal(linkIsKnown(servant), false);
});

test('可以显式覆盖：暗关系也能公开，明关系也能藏着', () => {
  const { world } = setup();
  applyStateUpdates(newPlayerState(), world, { newNpcs: [{ name: '甲' }] });
  const opened = makeLink(world, { name: '乙', links: [{ to: '甲', type: '仇怨', known: true }] });
  const sealed = makeLink(world, { name: '丙', links: [{ to: '甲', type: '师承', known: false }] });
  assert.equal(linkIsKnown(opened), true);
  assert.equal(linkIsKnown(sealed), false);
});

test('提示词分两栏：明关系进关系网，暗关系进"不得点破"', () => {
  const { player, world } = setup();
  applyStateUpdates(newPlayerState(), world, { newNpcs: [{ name: '甲' }] });
  makeLink(world, { name: '乙', links: [{ to: '甲', type: '师承' }] });
  makeLink(world, { name: '丙', links: [{ to: '甲', type: '仇怨', note: '夺宝之恨' }] });

  const text = buildGMMessages(player, world, [], '四处走走').map((m) => m.content).join('\n');
  const netLine = text.split('\n').find((l) => l.includes('【人物关系网】')) || '';
  const secretLine = text.split('\n').find((l) => l.includes('【暗中的关系')) || '';
  assert.ok(netLine.includes('师承'));
  assert.ok(!netLine.includes('仇怨'), '暗关系不能出现在普通关系网里');
  assert.ok(secretLine.includes('仇怨'));
  assert.ok(secretLine.includes('不得点破'));
});

test('存档快照只带明关系，暗关系不进快照', () => {
  const { player, world } = setup();
  applyStateUpdates(newPlayerState(), world, { newNpcs: [{ name: '甲' }] });
  makeLink(world, { name: '乙', links: [{ to: '甲', type: '师承' }] });
  makeLink(world, { name: '丙', links: [{ to: '甲', type: '仇怨' }] });
  const ctx = buildWorldContext(world, player);
  assert.equal(ctx.npcLinks.length, 1);
  assert.equal(ctx.npcLinks[0].type, '师承');
});

test('linkReveals 只公开被查到的那一条，其余继续藏着', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newNpcs: [{ name: '甲' }] });
  makeLink(world, { name: '乙', links: [{ to: '甲', type: '仇怨', note: '夺宝' }] });
  makeLink(world, { name: '丙', links: [{ to: '甲', type: '交易', note: '销赃' }] });

  const note = applyStateUpdates(player, world, { linkReveals: [{ a: '甲', b: '乙', type: '仇怨' }] });
  assert.ok(note.includes('关系浮出水面'));
  const links = world.npcLinks;
  assert.equal(links.find((l) => l.type === '仇怨').known, true);
  assert.equal(links.find((l) => l.type === '交易').known, false, '别的暗关系不能跟着曝光');

  const text = buildGMMessages(player, world, [], '继续').map((m) => m.content).join('\n');
  const netLine = text.split('\n').find((l) => l.includes('【人物关系网】')) || '';
  assert.ok(netLine.includes('仇怨'), '查明后应进关系网');
});

test('指向不存在的边、或已经公开的边：linkReveals 不报错也不重复记', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, { newNpcs: [{ name: '甲' }] });
  makeLink(world, { name: '乙', links: [{ to: '甲', type: '师承' }] });
  const note = applyStateUpdates(player, world, {
    linkReveals: [{ a: '甲', b: '乙', type: '师承' }, { a: '甲', b: '不存在' }],
  });
  assert.ok(!note || !note.includes('关系浮出水面'), '本来就公开的边不应再报一次');
});

test('旧档的边没有 known 字段：按"公开"处理，不会突然从档案消失', () => {
  const { player, world } = setup();
  world.npcLinks = [{ a: '苏瑶', b: '顾长歌', type: '仇怨' }]; // 旧数据
  const ctx = buildWorldContext(world, player);
  assert.equal(ctx.npcLinks.length, 1);
  assert.equal(linkIsKnown(world.npcLinks[0]), true);
});

test('血缘自动成边默认是公开的（亲属关系藏不住）', () => {
  const { world } = setup();
  applyStateUpdates(newPlayerState(), world, {
    newNpcs: [
      { name: '陈老爹' },
      { name: '陈小满', family: { of: '陈老爹', relation: '父女' } },
    ],
  });
  const kin = world.npcLinks.find((l) => l.type === '亲属');
  assert.equal(kin.known, true);
});

test('校验层接受 linkReveals；缺 a/b 的条目被丢弃', () => {
  const { out } = validateStateOutput({
    linkReveals: [{ a: '甲', b: '乙' }, { a: '只有一方' }],
  });
  assert.equal(out.linkReveals.length, 1);
  assert.equal(out.linkReveals[0].b, '乙');
});
