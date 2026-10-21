import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = new URL('./offline-guard.mjs', import.meta.url).href;
// Keep this allowlist explicit: many root-level test_*.mjs scripts call a model API.
const suites = [
  ['基础规则', ['test.mjs']],
  ['大势时间轴', ['test_era_timeline.mjs']],
  ['防幻觉与撤回', ['test_hallucination.mjs']],
  ['长期记忆', ['test_memory.mjs']],
  ['NPC 性格', ['test_personality.mjs']],
  ['死亡叙事背书', ['test_death.mjs']],
  ['游戏日期任务期限', ['--test', 'tests/quest-deadlines.test.mjs']],
];

let failed = 0;
const started = performance.now();
for (const [name, args] of suites) {
  console.log(`\n[离线测试] ${name}`);
  const result = spawnSync(process.execPath, ['--import', guard, ...args], {
    cwd: path.resolve(root),
    stdio: 'inherit',
    shell: false,
  });
  if (result.error || result.status !== 0) {
    failed += 1;
    console.error(`FAIL suite: ${name}${result.error ? ` (${result.error.message})` : ''}`);
  }
}
console.log(`\n离线测试完成：${suites.length - failed}/${suites.length} 套通过，耗时 ${Math.round(performance.now() - started)} ms。`);
process.exitCode = failed ? 1 : 0;
