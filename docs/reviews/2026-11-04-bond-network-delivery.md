# 第五十五轮交付：v1.52.0 关系网（人情债 + 牵连 + 联手认交情）

日期：2026-11-04。分支 `codex/state-input-guards`，从 `8f32d10`（v1.51.0）继续。只做本地提交。

## 一句话

四维账本（债/怨/信/需）以前只有 trust 和 grudge 会动，`debt` 是个死字段。这轮把它做成闭环：**欠人情会被记、会催、能还；仇会顺着关系网牵连；联手也认交情而不是只认名分**。

## 规则

1. **记债**：`addDebt(world, npc, amount, reason)`；护法挡灾自动 +10。流水存 `world.debtLog`（最多 40 条）。
2. **还债**：`repayDebt(world, player, npc)` —— debt 降，trust +一半、grudge 降四分之一；模型侧 `repayDebt: { name }`。
3. **催债**：`settleDebts` 每年一次——debt > 0 且 trust < 80 的人，trust −3、grudge +1（debt ≥ 60 时 +4）；债久怨深会播报"久久没等到你还这份人情"。
4. **牵连**：`propagateBonds` 每季一次——链接双方（师承/亲眷/旧识/盟约）里，一方怨 ≥60 会让另一方 trust −3；一方信 ≥70 会让另一方 trust +1。
5. **联手**：`findCompanion` 先认名分（道侣/挚友/师徒/同门），**认不到就找信任 ≥60 的人**。
6. **界面**：状态面板加「人情债」一行（列出欠谁、欠多少，最多四位）。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/game.js` | 新增 `addDebt` / `repayDebt` / `settleDebts` / `propagateBonds` / `debtSummary`；护法记债；`findCompanion` 认 trust；`advanceTime` 每年催债、每季传导；`repayDebt` 字段与结算；`GAME_VERSION` 1.52.0 |
| `public/app.js` | 状态面板「人情债」；播报债务与牵连事件 |
| `tests/bond-network.test.mjs` | 新套件 11 条 |
| `tests/run-offline.mjs` | 白名单加「关系网」 |
| `README.md` / `package.json` | 1.52.0 |

## 实际测试结果

| 检查 | 结果 |
| --- | --- |
| 新套件 | 11/11 通过 |
| 全量离线 | **55/55 套**通过（新增 1 套） |
| 前端冒烟 | 运行时错误 0 |

## 踩坑

1. **重复导入**：`bondOf` 原本就在 app.js 的 import 列表里，我又加了一次，直接 `SyntaxError: Identifier 'bondOf' has already been declared`——冒烟脚本当场报 `IMPORT FAIL`，去掉重复项。
2. 两处测试预期写错：`clampBond` 是 **0..100**（不是 ±100 的对称区间）；`findCompanion` 先认名分，测试里那位是"道侣"所以先被选中——改成"名分不亲但交情深"才测到新逻辑。

## 未做

- **背叛**：怨气满、信任空的人主动反水（出卖你、临阵脱逃）还没做。
- 人情债**跨人转让**（"我欠你的，你去问他要"）没做。
- NPC 之间的**关系网生成**仍是开局随机；没有"随着剧情自己长出新关系"。
- 界面只在状态页显示债务，图鉴里还没有把四维画出来。
