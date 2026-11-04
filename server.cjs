// ============================================================
//  server.cjs —— 零依赖 Node 后端（CommonJS 版）
//  与 server.mjs 功能完全一致；CJS 是 SEA 单文件 exe 打包
//  唯一支持的入口格式（Node 官方限制）。
//  职责只有两件事：
//   1. 托管 public/ 下的静态前端页面（打包后从 exe 内嵌资源读取）
//   2. POST /api/chat 代理转发到任意 OpenAI 兼容接口
//  （API Key 由玩家在页面里填写，后端只做转发，不落盘）
//  启动：node server.cjs  （打包版：双击 法言天地.exe）
// ============================================================
const http = require('node:http');
const { readFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { extname, join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const os = require('node:os');

const PUBLIC_DIR = resolve(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

// ---------- 日志导出目录：默认桌面（EXPORT_DIR 环境变量可覆盖）----------
function resolveExportDir() {
  const override = process.env.EXPORT_DIR && process.env.EXPORT_DIR.trim();
  if (override) return resolve(override);
  const home = os.homedir();
  const candidates = [
    join(home, 'Desktop'),
    join(home, 'OneDrive', 'Desktop'),
    join(home, 'OneDrive', '桌面'),
    join(home, '桌面'),
  ];
  for (const c of candidates) {
    try { if (existsSync(c)) return c; } catch { /* 继续尝试 */ }
  }
  return home;
}

// ---------- SEA 打包支持：单文件 exe 时从内嵌资源读取 ----------
let sea = null;
try { sea = require('node:sea'); } catch { /* 非 SEA 环境 */ }
function isSea() {
  try { return !!(sea && typeof sea.isSea === 'function' && sea.isSea()); } catch { return false; }
}

async function readStatic(relPath) {
  if (isSea()) {
    const key = 'public' + relPath; // 与 sea-config.json 的 assets 键一致
    try {
      const asset = sea.getAsset(key); // 资源不存在时会抛异常
      return asset ? Buffer.from(asset) : null;
    } catch {
      return null;
    }
  }
  const safePath = resolve(join(PUBLIC_DIR, relPath));
  if (!safePath.startsWith(PUBLIC_DIR)) return '403';
  try { return await readFile(safePath); } catch { return null; }
}

// 自动打开浏览器（打包版默认开；开发时加 --open 参数）
function openBrowser(url) {
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'cmd' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    const args = isWin ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch { /* 忽略打开失败 */ }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10_000_000) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    // ---- 导出本局日志到桌面（玩家反馈意见用）----
    if (req.method === 'POST' && url.pathname === '/api/export-log') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '缺少日志内容' }));
        return;
      }
      const safeName = String(body.filename || '法言天地-日志.txt')
        .replace(/[\\/:*?"<>|\r\n]+/g, '_')
        .slice(0, 120);
      const filePath = join(resolveExportDir(), safeName);
      try {
        await writeFile(filePath, '\ufeff' + content, 'utf8'); // BOM：Windows 记事本友好
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, path: filePath }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '保存失败：' + String(e?.message || e) }));
      }
      return;
    }

    // ---- LLM 代理 ----
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const { baseUrl, apiKey, model, messages, temperature, response_format, stream } = payload;

      if (!baseUrl || !apiKey || !model || !Array.isArray(messages)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '缺少 baseUrl / apiKey / model / messages' }));
        return;
      }

      const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const upstreamBody = {
        model,
        messages,
        temperature: typeof temperature === 'number' ? temperature : 0.8,
      };
      if (response_format) upstreamBody.response_format = response_format;
      if (stream) upstreamBody.stream = true;

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(upstreamBody),
      });

      // 流式：把上游 SSE 原样转发给浏览器（打字机效果）
      if (stream && upstream.ok && upstream.body) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } catch { /* 连接中断，忽略 */ }
        res.end();
        return;
      }

      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
      return;
    }

    // ---- 静态文件 ----
    let pathname = url.pathname;
    if (pathname === '/') pathname = '/index.html';
    const content = await readStatic(pathname);
    if (content === '403') {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }
    if (content) {
      res.writeHead(200, { 'Content-Type': MIME[extname(pathname).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(content);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  法言天地 AI 游戏已启动');
  console.log(`  请在浏览器打开: http://localhost:${PORT}`);
  console.log('  按 Ctrl+C 停止');
  console.log('==============================================');
  if (isSea() || process.argv.includes('--open')) {
    openBrowser(`http://localhost:${PORT}`);
  }
});
