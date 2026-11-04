// 实测打包出的 exe：启动并探测 HTTP 服务
import { spawn } from 'node:child_process';

const exePath = process.argv[2] || '法言天地.exe';
const port = process.argv[3] || '3000';
const base = `http://127.0.0.1:${port}`;

const child = spawn(exePath, [], { stdio: 'ignore', env: { ...process.env, PORT: port } });

let settled = false;
const finish = (ok, detail) => {
  if (settled) return;
  settled = true;
  console.log(ok ? '✅ exe 正常运行' : '❌ exe 异常', detail);
  try { child.kill(); } catch {}
  process.exit(ok ? 0 : 1);
};

child.on('exit', (code, signal) => {
  if (!settled) finish(false, `exe 提前退出 code=${code} signal=${signal}`);
});

const deadline = Date.now() + 20000;
async function poll() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
      const text = await res.text();
      if (res.status !== 200) return finish(false, `HTTP ${res.status}`);
      const checks = {
        '游戏标题': text.includes('法言天地'),
        '版本号元素': text.includes('gameVersion'),
        'app.js': false, 'game.js': false,
      };
      for (const f of ['app.js', 'game.js']) {
        const r2 = await fetch(`${base}/${f}`, { signal: AbortSignal.timeout(3000) });
        checks[f] = r2.status === 200;
      }
      return finish(true, JSON.stringify(checks));
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  finish(false, `20 秒内 ${base} 无响应`);
}
poll();
