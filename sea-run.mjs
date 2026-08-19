// Run an injected exe and probe a localhost port to verify the SEA main executed.
import { spawn } from 'node:child_process';

const [, , exePath, port = '3456'] = process.argv;
if (!exePath) {
  console.error('usage: node sea-run.mjs <exe> [port]');
  process.exit(2);
}

const url = `http://127.0.0.1:${port}`;
const child = spawn(exePath, [], { stdio: 'ignore' });

let settled = false;
const finish = async (ok, detail) => {
  if (settled) return;
  settled = true;
  console.log(ok ? `OK: SEA main responded on ${url}` : `FAIL: ${detail}`);
  try { child.kill(); } catch {}
  process.exit(ok ? 0 : 1);
};

const deadline = Date.now() + 12000;
async function poll() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      const text = await res.text();
      return finish(true, text.slice(0, 80));
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  finish(false, `no response on ${url} within 12s`);
}

child.on('exit', (code, signal) => {
  if (!settled) finish(false, `exe exited early: code=${code} signal=${signal}`);
});

poll();
