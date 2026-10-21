// 真实前端、隔离存档、固定异常响应；不连接用户浏览器或外部模型。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:3103';
const origin = new URL(base).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('只允许本地审阅服务');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.REVIEW_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIEW_BROWSER_EXECUTABLE } : {}),
});
const checks = [];
const errors = [];
const record = (name) => { checks.push(name); console.log('PASS - ' + name); };
const outputDir = new URL('../docs/reviews/', import.meta.url);
await mkdir(outputDir, { recursive: true });

async function state(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('xianxia_saves_v1')).auto);
}

async function openScenario(pace) {
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'reduce', acceptDownloads: true });
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      errors.push('Blocked non-local request');
      return route.abort();
    }
    return route.continue();
  });
  const response = await context.request.get(base + '/__fixture?pace=' + pace);
  assert.equal(response.status(), 200);
  const seed = await response.json();
  await context.addInitScript(({ save, config }) => {
    if (!localStorage.getItem('guard-review-seeded')) {
      localStorage.setItem('xianxia_config_v1', JSON.stringify(config));
      localStorage.setItem('xianxia_saves_v1', JSON.stringify({ auto: save, '1': save }));
      localStorage.setItem('guard-review-seeded', 'yes');
    }
  }, seed);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#landingContinueBtn').click();
  await page.waitForFunction(() => !document.querySelector('#sendBtn').disabled);
  return { context, page };
}

async function send(page, action, rejectedRoot = false) {
  const before = await state(page);
  const systemCount = before.log.length;
  await page.locator('#input').fill(action);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(({ turn, logCount, root }) => {
    const save = JSON.parse(localStorage.getItem('xianxia_saves_v1') || '{}').auto;
    return save && !document.querySelector('#sendBtn').disabled && (root
      ? save.log.length > logCount && save.world.validationLog?.at(-1)?.issues?.some((issue) => issue.code === 'invalid_root')
      : save.world.turn > turn);
  }, { turn: before.world.turn, logCount: systemCount, root: rejectedRoot }, { timeout: 15000 });
  return state(page);
}

try {
  for (const pace of ['fast', 'slow']) {
    const { context, page } = await openScenario(pace);
    const initial = await state(page);
    let current = await send(page, '混合校验');
    assert.equal(current.player.hp, initial.player.hp);
    assert.ok(current.player.spiritStones > initial.player.spiritStones);
    assert.equal(current.player.realm, initial.player.realm);
    assert.deepEqual(current.world.goal, initial.world.goal);
    assert.deepEqual(current.world.date, initial.world.date);
    assert.equal(current.world.flags.deathByRisk, undefined);
    assert.equal(current.world.flags.hasSect, true);
    assert.equal(current.world.npcs.length, initial.world.npcs.length);
    assert.ok(current.world.locations.some((entry) => entry.name === '校验坊市'));
    assert.equal(current.world.inventory.some((entry) => entry.name === '不应出现的丹药'), false);
    assert.ok(current.world.validationLog.length > 0);
    assert.match(await page.locator('#chatScroll').innerText(), /状态校验/);
    assert.doesNotMatch(await page.locator('#chatScroll').innerText(), /✦ 境界突破|【目标】伪造的目标成功/);
    assert.equal(await page.locator('#breakFlash').evaluate((el) => el.classList.contains('on')), false);
    const diagnostics = JSON.stringify(current.world.validationLog);
    assert.doesNotMatch(diagnostics, /diagnostic-sensitive-marker|do-not-log-input-values|review-only-placeholder/);
    record(pace + '：混合提案逐项拦截，合法状态保留，真实面板与存档不误报成功');

    current = await send(page, '终态改写');
    assert.equal(current.world.quests.find((quest) => quest.title === '旧日送信').status, 'completed');
    assert.equal(current.world.events.filter((event) => event.subject === '旧日送信').length, 1);
    assert.ok(current.world.validationLog.at(-1).issues.some((issue) => issue.code === 'terminal_quest'));
    record(pace + '：完成任务不能变失败，也不生成矛盾事迹');

    current = await send(page, '冲突更新');
    assert.equal(current.world.quests.find((quest) => quest.title === '护送商队').status, 'active');
    assert.ok(current.world.validationLog.at(-1).issues.some((issue) => issue.code === 'conflicting_quest_updates'));
    record(pace + '：同批完成/失败冲突保持原任务状态');

    const beforeRoot = current;
    current = await send(page, '根数组', true);
    assert.equal(current.world.turn, beforeRoot.world.turn);
    assert.deepEqual(current.world.date, beforeRoot.world.date);
    assert.deepEqual(current.player, beforeRoot.player);
    assert.deepEqual(current.world.recentActions, beforeRoot.world.recentActions);
    assert.equal(current.world.farmStreak, beforeRoot.world.farmStreak);
    assert.equal(current.world.memory, beforeRoot.world.memory);
    record(pace + '：根数组拒绝，快模式兜底/慢模式提取均不结算回合和日期');

    const beforeOverflow = current.player.spiritStones;
    current = await send(page, '数值溢出');
    assert.equal(current.player.spiritStones, beforeOverflow);
    assert.ok(Number.isFinite(current.player.spiritStones));
    assert.ok(current.world.validationLog.at(-1).issues.some((issue) => issue.code === 'numeric_overflow'));
    record(pace + '：倍率/加法后溢出被拒绝，存档仍为有效有限数值');

    current = await send(page, '正常增减');
    assert.equal(current.player.spiritStones, beforeOverflow - 5);
    record(pace + '：正常支付继续可用');

    current = await send(page, '特殊名称');
    assert.ok(current.world.events.some((event) => event.subject === 'toString' && event.title === '到访'));
    assert.ok(current.world.inventory.some((item) => item.name === 'hasOwnProperty' && item.qty === 1));
    assert.match(await page.locator('#chatScroll').innerText(), /获得「hasOwnProperty」×1/);
    await page.locator('[data-tab="chronicle"]').click();
    assert.match(await page.locator('#chroniclePanel').textContent(), /toString/);
    await page.locator('#chroniclePanel [data-view="thread"]').click();
    assert.match(await page.locator('#chroniclePanel').textContent(), /toString/);
    await page.locator('[data-tab="codex"]').click();
    assert.match(await page.locator('#codexPanel').textContent(), /toString/);
    await page.locator('[data-tab="bag"]').click();
    assert.match(await page.locator('#bagPanel').textContent(), /hasOwnProperty/);
    record(pace + '：特殊名称在事迹两种视图、图鉴、背包及获得通知中安全显示');

    if (pace === 'fast') {
      await page.locator('[data-tab="quest"]').click();
      await page.locator('.quest-ended summary').click();
      await page.screenshot({ path: fileURLToPath(new URL('2026-10-21-state-guards.png', outputDir)), fullPage: true });
      const downloadWait = page.waitForEvent('download');
      await page.locator('#exportLogBtn').click();
      const download = await downloadWait;
      const logPath = fileURLToPath(new URL('2026-10-21-state-guards-game-log.txt', outputDir));
      await download.saveAs(logPath);
      const exported = await readFile(logPath, 'utf8');
      assert.match(exported, /状态校验/);
      assert.match(exported, /forbidden_set/);
      assert.match(exported, /terminal_quest/);
      assert.doesNotMatch(exported, /diagnostic-sensitive-marker|do-not-log-input-values|review-only-placeholder/);
      record('真实“导出日志”浏览器下载包含有限诊断，未包含原始异常字段/值或配置Key');
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#landingContinueBtn').click();
    const reloaded = await state(page);
    assert.deepEqual(reloaded.player, current.player);
    assert.equal(reloaded.world.quests.find((quest) => quest.title === '旧日送信').status, 'completed');
    record(pace + '：自动存档重新加载后保留安全数值和任务终态');
    await context.close();
  }
  assert.deepEqual(errors, []);
  record('无浏览器脚本错误、无非本地网络请求');
  console.log('状态校验无界面浏览器验证：' + checks.length + '/' + checks.length + ' 通过。');
} finally {
  await browser.close();
}
