# 第三轮交付：世界骨架（v1.2.0）

日期：2026-11-02 ｜ 范围：把「世界框架」从独立文档接进游戏规则层

## 这轮做了什么

前两轮解决了「状态输入」的一致性（模型只能提增量、终态不能改写），但世界本身仍是每回合现编的：
距离、物价、势力地位都没有事实源。这轮补上这一层。

**核心决定：固定骨架 + 随机开局。** 不采用「每次开档生成一个新世界」，也不采用「所有玩家同一个开局」。

- 骨架固定：五个凡界区域、十二个本地势力、十一组关系（含一条暗桩）。
- 开局随机：玩家落在青芜/落霞/大衍/赤沙之一（权重 6:2:2:1），寒渊海不作为开局。
- 剧情自由：人物、事件、机遇、宗门内斗仍由模型生成，但**引用**骨架，不再另造距离与物价。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/world.js`（新增） | 区域/势力/关系表；`travelDays`（表查 + BFS 兜底）、`priceOf`/`priceMultiplier`、`pickStarter`、`ensureWorldGeo`（幂等迁移）、`moveToRegion`、`buildSlice`、`startingFactions` |
| `public/game.js` | 引入 world.js；`buildWorldContext(world, player)` 增加 `region` 与 `worldSlice`；`buildGMBase` 注入世界切片；快/慢两套提取器 schema 增加 `travelTo`；`validateStateOutput` 接受 `travelTo`；`applyStateUpdates` 用路程表覆盖 `timeMonths` 并切换区域；`GAME_VERSION` → 1.2.0 |
| `public/app.js` | 开局用世界表定区域与本地势力；读档/回退档幂等补 `geo`；状态栏显示当前区域 |
| `tests/world-framework.test.mjs`（新增） | 15 条：数据自洽、路程对称、物价带、开局权重、迁移幂等、行路结算、切片注入、提示词内容 |
| `tests/run-offline.mjs` | 注册第 9 套；`--test` 改成直接执行（沙箱内 `node --test` 子进程会被 EPERM，直接跑等价） |
| `package.json` / `README.md` | 版本 1.2.0、新增 1.2.0 说明与 `world.js` 职责行 |

## 关键接口

```js
// 每回合注入（game.js 内部）
buildSlice(player, world) → "【世界切片】区域：青芜国（…）灵气2·危险1。…【铁律】…"

// 行路结算：提取器输出 travelTo 时
applyStateUpdates(player, world, { travelTo: '落霞坊', timeMonths: 3 })
  → world.geo.regionId = 'luoxia'，out.timeMonths = 0.1（3 日），返回「【行路】青芜国 → 落霞坊（3 日，约 0.10 月）」
```

## 测试日志

本机没有系统 Node，用 DSH 自带 node（`...\dependencies\node\bin\node.exe`）直接执行：

```
node tests/run-offline.mjs
[离线测试] 基础规则 … 通过
[离线测试] 大势时间轴 … 通过
[离线测试] 防幻觉与撤回 … 通过
[离线测试] 长期记忆 … 通过
[离线测试] NPC 性格 … 通过
[离线测试] 死亡叙事背书 … 通过
[离线测试] 游戏日期任务期限 … 通过
[离线测试] 状态输入与任务终态 … 通过
[离线测试] 世界骨架（区域/路程/物价/切片） … 通过
离线测试完成：9/9 套通过
```

另：`node --check public/game.js`、`public/app.js`、`public/world.js` 均通过。

## 试玩步骤

1. `npm.cmd start`（有 Node 的机器）或 `& <node> server.mjs`，打开 <http://localhost:3000/>。
2. 填接口与 Key，开新游戏。开场文本会落在某个区域（大概率青芜国），状态栏显示「进行中 · 凡人 · 青芜国」。
3. 输入「去落霞坊」，观察系统提示「【行路】青芜国 → 落霞坊（3 日，约 0.10 月）」，日期推进 3 天。
4. 输入「买一颗疗伤丹」，物价倍率来自切片（落霞 0.9×大势），可对照 `world.js` 的 `priceOf`。
5. 用旧档继续：读档不应报错，状态栏会补出区域名。

## 遗留与风险

- 模型不一定每回合都填 `travelTo`：不填就不会移动，也不会被误判；这是「宁可不动，不可乱动」的取舍。
- 跨界面（灵界/仙界）只有结构，没有接飞升切换；凡界到寒渊海可走，界外不行（`travelDays` 返回 null）。
- 物价目前只进了提示词与切片，**还没有交易结算**（游戏没有独立交易系统，买卖仍写在叙事里）。下一步若要堵死价格套利，需要在物品获得时按 `priceOf` 校验叙事给出的价格。
- 势力关系表存在 `world.js` 里，但还没写进存档快照给模型看全图；目前只靠切片里的「表里不一」标记。
- 界面没有地图，区域切换只体现在状态栏与系统提示。
