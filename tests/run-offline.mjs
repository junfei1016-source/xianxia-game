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
  ['护法与闭关', ['tests/seclusion-guardians.test.mjs']],
  ['护法受伤与养伤', ['tests/guardian-injury.test.mjs']],
  ['丹药（抗药性/跨境失效/以丹养伤）', ['tests/pills.test.mjs']],
  ['丹方与炼丹（上古/残缺/交易）', ['tests/pills-recipes.test.mjs']],
  ['交易结算（丹药/丹方）', ['tests/trade.test.mjs']],
  ['黑市与拍卖', ['tests/market-auction.test.mjs']],
  ['拍卖会期（每年三月/九月）', ['tests/auction-schedule.test.mjs']],
  ['完整地图（九域二十家）', ['tests/world-map-full.test.mjs']],
  ['区域生成标准（玩家开新域）', ['tests/region-generation.test.mjs']],
  ['法宝（阶位/驱动/本命）', ['tests/treasures.test.mjs']],
  ['材料（年份/五行/产地/毒物）', ['tests/materials.test.mjs']],
  ['采集与五行炼丹', ['tests/gather-elements.test.mjs']],
  ['采集点与炼器', ['tests/nodes-forge.test.mjs']],
  ['采集点稀有度', ['tests/node-rarity.test.mjs']],
  ['采集点守护与大势', ['tests/node-era-guard.test.mjs']],
  ['守护缠斗与灵田经营', ['tests/plots-guard.test.mjs']],
  ['阵法（九级/布阵/效果）', ['tests/formations.test.mjs']],
  ['阵法地脉·加固·破阵', ['tests/formation-leyline.test.mjs']],
  ['四艺与符箓', ['tests/craft.test.mjs']],
  ['四艺瓶颈·师承·符阵', ['tests/craft-advanced.test.mjs']],
  ['功法（品阶/层次/主修）', ['tests/techniques.test.mjs']],
  ['功法框架（品阶+特定要求）', ['tests/technique-framework.test.mjs']],
  ['灵根（天根/真灵根/伪灵根）', ['tests/roots.test.mjs']],
  ['地脉枯荣（采枯灵气与封山回补）', ['tests/region-qi.test.mjs']],
  ['境界阶梯（炼虚/顺序/各表覆盖）', ['tests/realm-ladder.test.mjs']],
  ['天时与传闻（征兆分层/真假参半）', ['tests/sky-rumors.test.mjs']],
  ['开局定图（地图钉死/不许开新域）', ['tests/world-map-lock.test.mjs']],
  ['地图按原著（越国/元武/天罗/乱星海）', ['tests/world-map-canon.test.mjs']],
  ['地理层级与路网（陆路/海路/古传送阵）', ['tests/travel-network.test.mjs']],
  ['版本一致性', ['tests/version-sync.test.mjs']],
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
