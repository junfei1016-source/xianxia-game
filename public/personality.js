// ============================================================
//  personality.js —— 人物性格库
//
//  问题：之前性格是自由文本，提示词里只举了"傲娇/伪君子/面冷心热/豪爽/阴狠"五个例子，
//  模型于是把满世界都写成清冷寡言。这里把性格变成一个「六轴坐标 + 四十个特质」的池子：
//   1) 每个特质在六条轴上有取值，天然分成不同类型，不会挤在同一个角落；
//   2) 每回合统计最近登场者偏向哪一极，偏得太多就要求换面；
//   3) 轮换建议只从未用过的特质里取，避免总推同几个。
//
//  这一层只提供数据与建议，不替模型写剧情；判定仍归 game.js。
// ============================================================

// 六条轴：正向是"热"的一端，负向是"冷"的一端。名字只用于提示词与统计。
export const AXES = [
  { id: 'warmth', name: '温度', plus: '热络', minus: '疏冷' },
  { id: 'guile', name: '城府', plus: '深沉', minus: '直白' },
  { id: 'order', name: '守序', plus: '守矩', minus: '随性' },
  { id: 'value', name: '义利', plus: '重义', minus: '重利' },
  { id: 'courage', name: '胆气', plus: '勇决', minus: '谨慎' },
  { id: 'temper', name: '情绪', plus: '外烈', minus: '内敛' },
];

// axes 顺序与 AXES 一致：[温度, 城府, 守序, 义利, 胆气, 情绪]，取值 -1 ~ 1。
export const TRAITS = [
  { id: 'knife', label: '刀子嘴豆腐心', axes: [0.6, -0.6, 0.3, 0.7, 0.4, 0.8],
    gist: '嘴上不饶人，真到事上护得最紧', speech: '话尾带刺，常说"谁管你"，转身却把事办了' },
  { id: 'smile', label: '笑面虎', axes: [0.3, 0.9, 0.5, -0.7, 0.3, -0.4],
    gist: '见面三分笑，算计在心底', speech: '句句客气，从不把真意说满' },
  { id: 'miser', label: '守财奴', axes: [0.2, 0.4, -0.2, -0.9, -0.3, -0.2],
    gist: '一文钱要掰成两半花，命可以省，钱不能亏', speech: '开口先问价钱，句句不离"值不值"' },
  { id: 'fool', label: '痴人', axes: [0.7, -0.5, -0.6, 0.6, 0.5, 0.5],
    gist: '认准一件事就不回头，旁人笑他痴', speech: '爱说"我认这个理"，说完自己先笑' },
  { id: 'bohemian', label: '落拓狂生', axes: [0.5, -0.8, -0.8, 0.1, 0.8, 0.7],
    gist: '不守规矩，偏有真本事', speech: '张口便是讥诮，越正式的场合越放肆' },
  { id: 'pedant', label: '假道学', axes: [0.1, 0.8, 0.8, -0.6, -0.4, -0.5],
    gist: '满口仁义道德，做事先算自己', speech: '常引经据典，句尾爱加"此乃天理"' },
  { id: 'judge', label: '冷面阎罗', axes: [-0.8, 0.6, 0.6, 0.2, 0.7, -0.6],
    gist: '不讲情面，只讲规矩，落在她手里的没跑', speech: '一句话不超过十个字，句句是结论' },
  { id: 'huckster', label: '市侩', axes: [0.4, 0.3, -0.4, -0.9, -0.4, 0],
    gist: '见人说人话，见鬼说鬼话，唯利是图', speech: '口音重、爱套近乎，三句话绕回买卖' },
  { id: 'nice', label: '老好人', axes: [0.8, -0.4, 0.3, 0.4, -0.5, -0.3],
    gist: '谁都不想得罪，最后谁都得罪了', speech: '常说"都行都行"，被逼急了才憋出一句实话' },
  { id: 'contrarian', label: '杠精', axes: [0.2, -0.7, -0.6, -0.4, 0.6, 0.8],
    gist: '你说东她偏说西，只为赢一句嘴', speech: '开口就是"未必吧"，专挑话里的漏洞' },
  { id: 'clam', label: '闷葫芦', axes: [-0.4, 0.2, 0.3, 0.4, 0, -0.9],
    gist: '三棍子打不出一个屁，心里门儿清', speech: '多数时候点头摇头，急了才蹦几个字' },
  { id: 'talker', label: '话痨', axes: [0.8, -0.7, -0.5, 0.3, 0.2, 0.7],
    gist: '一刻不说话就难受，秘密全从嘴里漏出去', speech: '东拉西扯，一句话能岔出三个话题' },
  { id: 'zealot', label: '偏执狂', axes: [0.4, 0.5, -0.5, 0.2, 0.7, 0.6],
    gist: '为一个念头能搭上性命，也搭上别人', speech: '反复提同一件事，语气越说越重' },
  { id: 'clean', label: '洁癖', axes: [-0.6, 0.1, 0.9, -0.1, -0.5, -0.4],
    gist: '容不得一点脏乱，连人心也要擦干净', speech: '说话前先皱眉，常纠正别人的用词和坐姿' },
  { id: 'gambler', label: '赌徒', axes: [0.5, -0.4, -0.9, -0.5, 0.9, 0.6],
    gist: '什么都敢押，输光了也要再押一把', speech: '爱说"赌一把"，把正经事也说成局' },
  { id: 'hermit', label: '隐士', axes: [-0.6, 0, 0.2, 0.5, -0.7, -0.8],
    gist: '躲得远远的，不是怕事，是嫌吵', speech: '慢条斯理，答非所问，一句话能把天聊死' },
  { id: 'ranger', label: '游侠', axes: [0.6, -0.3, -0.7, 0.9, 0.8, 0.3],
    gist: '路见不平就拔刀，管完就走', speech: '嗓门亮，爱说"这事我管了"' },
  { id: 'oath', label: '守诺人', axes: [-0.2, 0.3, 0.9, 0.9, 0.4, -0.5],
    gist: '答应的事，天塌下来也要办', speech: '不多话，只一句"我应了"' },
  { id: 'liar', label: '骗子', axes: [0.3, 0.9, -0.8, -0.8, 0.5, 0.2],
    gist: '十句话里九句是编的，剩一句是为了让你信', speech: '故事讲得滴水不漏，越细越假' },
  { id: 'lover', label: '痴情种', axes: [0.8, -0.3, -0.2, 0.8, 0.3, 0.6],
    gist: '为一个人可以不要命，也可以不要脸', speech: '三句话不离那个人，旁若无人' },
  { id: 'snob', label: '势利眼', axes: [0.3, 0.5, -0.3, -0.9, -0.3, -0.4],
    gist: '看人下菜碟，谁有势就跟谁走', speech: '对上谄媚、对下刻薄，语气一秒钟换一次' },
  { id: 'scholar', label: '书生', axes: [-0.4, -0.2, 0.8, 0.4, -0.5, -0.6],
    gist: '手无缚鸡之力，偏要讲天下道理', speech: '爱引古书，一句三顿，越说越激动' },
  { id: 'brute', label: '莽夫', axes: [0.6, -0.8, -0.7, 0.2, 0.9, 0.8],
    gist: '先动手再动脑，打完才问为什么', speech: '嗓门大、句子短，常用"俺"自称' },
  { id: 'poison', label: '毒舌', axes: [0.1, -0.6, -0.3, 0.3, 0.5, 0.7],
    gist: '专挑人痛处说，说完还替你难过', speech: '语速快，爱用反问句，句句扎心' },
  { id: 'zen', label: '佛系', axes: [0.4, -0.2, 0.2, 0, -0.6, -0.7],
    gist: '天塌下来先喝口茶，急也急不来', speech: '慢、轻、少，常以"随缘"收尾' },
  { id: 'ambition', label: '野心家', axes: [0.5, 0.8, 0.5, -0.6, 0.8, 0.2],
    gist: '每一步都在往上爬，踩着谁都不在乎', speech: '说话留三分，句句是铺垫' },
  { id: 'coward', label: '胆小鬼', axes: [-0.1, -0.2, 0.4, 0.2, -0.9, -0.3],
    gist: '风吹草动先躲，躲完又后悔', speech: '声音发虚，常说"要不……再等等"' },
  { id: 'twoface', label: '口是心非', axes: [0.3, 0.7, 0.3, 0.4, -0.2, 0.1],
    gist: '嘴上说不要，事都替你做好了', speech: '先否认再照办，末了补一句"下不为例"' },
  { id: 'worrier', label: '操心命', axes: [0.9, 0.1, 0.6, 0.5, -0.4, 0.4],
    gist: '别人的事比自己的还上心，累死也不撒手', speech: '开口就是"你可当心"，一件件数给你听' },
  { id: 'prodigy', label: '孤僻天才', axes: [-0.7, 0.3, -0.4, 0.3, 0.2, -0.7],
    gist: '眼里只有自己的东西，人话不会说', speech: '答非所问，术语连篇，听不懂就当没说' },
  { id: 'sunny', label: '乐天派', axes: [0.9, -0.4, -0.5, 0.4, 0.5, 0.6],
    gist: '再糟的事也能找出乐子', speech: '爱笑，句子轻快，常说"总会有办法"' },
  { id: 'vengeful', label: '睚眦必报', axes: [0.1, 0.6, 0.2, -0.4, 0.7, 0.8],
    gist: '记仇记得比谁都清楚，早晚还回去', speech: '语气平和，却句句带刺，专提旧账' },
  { id: 'tiger', label: '扮猪吃虎', axes: [0.5, 0.9, 0.4, 0.3, 0.5, -0.5],
    gist: '装傻充愣，等你自己送上门', speech: '故意说错、装听不懂，眼神却一直盯着你' },
  { id: 'ascetic', label: '苦行僧', axes: [-0.5, 0.1, 0.9, 0.5, 0.4, -0.8],
    gist: '以苦为乐，觉得享福是罪', speech: '句句训诫，劝人少吃少睡多修行' },
  { id: 'nosy', label: '爱管闲事', axes: [0.7, -0.5, -0.2, 0.7, 0.5, 0.5],
    gist: '谁家的事都要插一嘴，插完就陷进去', speech: '爱打听，开口先问"你家那事后来怎样了"' },
  { id: 'selfish', label: '精致利己', axes: [0.3, 0.8, 0.4, -0.9, -0.4, -0.6],
    gist: '从不吃亏，也从不让人看出他在算账', speech: '句句为你着想，句句都在给自己留后路' },
  { id: 'imp', label: '老顽童', axes: [0.9, -0.6, -0.8, 0.4, 0.6, 0.8],
    gist: '年纪一大把，偏要跟你玩闹', speech: '爱开玩笑、抢话头，正经事也用玩笑说' },
  { id: 'dryhumor', label: '冷幽默', axes: [0, 0.2, -0.4, 0.4, 0.2, -0.5],
    gist: '一本正经说荒唐话，自己从不笑', speech: '语调平，说完停一拍，等你自己反应过来' },
  { id: 'loyal', label: '护短', axes: [0.6, 0.1, -0.2, 0.9, 0.6, 0.4],
    gist: '自己人做什么都对，外人做什么都错', speech: '常把"我们的人"挂在嘴边，对外人立刻变脸' },
  { id: 'obsessive', label: '一根筋', axes: [0.4, -0.7, 0.6, 0.4, 0.8, 0.3],
    gist: '认死理，九头牛拉不回', speech: '重复同一句话，越说越响' },
  { id: 'weary', label: '厌世者', axes: [-0.9, 0.2, -0.3, 0, -0.3, -0.7],
    gist: '什么都不信，也什么都不在乎，偏偏看得最透', speech: '语气平得像在念别人的事，句尾常带一句"随你"' },
  { id: 'stone', label: '铁石心肠', axes: [-0.7, 0.4, 0.6, -0.6, 0.5, -0.8],
    gist: '该杀就杀，眼里没有"可怜"二字', speech: '只问结果，不接话头，劝也没用' },
  { id: 'abacus', label: '算盘精', axes: [-0.3, 0.9, 0.4, -0.9, -0.4, -0.6],
    gist: '凡事算三遍，连人情也记在账上', speech: '说话前先顿一下，像在拨算盘；爱说"这账不对"' },
  { id: 'loner', label: '独行客', axes: [-0.8, 0.1, -0.5, 0.4, 0.6, -0.6],
    gist: '独来独往，最怕欠人情', speech: '一个字能说完不说两个，问到私事就闭嘴' },
];

const LABEL_INDEX = new Map(TRAITS.map((t) => [t.label, t]));
const ID_INDEX = new Map(TRAITS.map((t) => [t.id, t]));

export function traitByLabel(label) {
  if (!label) return null;
  const raw = String(label).trim();
  if (LABEL_INDEX.has(raw)) return LABEL_INDEX.get(raw);
  // 允许"刀子嘴豆腐心式的人"这类带修饰的写法：取包含关系
  for (const t of TRAITS) {
    if (raw.includes(t.label) || t.label.includes(raw)) return t;
  }
  return null;
}

export function traitById(id) {
  return ID_INDEX.get(String(id || '')) || null;
}

// 归一：模型给的特质若是库里有的，返回 {id,label}；否则原样保留为自由描述。
export function normalizeTrait(raw) {
  if (!raw) return null;
  const t = traitByLabel(raw) || traitById(raw);
  return t ? { id: t.id, label: t.label } : { id: '', label: String(raw).trim() };
}

// 六轴统计：返回每轴哪一极占多数。
export function axisProfile(entries) {
  const sums = new Array(AXES.length).fill(0);
  let n = 0;
  for (const e of entries) {
    if (!e || !Array.isArray(e.axes) || e.axes.length !== AXES.length) continue;
    for (let i = 0; i < AXES.length; i++) sums[i] += e.axes[i];
    n += 1;
  }
  if (!n) return null;
  return AXES.map((a, i) => {
    const avg = sums[i] / n;
    return {
      axis: a.id,
      name: a.name,
      pole: Math.abs(avg) < 0.15 ? 'neutral' : (avg > 0 ? 'plus' : 'minus'),
      label: Math.abs(avg) < 0.15 ? '不偏' : (avg > 0 ? a.plus : a.minus),
      avg: Math.round(avg * 100) / 100,
    };
  });
}

// 记住最近登场过的性格（存档内，供反重复与统计）。
export function rememberTrait(world, npc, turn = 0) {
  if (!world) return;
  if (!Array.isArray(world.traitLog)) world.traitLog = [];
  const t = normalizeTrait(npc && (npc.trait || npc.personality));
  if (!t) return;
  const entry = traitById(t.id);
  world.traitLog.push({
    name: (npc && npc.name) || '',
    label: t.label,
    id: t.id || '',
    axes: entry ? entry.axes.slice() : null,
    turn,
  });
  if (world.traitLog.length > 20) world.traitLog = world.traitLog.slice(-20);
}

export function recentTraitEntries(world, n = 6) {
  const log = (world && Array.isArray(world.traitLog)) ? world.traitLog : [];
  return log.slice(-n);
}

// 轮换建议：从最近没用过的特质里，按游标取 k 个。游标只读，推进交给 applyStateUpdates，
// 保证同一回合多次拼提示词得到同一份建议（不影响前缀缓存）。
export function nextTraitSuggestions(world, k = 3) {
  const used = new Set(recentTraitEntries(world, 8).map((e) => e.label));
  const cursor = (world && Number.isInteger(world.traitCursor)) ? world.traitCursor : 0;
  const out = [];
  for (let i = 0; i < TRAITS.length && out.length < k; i++) {
    const t = TRAITS[(cursor + i) % TRAITS.length];
    if (!used.has(t.label)) out.push(t);
  }
  return out;
}

export function advanceTraitCursor(world, step = 1) {
  if (!world) return 0;
  const cursor = Number.isInteger(world.traitCursor) ? world.traitCursor : 0;
  world.traitCursor = (cursor + step) % TRAITS.length;
  return world.traitCursor;
}

// 每回合的差异化提示：最近登场者 + 偏得太多的一条轴 + 三个轮换建议。
export function diversityBrief(world, k = 3) {
  const recent = recentTraitEntries(world, 6);
  if (!recent.length) {
    const picks = nextTraitSuggestions(world, k);
    return {
      recent: [],
      skew: null,
      suggestions: picks.map((t) => t.label),
      text: '',
    };
  }
  const profile = axisProfile(recent);
  const skew = profile
    ? profile.filter((p) => p.pole !== 'neutral')
        .map((p) => ({ ...p, count: recent.filter((e) => e.axes && Math.sign(e.axes[AXES.findIndex((a) => a.id === p.axis)]) === (p.pole === 'plus' ? 1 : -1)).length }))
        .sort((a, b) => b.count - a.count)
        .find((p) => p.count >= 3)
    : null;
  const picks = nextTraitSuggestions(world, k);
  const recentText = recent.map((e) => `${e.name}（${e.label}）`).join('、');
  const skewText = skew ? `最近偏「${skew.label}」的人太多，本轮请换一种。` : '';
  return {
    recent: recent.map((e) => ({ name: e.name, label: e.label })),
    skew,
    suggestions: picks.map((t) => t.label),
    text: recentText,
    skewText,
  };
}

export function traitCount() { return TRAITS.length; }
