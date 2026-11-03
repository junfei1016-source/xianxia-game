// 真实前端 + 固定模型响应；独立端口存档，不发出外部请求。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { newPlayerState, newWorldState, GAME_VERSION } from '../public/game.js';

const port = Number(process.env.REVIEW_PORT || 3100);
const guards = process.env.REVIEW_SUITE === 'guards';
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('REVIEW_PORT 必须为 1024–65535');
const publicRoot = new URL('../public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
  ['/world.js', ['world.js', 'text/javascript; charset=utf-8']],
  ['/personality.js', ['personality.js', 'text/javascript; charset=utf-8']],
  ['/pills.js', ['pills.js', 'text/javascript; charset=utf-8']],
  ['/treasures.js', ['treasures.js', 'text/javascript; charset=utf-8']],
  ['/materials.js', ['materials.js', 'text/javascript; charset=utf-8']],
  ['/formations.js', ['formations.js', 'text/javascript; charset=utf-8']],
  ['/craft.js', ['craft.js', 'text/javascript; charset=utf-8']],
  ['/techniques.js', ['techniques.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);

function fixture(scenario, pace) {
  const player = { ...newPlayerState(), name: '审阅测试角色', spiritStones: 30 };
  const world = newWorldState();
  world.era = '盛世，坊市安宁';
  world.eraType = '盛世';
  world.turn = 10;
  world.settings = { ...world.settings, pace: pace === 'slow' ? '慢' : '快', turnLimit: 0, length: '简短' };
  world.quests.push({
    id: 'review-delivery', type: 'side', title: '护送商队',
    objective: '将商队护送到青州', reward: '30 灵石', timeNode: '三日内', status: 'active',
    ...(scenario === 'legacy'
      ? { deadlineTurn: 4 }
      : { deadlineDate: { year: 1, month: 1, day: 4 }, deadlineVersion: 2 }),
  });
  return {
    save: {
      player, world, history: [], mode: 'random', answers: {}, savedAt: Date.now(),
      log: [{ kind: 'sys', text: '本地模拟审阅：请在任务页检查期限。这里不调用真实模型。' }],
    },
    config: {
      baseUrl: 'http://127.0.0.1', apiKey: 'review-only-placeholder',
      model: 'deepseek-v4-flash', temperature: 0, jsonMode: true,
    },
  };
}

function guardFixture(pace) {
  const data = fixture('calendar', pace);
  data.save.player.name = '规则校验测试角色';
  data.save.player.hp = 80;
  data.save.world.quests.push({
    id: 'review-completed', type: 'side', title: '旧日送信', objective: '送信',
    reward: '已领取', status: 'completed', deadlineVersion: 2, deadlineDate: null,
  });
  data.save.world.events.push({ subject: '旧日送信', title: '已完成', desc: '此前已经交付。', turn: 9 });
  data.save.log = [{ kind: 'sys', text: '规则校验审阅：固定异常提案，不会访问真实模型或修改正式存档。' }];
  return data;
}

function simulateGuards(action) {
  if (/特殊名称/.test(action)) return {
    narrative: '特殊名称演示：记录名为 toString 的地点和名为 hasOwnProperty 的测试物品，检查显示与事迹分类不会误读继承属性。',
    newLocations: [{ name: 'toString', desc: '字典边界测试地点。' }],
    newEvents: [{ subject: 'toString', title: '到访', desc: '真实登记的测试地点。' }],
    itemChanges: [{ name: 'hasOwnProperty', kind: '丹药', delta: 1, desc: '字典边界测试物品。' }],
  };
  if (/混合校验/.test(action)) return {
    narrative: '混合校验演示：叙事声称直接改写气血、目标与境界，同时也提出正常的灵石收入和地点登记。系统应逐项裁决。',
    stateUpdates: { hp: { set: 1 }, spiritStones: { delta: 10 } },
    timeMonths: '999', realmChange: '不存在的境界', goalNote: '伪造的目标成功',
    flags: { deathByRisk: true, hasSect: true },
    'diagnostic-sensitive-marker': 'do-not-log-input-values',
    newNpcs: [{ name: 123 }], newLocations: [{ name: '校验坊市', desc: '合法地点应保留。' }],
    itemChanges: [{ name: '不应出现的丹药' }],
  };
  if (/终态改写/.test(action)) return {
    narrative: '终态改写演示：模型错误声称旧日送信失败。实际已完成状态和事迹必须保持。',
    questUpdates: [{ title: '旧日送信', status: 'failed', note: '这是错误提案。' }],
  };
  if (/冲突更新/.test(action)) return {
    narrative: '冲突更新演示：同一任务被同时提为完成和失败，两项都不应落地。',
    questUpdates: [{ title: '护送商队', status: 'completed' }, { title: '护送商队', status: 'failed' }],
  };
  if (/根数组/.test(action)) return {
    narrative: '根数组演示：返回了根数组而非状态对象，本次不应结算回合或推进日期。',
    rawState: '[{"timeMonths":12,"stateUpdates":{"spiritStones":{"delta":999}}}]',
  };
  if (/数值溢出/.test(action)) return {
    narrative: '数值溢出演示：超出安全数值的收益应被拒绝，不得污染存档。',
    stateUpdates: { spiritStones: { delta: Number.MAX_SAFE_INTEGER } }, timeMonths: 0,
  };
  return { narrative: '正常增减演示：你支付五枚灵石购买情报，并在原地商谈。', stateUpdates: { spiritStones: { delta: -5 } }, timeMonths: 0 };
}

function simulate(action) {
  if (/完成并过四天|完成并度过四天|四日交付/.test(action)) {
    return {
      narrative: '四日交付：你在旅程结束时护送商队抵达青州，交付凭证，完成委托。',
      timeMonths: 4 / 30, questUpdates: [{ title: '护送商队', status: 'completed' }],
    };
  }
  if (/补录|澄清|新约定/.test(action)) {
    return {
      narrative: '新约定：货主明确同意从今日起再给三天，你记下了新的截止日期。',
      questUpdates: [{ title: '护送商队', deadlineDays: 3, timeNode: '从今日起三日内' }],
    };
  }
  if (/旅途接取|旅行后接取|接新任务/.test(action)) {
    return {
      narrative: '旅途接取：经过一月赶路，你到达新城，接下三日内交付信件的新委托。',
      timeMonths: 1,
      newQuests: [{
        title: '抵达后新委托', objective: '送信至城东', reward: '10 灵石',
        timeNode: '抵达后三日内', deadlineDays: 3,
      }],
    };
  }
  if (/过四天|度过四天|四日之后/.test(action)) {
    return { narrative: '四日之后，你再次来到货栈，沿途的等待让日历前进了四天。', timeMonths: 4 / 30 };
  }
  if (/过三天|度过三天|三日之后/.test(action)) {
    return { narrative: '三日之后，你回到坊市，正值原定的截止日。', timeMonths: 3 / 30 };
  }
  if (/过一天|次日|翌日/.test(action)) {
    return { narrative: '翌日，你整顿行囊，继续手头的委托。', timeMonths: 1 / 30 };
  }
  return { narrative: '短对话：你与货主继续商谈细节。这只是同日的一段对话，日期没有变化。', timeMonths: 0 };
}

function modelContent(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const system = String(messages[0]?.content || '');
  const lastUser = String(messages.filter((message) => message.role === 'user').at(-1)?.content || '');
  if (system.includes('创世者')) {
    return JSON.stringify({
      player: { name: '审阅测试角色', origin: '散修' },
      era: '盛世，坊市安宁', eraType: '盛世',
      startingLocation: { name: '青州坊市', desc: '本地模拟测试用坊市' },
      openingHook: '你来到货栈，与货主商谈委托。',
    });
  }
  if (system.includes('记忆整理师')) return '测试角色在青州坊市商谈委托，任务期限以游戏日期为准。';
  const isExtraction = lastUser.includes('\n本回合叙事：\n');
  const action = isExtraction ? lastUser.split('\n本回合叙事：\n').at(-1) : lastUser;
  const result = guards ? simulateGuards(action) : simulate(action);
  if (result.rawState) return (isExtraction || payload.response_format) ? result.rawState : result.narrative;
  if (isExtraction) {
    const { narrative, ...state } = result;
    return JSON.stringify(state);
  }
  return payload.response_format ? JSON.stringify(result) : result.narrative;
}

const reviewHtml = [
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>法言天地 · 日期期限审阅</title>',
  '<style>body{max-width:840px;margin:60px auto;padding:24px;background:#131719;color:#e6ddc8;font:18px/1.7 system-ui}button{padding:12px 18px;margin:8px;border:1px solid #ba9954;background:#252b29;color:#f5e7c5;cursor:pointer}code,a{color:#e5c17d}</style>',
  '<h1>法言天地 v' + GAME_VERSION + ' · 本地模拟审阅</h1>',
  '<p>真实游戏前端搭配固定模型响应，不调用外部 API。测试存档只在当前端口，不影响 localhost:3000 的正式存档。</p>',
  '<button data-scenario="calendar">加载三日期限（快节奏）</button>',
  '<button data-scenario="calendar" data-pace="slow">加载三日期限（慢节奏）</button>',
  '<button data-scenario="legacy">加载旧回合期限</button>',
  '<p>加载后点“继续上次游戏”，再打开右侧“任务”页。</p>',
  '<ul><li>输入 <code>聊一聊</code>：同日对话，期限不减少。</li>',
  '<li>输入 <code>过三天</code>：截止当天仍有效；再输入 <code>过一天</code>：显示超时日期原因。</li>',
  '<li>重载场景，输入 <code>完成并过四天</code>：完成优先，不被超时覆盖。</li>',
  '<li>旧档场景输入 <code>补录期限</code>：获得明确的新日期。</li>',
  '<li>输入 <code>旅途接取</code>：赶路一月后接新任务，仍有完整三天。</li></ul>',
  '<p>按钮只重置本审阅端口的测试角色。<a href="/">打开游戏</a></p>',
  '<script>for(const b of document.querySelectorAll("button"))b.onclick=async()=>{',
  'const r=await fetch("/__fixture?scenario="+b.dataset.scenario+"&pace="+(b.dataset.pace||"fast"));const d=await r.json();',
  'localStorage.setItem("xianxia_config_v1",JSON.stringify(d.config));',
  'localStorage.setItem("xianxia_saves_v1",JSON.stringify({auto:d.save,"1":d.save}));location.href="/";};</script></html>',
].join('\n');

const guardHtml = [
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>法言天地 · 状态校验审阅</title>',
  '<style>body{max-width:840px;margin:48px auto;padding:24px;background:#131719;color:#e6ddc8;font:18px/1.7 system-ui}button{padding:12px;margin:8px;background:#252b29;color:#f5e7c5;border:1px solid #ba9954;cursor:pointer}code,a{color:#e5c17d}</style>',
  '<h1>法言天地 v' + GAME_VERSION + ' · 状态校验审阅</h1>',
  '<p>真实前端 + 固定异常响应，无外部模型请求。当前端口独立测试存档，不影响 localhost:3000 正式存档。</p>',
  '<button data-pace="fast">加载快节奏</button><button data-pace="slow">加载慢节奏</button>',
  '<p>加载后点“继续上次游戏”。可以依次输入：</p><ul>',
  '<li><code>混合校验</code>：set、假境界、非法时间和条目被拦截，合法收入与地点保留。</li>',
  '<li><code>终态改写</code>：已完成的“旧日送信”不能改成失败。</li>',
  '<li><code>冲突更新</code>：商队任务同时完成/失败，保持原状。</li>',
  '<li><code>根数组</code>：整份非法输出拒绝，不推进回合或日期。</li>',
  '<li><code>数值溢出</code>：超大收益拒绝，灵石保持有限。</li>',
  '<li><code>正常增减</code>：支付五枚灵石，确认正常流程仍可用。</li></ul>',
  '<p>边界检查：<code>特殊名称</code> 登记字典特殊名称，事迹“按阶段/按脉络”、图鉴和背包均应正常。</p>',
  '<p>点“导出日志”可在当前浏览器下载审阅记录；模拟服务不会写入桌面。<a href="/">打开游戏</a></p>',
  '<script>for(const b of document.querySelectorAll("button"))b.onclick=async()=>{',
  'const d=await(await fetch("/__fixture?pace="+b.dataset.pace)).json();',
  'localStorage.setItem("xianxia_config_v1",JSON.stringify(d.config));',
  'localStorage.setItem("xianxia_saves_v1",JSON.stringify({auto:d.save,"1":d.save}));location.href="/";};</script></html>',
].join('\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && url.pathname === '/__review') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(guards ? guardHtml : reviewHtml);
    }
    if (req.method === 'GET' && url.pathname === '/__fixture') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(guards ? guardFixture(url.searchParams.get('pace')) : fixture(url.searchParams.get('scenario'), url.searchParams.get('pace'))));
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error('测试请求过大');
      }
      const payload = JSON.parse(body);
      const content = modelContent(payload);
      if (payload.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
        return res.end('data: [DONE]\n\n');
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    }
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [filename, type] = assets.get(url.pathname);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(await readFile(new URL(filename, publicRoot)));
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '本地模拟环境仅提供审阅页面和模拟对话' }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('法言天地 v' + GAME_VERSION + ' 本地模拟审阅：http://127.0.0.1:' + port + '/__review');
  console.log('固定响应、无外部 API 请求、独立测试存档；按 Ctrl+C 停止。');
});
