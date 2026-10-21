// 可选的无界面集成验证；需要本地 Playwright 和已启动的 review:deadlines。
// 新建临时浏览器与空白上下文，只访问本地审阅端口，不连接个人浏览器。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:3100';
const allowedOrigin = new URL(base).origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('仅允许本地审阅服务');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.REVIEW_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIEW_BROWSER_EXECUTABLE } : {}),
});
const checks = [];
const errors = [];
const record = (name) => { checks.push(name); console.log('PASS - ' + name); };
const screenshotDir = new URL('../docs/reviews/', import.meta.url);
await mkdir(screenshotDir, { recursive: true });

async function openScenario(scenario = 'calendar', pace = 'fast') {
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'reduce' });
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== allowedOrigin) {
      errors.push('Blocked non-local request');
      return route.abort();
    }
    return route.continue();
  });
  const response = await context.request.get(base + '/__fixture?scenario=' + scenario + '&pace=' + pace);
  assert.equal(response.status(), 200);
  const { save, config } = await response.json();
  await context.addInitScript(({ save, config }) => {
    if (!localStorage.getItem('review-seeded')) {
      localStorage.setItem('xianxia_config_v1', JSON.stringify(config));
      localStorage.setItem('xianxia_saves_v1', JSON.stringify({ auto: save, '1': save }));
      localStorage.setItem('review-seeded', 'yes');
    }
  }, { save, config });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#landingContinueBtn').click();
  await page.locator('[data-tab="quest"]').click();
  await page.waitForFunction(() => !document.querySelector('#sendBtn').disabled);
  return { context, page };
}

async function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('xianxia_saves_v1')).auto);
}

async function send(page, action) {
  const before = (await saved(page)).world.turn;
  await page.locator('#input').fill(action);
  await page.locator('#sendBtn').click();
  await page.waitForFunction((turn) => {
    const save = JSON.parse(localStorage.getItem('xianxia_saves_v1') || '{}').auto;
    return save && save.world.turn > turn && !document.querySelector('#sendBtn').disabled;
  }, before, { timeout: 15000 });
  return saved(page);
}

try {
  {
    const { context, page } = await openScenario();
    assert.match(await page.locator('#questPanel').innerText(), /1年1月4日.*剩余3天/);
    record('真实前端读档后显示截止日期及剩余天数');
    for (let i = 0; i < 5; i += 1) await send(page, '聊一聊');
    let state = await saved(page);
    assert.deepEqual(state.world.date, { year: 1, month: 1, day: 1 });
    assert.equal(state.world.quests.find((q) => q.title === '护送商队').status, 'active');
    record('快节奏：连续5次真实发送，同日任务保持有效');
    state = await send(page, '过三天');
    assert.equal(state.world.quests.find((q) => q.title === '护送商队').status, 'active');
    assert.match(await page.locator('#questPanel').innerText(), /今日截止/);
    record('截止当天任务页仍显示进行中');
    state = await send(page, '过一天');
    const quest = state.world.quests.find((q) => q.title === '护送商队');
    assert.equal(quest.status, 'failed');
    assert.match(quest.failureReason, /1年1月4日.*1年1月5日/);
    assert.match(await page.locator('#noticeText').textContent(), /1年1月4日/);
    record('跨过截止日后真实回合结算失败并解释日期原因');
    await page.locator('#noticeCloseBtn').click();
    await page.locator('.quest-ended summary').click();
    await page.screenshot({ path: fileURLToPath(new URL('2026-10-21-deadline-expiry.png', screenshotDir)), fullPage: true });
    await context.close();
  }
  {
    const { context, page } = await openScenario();
    const state = await send(page, '完成并过四天');
    assert.equal(state.world.quests.find((q) => q.title === '护送商队').status, 'completed');
    assert.equal(state.world.events.some((event) => event.title.includes('超时')), false);
    record('真实前端同回合完成优先，未生成超时事迹');
    await context.close();
  }
  {
    const { context, page } = await openScenario('legacy');
    assert.match(await page.locator('#questPanel').innerText(), /旧期限待确认/);
    let state = await send(page, '聊一聊');
    assert.equal(state.world.quests.find((q) => q.title === '护送商队').status, 'active');
    state = await send(page, '补录期限');
    assert.deepEqual(state.world.quests.find((q) => q.title === '护送商队').deadlineDate, { year: 1, month: 1, day: 4 });
    assert.match(await page.locator('#questPanel').innerText(), /剩余3天/);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#landingContinueBtn').click();
    await page.locator('[data-tab="quest"]').click();
    assert.match(await page.locator('#questPanel').innerText(), /1年1月4日/);
    record('旧档待确认、补录明确期限、自动存档再读入全流程通过');
    await page.screenshot({ path: fileURLToPath(new URL('2026-10-21-deadline-calendar.png', screenshotDir)), fullPage: true });
    await context.close();
  }
  {
    const { context, page } = await openScenario('calendar', 'slow');
    let state = await send(page, '聊一聊');
    assert.deepEqual(state.world.date, { year: 1, month: 1, day: 1 });
    state = await send(page, '旅途接取');
    const quest = state.world.quests.find((q) => q.title === '抵达后新委托');
    assert.deepEqual(state.world.date, { year: 1, month: 2, day: 1 });
    assert.deepEqual(quest.deadlineDate, { year: 1, month: 2, day: 4 });
    record('慢节奏：SSE叙事与提取两段式、旅途末接取期限正确');
    await context.close();
  }
  assert.deepEqual(errors, [], '浏览器脚本错误或非本地请求');
  record('浏览器无脚本错误、未发出非本地请求');
  console.log('无界面浏览器集成验证：' + checks.length + '/' + checks.length + ' 通过。');
} finally {
  await browser.close();
}
