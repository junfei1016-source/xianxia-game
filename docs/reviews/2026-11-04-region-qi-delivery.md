# 第三十八轮交付（修正版）：v1.37.1 地脉枯荣

日期：2026-11-04（Asia/Shanghai）。分支 `codex/state-input-guards`，从 `034c3e2`（v1.36.0）继续。
只做本地提交，不推送 GitHub。

## 先说纠错

v1.37.0 的第一版做成了"灵气每半年随机涨落 ±1"，并引「第 220 章：灵脉有枯竭之日」当依据。
**逐字核对原文后确认这条引文引反了**：第 220 章写的是灵脉成形后"灵气循环不绝，**不会有枯竭之日**"。
另外引的"第 358、363 章：灵石越采越少"也是误引——那两章讲的是无边海慕兰人与传送阵，与灵气无关。

支持"会枯"的是第 172 章：禁地"频繁的开启"让灵气大量流失、灵药逐年稀少，圈封五六十年才恢复密度，
真要养回来"必须把圈封的时间拖延到足足千年"。

所以本轮把机制整个换掉：**灵气不会自己枯，只会被采枯；不采才回补，且回补极慢。**

## 玩法规则

1. 每次成功采集给该区域加压：凡品 4 / 灵品 8 / 玄品 14 / 仙品 22 / 神品 30。
2. 不采的月份压力每月 −2；压力攒满 30 掉一寸灵气（最低 1）。
3. 灵气低于底值、压力归零、连续 24 个月无人采，回升一寸；**上限永远是表里的底值**。
4. 灵气决定修炼倍率（每差一寸 0.05，被压到底不低于 0.70）、采集点上限、本地物价（只乘枯荣差）。
5. 掉档与回补都写「地脉纪事」，当回合弹提示；世界切片带灵气档位与本地纪事。
6. 旧档由 `ensureRegionQi` 幂等补空，读档只补字段、不补枯荣、不判罚；静态九域表不动。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/world.js` | 删掉随机漂移（`REGION_DRIFT`/`driftOf`/`regionDanger`），改为枯荣数据：`REGION_QI_RULES`、`regionQiState`、`regionQi`（上限=底值）；`buildSlice` 用当前灵气 + 本地 `regionQiLog`；`WORLD_VERSION` 1.3.1 |
| `public/game.js` | 删掉 `ensureRegionDrift`/`evolveRegions`/确定性掷点，改为 `ensureRegionQi`、`qiStateFor`、`noteRegionHarvest`、`evolveRegionQi`、`regionCultMult`；`advanceTime` 末尾按月推进；`gatherMaterials` 采到货时加压；`GAME_VERSION` 1.37.1 |
| `public/app.js` | 回合内显示 `world.lastRegionQiEvents` |
| `tests/region-qi.test.mjs` | 新套件 12 条（替换掉旧的 `region-drift.test.mjs`） |
| `tests/run-offline.mjs` | 白名单条目改为「地脉枯荣（采枯灵气与封山回补）」 |
| `README.md` / `AGENTS.md` / `docs/specs/region-qi.md` | 版本说明、第五轮边界、以原文为准的设计记录（同时作废 `region-drift.md`） |
| `package.json` | 1.37.1（与 `GAME_VERSION` 同步，无 BOM） |

## 实际测试结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新套件 | `node tests/region-qi.test.mjs` | 12/12 通过 |
| 全量离线 | `node tests/run-offline.mjs` | **43/43 套**通过，旧 42 套零改动 |
| 语法 | `node --check` game/app/world/server | 全通过 |

过程中自己踩到的两个坑（都记下来）：

- **PowerShell 把 JS 模板吃掉了**：用 `node -e` 改版本号时把 `'$1'+'1.37.1'` 写进 PS 双引号字符串，`$1` 被 PowerShell 当变量展开，`game.js` 被写成 `export const 1.37.1;`。已改回 `export const GAME_VERSION = '1.37.1';`，语法检查通过。教训：改代码别用 PS 双引号里嵌 JS 替换串，走临时 `.cjs` 文件。
- **BOM 老问题**：`Set-Content -Encoding UTF8` 会写 BOM，`version-sync` 测试 `JSON.parse` 会炸；这次改用 node 重写（前 3 字节 `123,13,10`）。

## 未运行 / 未验证

- 真实模型联调（要 Key、会计费）：未跑，不声称叙事质量。
- 无界面浏览器回归：本轮只加一行系统消息，未单开 Playwright。
- EXE 打包：仍是 v1.1.x，与本轮无关。

## 试玩怎么看

连续在同一片地方采药（多次"采药 30 日"），系统会先报「灵脉被采薄了」，采集点上限随之下降；
换去别处，或在该地什么都不采、闭关二三十年，才会看到「封山日久，灵脉缓过气来」。

## 仍需用户决定

1. 数值手感：加压/自消/回补三个参数（`REGION_QI_RULES`）现在偏温和，要不要更"惩罚重采"。
2. 灵气是否接进突破成功率（属统一突破裁决入口那条遗留）。
3. 下一轮：区域演化出势力/地标、人情债 `world.debts`、砍价与法宝材料价目、拍卖分大小拍、地图可视化。
