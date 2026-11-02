import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const publicDir = new URL('../public/', import.meta.url);

// 审阅页是白名单静态服务：public 里新增模块必须同步进白名单，否则免 Key 试玩会白屏。
test('审阅白名单覆盖 public 的全部模块依赖', () => {
  const files = readdirSync(publicDir).filter((f) => f.endsWith('.js'));
  const review = readFileSync(new URL('scripts/review-deadlines.mjs', root), 'utf8');
  const missing = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, publicDir), 'utf8');
    for (const m of text.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
      const dep = m[1];
      if (!files.includes(dep)) {
        missing.push(`${file} -> ${dep}（文件不存在）`);
        continue;
      }
      if (!review.includes(`'/${dep}'`)) missing.push(`${file} -> ${dep}（审阅白名单缺）`);
    }
  }
  assert.deepEqual(missing, [], '缺少白名单条目会导致 404 与页面白屏');
});

test('index.html 只加载 app.js，入口模块文件名没变', () => {
  const html = readFileSync(new URL('index.html', publicDir), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['app.js']);
});
