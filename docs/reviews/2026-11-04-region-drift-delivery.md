# 第三十八轮交付：v1.37.0 地脉盛衰

日期：2026-11-04（Asia/Shanghai）。分支 `codex/state-input-guards`，从 `034c3e2`（v1.36.0）继续。
本轮只做本地提交，不推送 GitHub（等用户审阅）。

## 一句话

灵气以前是写在九域表里的常数，现在它会随岁月涨落：旺地修炼快、出好货、物价松；枯地反过来，还会变凶险。漂移量存在存档里，静态表不动，旧档照读。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/world.js` | 新增地脉数据与派生：`QI_LABELS`、`REGION_DRIFT`、`qiLabel`、`driftOf`、`regionQi`、`regionDanger`、`qiCultMult`、`qiPriceMult`；`priceMultiplier` 接入漂移差；`buildSlice` 用实际灵气/凶险 + 一行「地脉」纪事；`WORLD_VERSION` 1.2.0 → 1.3.0 |
| `public/game.js` | 新增 `ensureRegionDrift`（幂等迁移）、`evolveRegions`（半年一步、确定性掷点、纪事上限）、`regionCultMult`；`advanceTime` 末尾推进地脉；`applyStateUpdates` 的修为倍率链加入所在地灵气；`regionNodeCap`/`pickNodeRarity`/`fillNode` 改为按实际灵气算上限；`GAME_VERSION` 1.36.0 → 1.37.0 |
| `public/app.js` | 回合内把 `world.lastDriftEvents` 显示为系统消息（一行一条） |
| `tests/region-drift.test.mjs` | 新增 12 条用例 |
| `tests/run-offline.mjs` | 白名单加入「地脉盛衰」一套 |
| `README.md` / `AGENTS.md` / `docs/specs/region-drift.md` | 1.37.0 说明、第五轮边界、设计与原文依据 |
| `package.json` | 1.37.0（与 `GAME_VERSION` 同步） |

## 玩法规则（接口见 spec）

1. 每 180 天一步，一步只动一个区域；28% 枯、22% 复、50% 不动；灵气 1~6、凶险 1~5 为界。
2. 灵气动时五成概率带动凶险反向动（旺则安、枯则乱）。
3. 修炼正增量 × 灵气系数（0.90 / 1.00 / 1.15 三档代表枯、寻常、灵涌）。
4. 采集点上限按实际灵气算；物价只乘漂移差（无漂移时价格一分不变）。
5. 漂移发生的回合弹系统提示；切片带灵气档位与最近两条本地纪事，GM 叙事可直接引用。
6. 确定性：伪随机由 `(区域 id, 步数)` 派生，同一存档可复现；读档只补字段不补漂移。

## 实际测试结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新套件 | `node tests/region-drift.test.mjs` | 12/12 通过 |
| 全量离线 | `node tests/run-offline.mjs` | **43/43 套**通过（新增 1 套），旧 42 套零改动 |
| 语法 | `node --check public/game.js` / `app.js` / `world.js` | 全通过 |

过程中修掉的两处真问题：

- **物价重复计价**：第一版按"实际灵气绝对系数"乘物价，青芜（底值 2）当场涨了 4%，把交易/黑市/拍卖四套旧测试打红。改为**只乘漂移差**后旧口径复原——底值差异本来就由 `REGION_PRICE_MULT` 承担。
- **`package.json` 被写成带 BOM**：`Set-Content -Encoding UTF8` 在 PS5.1 会加 BOM，`version-sync` 测试 `JSON.parse` 直接炸。已用 node 重写为无 BOM（前 3 字节 `123,13,10`）。

## 未运行 / 未验证

- 真实模型联调（要用户自己的 Key，会产生费用）：本轮没跑，不声称叙事质量。
- 无界面浏览器验证：本轮没有新增界面元素（只有一行系统消息），未单开 Playwright 回归；`node --check` 与离线套件已覆盖语法与规则。
- EXE 打包：仍停留在 v1.1.x，与本轮无关。

## 试玩怎么看

```powershell
# 起服务（本机无系统 Node/npm，直呼 DSH 自带运行时）
& "C:\Users\fym10\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" server.mjs
```

进游戏后连续闭关若干年（如"闭关二十年"），留意系统消息里的「🌏 ……地脉复苏/灵脉渐枯」；右侧状态页看不出差别，但同样的"闭关一月"在旺地与枯地获得的修为不同，采集点上也会先出不来高货。

## 仍需用户决定

1. 漂移**幅度与频率**是否合适（现在半年一步、±1 寸）？想更"活"可以改 `REGION_DRIFT.stepDays`。
2. 要不要把灵气接进**突破成功率**？这属于"单一突破裁决入口"那条遗留，建议和按钮/模型双轨一起做。
3. 下一步从遗留清单挑哪条：区域演化出势力/地标、人情债 `world.debts`、砍价与法宝材料价目、拍卖按区域分大小拍、地图可视化。
