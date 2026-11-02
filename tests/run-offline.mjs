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
  ['游戏日期任务期限', ['tests/quest-deadlines.test.mjs']],
  ['状态输入与任务终态', ['tests/state-input-guards.test.mjs']],
  ['世界骨架（区域/路程/物价/切片）', ['tests/world-framework.test.mjs']],
  ['人物性格多元（特质库/反重复）', ['tests/personality-diversity.test.mjs']],
  ['势力底细（调查后揭露）', ['tests/hidden-secrets.test.mjs']],
  ['审阅白名单与入口', ['tests/review-assets.test.mjs']],
  ['人物关系四维账本', ['tests/npc-bond.test.mjs']],
  ['人物关系网', ['tests/npc-network.test.mjs']],
  ['关系明暗（档案只写知道的）', ['tests/npc-link-secrecy.test.mjs']],
  ['境界节奏（最少在境年限）', ['tests/realm-pace.test.mjs']],
  ['闭关结算（按时长涨修为）', ['tests/seclusion.test.mjs']],
  ['闭关被打断', ['tests/seclusion-interrupt.test.mjs']],
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
