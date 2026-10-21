// 启动独立端口上的真实 server.mjs，验证静态资源与请求校验，不请求模型。
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GAME_VERSION } from '../public/game.js';

const port = Number(process.env.SMOKE_PORT || 3110);
const root = fileURLToPath(new URL('../', import.meta.url));
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
const exit = new Promise((resolve) => {
  child.once('error', (error) => resolve(error));
  child.once('exit', (code) => resolve(code));
});
const checks = [];
const check = (name) => { checks.push(name); console.log('PASS - ' + name); };

try {
  const deadline = Date.now() + 10000;
  while (!output.includes('请在浏览器打开')) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error('服务未成功启动：' + output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const [resource, type, marker] of [
    ['/', 'text/html', '法言天地'],
    ['/app.js', 'javascript', 'questDeadlineInfo'],
    ['/game.js', 'javascript', "GAME_VERSION = '" + GAME_VERSION + "'"],
    ['/style.css', 'text/css', '.quest'],
    ['/icon.svg', 'image/svg+xml', '<svg'],
  ]) {
    const response = await fetch(base + resource);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').includes(type));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok((await response.text()).includes(marker));
    check('真实服务 ' + resource + ' 200、内容与缓存策略正确');
  }
  assert.equal((await fetch(base + '/missing-review-resource')).status, 404);
  check('不存在的静态资源返回404');
  const badRequest = await fetch(base + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(badRequest.status, 400);
  assert.ok((await badRequest.json()).error.includes('缺少'));
  check('空模型请求返回400，不转发上游');
  console.log('真实HTTP服务验证：' + checks.length + '/' + checks.length + ' 通过。');
} finally {
  child.kill();
  await exit;
}
