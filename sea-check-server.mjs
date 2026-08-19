// Probe the packaged exe's HTTP server: verify all embedded assets are served.
import { spawn } from 'node:child_process';

const [, , exePath, port = '3000'] = process.argv;
if (!exePath) {
  console.error('usage: node sea-check-server.mjs <exe> [port]');
  process.exit(2);
}

const base = `http://127.0.0.1:${port}`;
const paths = ['/', '/style.css', '/app.js', '/game.js', '/icon.svg'];
const childEnv = process.env.TEST_PORT ? { ...process.env, PORT: process.env.TEST_PORT } : undefined;
const child = spawn(exePath, [], { stdio: 'ignore', env: childEnv });

let settled = false;
const finish = (ok, detail) => {
  if (settled) return;
  settled = true;
  console.log(ok ? 'ALL OK' : 'FAIL', detail);
  try { child.kill(); } catch {}
  process.exit(ok ? 0 : 1);
};

const deadline = Date.now() + 15000;
async function poll() {
  while (Date.now() < deadline) {
    try {
      const results = [];
      for (const p of paths) {
        const res = await fetch(base + p, { signal: AbortSignal.timeout(2000) });
        const text = await res.text();
        results.push(`${p} -> ${res.status} (${text.length}B)`);
        if (res.status !== 200) return finish(false, results.join(' | '));
      }
      const idx = results[0];
      const okAll = paths.length === results.length;
      // phase 2: API proxy validation + 404
      let phase2 = '';
      const bad = await fetch(base + '/api/chat', {
        method: 'POST', body: '{}', signal: AbortSignal.timeout(3000),
        headers: { 'Content-Type': 'application/json' },
      });
      phase2 += `POST /api/chat {} -> ${bad.status} `;
      const nf = await fetch(base + '/nope', { signal: AbortSignal.timeout(3000) });
      phase2 += `| GET /nope -> ${nf.status}`;
      if (bad.status !== 400 || nf.status !== 404) return finish(false, results.join(' | ') + ' | ' + phase2);
      return finish(okAll, results.join(' | ') + ' | ' + phase2);
    } catch (e) {
      // server not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  finish(false, `no response on ${base} within 15s`);
}

child.on('exit', (code, signal) => {
  if (!settled) finish(false, `exe exited early: code=${code} signal=${signal}`);
});

poll();
