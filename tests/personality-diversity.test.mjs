import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPlayerState,
  newWorldState,
  applyStateUpdates,
  validateStateOutput,
  buildGMMessages,
} from '../public/game.js';
import {
  AXES,
  TRAITS,
  traitByLabel,
  normalizeTrait,
  axisProfile,
  rememberTrait,
  recentTraitEntries,
  nextTraitSuggestions,
  diversityBrief,
} from '../public/personality.js';

const setup = () => ({ player: newPlayerState(), world: newWorldState() });

test('特质库完整：44 个特质，标签与 id 唯一，六轴取值合法', () => {
  assert.equal(TRAITS.length, 44);
  assert.equal(new Set(TRAITS.map((t) => t.label)).size, TRAITS.length);
  assert.equal(new Set(TRAITS.map((t) => t.id)).size, TRAITS.length);
  for (const t of TRAITS) {
    assert.equal(t.axes.length, AXES.length, `${t.label} 轴数不对`);
    for (const v of t.axes) assert.ok(v >= -1 && v <= 1, `${t.label} 轴值越界`);
    assert.ok(t.gist && t.speech, `${t.label} 缺一句话设定`);
  }
});

test('六轴两端都有足够多的人，不会全挤在"疏冷"那一角', () => {
  AXES.forEach((axis, i) => {
    let plus = 0;
    let minus = 0;
    for (const t of TRAITS) {
      if (t.axes[i] >= 0.4) plus += 1;
      if (t.axes[i] <= -0.4) minus += 1;
    }
    assert.ok(plus >= 6, `${axis.name} 正极只有 ${plus} 人`);
    assert.ok(minus >= 6, `${axis.name} 负极只有 ${minus} 人`);
  });
});

test('特质归一：标签、id、带修饰的写法都能认，瞎写的保留原文', () => {
  assert.equal(normalizeTrait('笑面虎').label, '笑面虎');
  assert.equal(normalizeTrait('smile').label, '笑面虎');
  assert.equal(normalizeTrait('一个笑面虎式的人物').label, '笑面虎');
  assert.equal(normalizeTrait('某种没见过的性格').label, '某种没见过的性格');
  assert.equal(normalizeTrait(''), null);
  assert.equal(traitByLabel('不存在'), null);
});

test('记住最近登场者：最多留 20 条，库里有的记下坐标', () => {
  const { world } = setup();
  for (let i = 0; i < 25; i++) rememberTrait(world, { name: `人${i}`, trait: TRAITS[i % TRAITS.length].label }, i);
  assert.equal(world.traitLog.length, 20);
  const last = world.traitLog.at(-1);
  assert.ok(last.axes && last.axes.length === AXES.length);
  assert.equal(last.name, '人24');
});

test('六轴统计能识别"最近三个人都偏冷"', () => {
  const entries = [
    { axes: TRAITS.find((t) => t.id === 'judge').axes },
    { axes: TRAITS.find((t) => t.id === 'clam').axes },
    { axes: TRAITS.find((t) => t.id === 'hermit').axes },
  ];
  const profile = axisProfile(entries);
  const warmth = profile.find((p) => p.axis === 'warmth');
  assert.equal(warmth.pole, 'minus');
  assert.equal(warmth.label, '疏冷');
});

test('建议是随机抽的：不写存档、跳过最近用过的、三个各不相同', () => {
  const { world } = setup();
  const before = JSON.stringify(world);
  const first = nextTraitSuggestions(world, 3, () => 0.3).map((t) => t.label);
  assert.equal(new Set(first).size, 3);
  assert.equal(JSON.stringify(world), before, '拼提示词不应改存档');

  world.traitLog = [{ name: '甲', label: first[0], axes: null }];
  const second = nextTraitSuggestions(world, 3, () => 0.7).map((t) => t.label);
  assert.ok(!second.includes(first[0]), '用过的特质不应再被推荐');
});

test('随机登场，不追求穷尽：多次抽取覆盖多数人，但不去排队轮完', () => {
  const { world } = setup();
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    for (const t of nextTraitSuggestions(world, 1, () => (i % 7) / 7)) seen.add(t.label);
  }
  assert.ok(seen.size >= 5, '随机抽取应能见到多种人');
  assert.ok(seen.size < TRAITS.length, '随机抽样不该保证轮完整个库');
});

test('随机性可复现：同一个 rand 序列给同一份建议', () => {
  const a = setup().world;
  const b = setup().world;
  const seq = () => 0.618;
  assert.deepEqual(
    nextTraitSuggestions(a, 3, seq).map((t) => t.label),
    nextTraitSuggestions(b, 3, seq).map((t) => t.label),
  );
});

test('差异化提示：带最近的人名、偏斜警告与建议', () => {
  const { world } = setup();
  for (const id of ['judge', 'clam', 'hermit']) {
    const t = TRAITS.find((x) => x.id === id);
    world.traitLog.push({ name: '某人', label: t.label, axes: t.axes.slice() });
  }
  const brief = diversityBrief(world);
  assert.ok(brief.text.includes('某人'));
  assert.ok(brief.skewText.includes('疏冷'));
  assert.equal(brief.suggestions.length, 3);
});

test('新 NPC 会落库：特质、欲望、忌讳、口吻都存下来', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [{
      name: '柳三娘', desc: '坊市掌柜', temperament: '热络', personality: '笑里藏刀',
      trait: '笑面虎', desire: '吞并对门铺子', taboo: '忌人提她死去的丈夫', speech: '句句客气，从不把话说完',
    }],
  });
  const npc = world.npcs.find((n) => n.name === '柳三娘');
  assert.ok(npc);
  assert.equal(npc.trait, '笑面虎');
  assert.equal(npc.desire, '吞并对门铺子');
  assert.ok(npc.taboo.includes('丈夫'));
  assert.equal(world.traitLog.at(-1).label, '笑面虎');
});

test('模型给的特质不在库里：保留原描述，不写坏性格字段', () => {
  const { player, world } = setup();
  applyStateUpdates(player, world, {
    newNpcs: [{ name: '阿七', desc: '杂役', personality: '一种说不清的自在' }],
  });
  const npc = world.npcs.find((n) => n.name === '阿七');
  assert.equal(npc.trait, '一种说不清的自在');
  assert.equal(world.traitLog.at(-1).id, '');
});

test('校验层接受新字段，未知字段仍被忽略', () => {
  const { out, issues } = validateStateOutput({
    newNpcs: [{ name: '甲', trait: '闷葫芦', desire: '吃饱', taboo: '吵', speech: '点头' }],
    rome: 1,
  });
  assert.equal(out.newNpcs[0].trait, '闷葫芦');
  assert.equal(out.newNpcs[0].desire, '吃饱');
  assert.ok(issues.some((i) => i.code === 'unknown_field'));
});

test('回合提示词带【人物差异化】，给的是具体特质而不是空口号', () => {
  const { player, world } = setup();
  const messages = buildGMMessages(player, world, [], '四处走走');
  const text = messages.map((m) => m.content).join('\n');
  assert.ok(text.includes('【人物差异化】'));
  assert.ok(text.includes('不要默认清冷寡言或傲娇'));
  // 从"优先选：A、B、C"里取出建议，必须都是库里的合法标签
  const m = text.match(/优先选：([^；。\n]+)/) || text.match(/作底子：([^；。\n]+)/);
  assert.ok(m, '提示词里应给出具体建议');
  const labels = m[1].split('、').map((s) => s.trim());
  assert.equal(labels.length, 3);
  for (const label of labels) assert.ok(traitByLabel(label), `${label} 不是合法特质`);
});

test('有过登场者后，提示词点名最近的人并警告偏斜', () => {
  const { player, world } = setup();
  for (const id of ['judge', 'clam', 'hermit']) {
    const t = TRAITS.find((x) => x.id === id);
    world.traitLog.push({ name: '冷面人', label: t.label, axes: t.axes.slice() });
  }
  const text = buildGMMessages(player, world, [], '再说说').map((m) => m.content).join('\n');
  assert.ok(text.includes('冷面人'));
  assert.ok(text.includes('偏') || text.includes('换一种'));
  assert.equal(recentTraitEntries(world, 2).length, 2);
});
