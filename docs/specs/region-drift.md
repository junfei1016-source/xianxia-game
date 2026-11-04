# 地脉盛衰：区域灵气随岁月漂移（v1.37.0）

日期：2026-11-04。本轮只做一件事：让**灵气变成会变的东西**，并让它的变化被玩家与 GM 都看得见。
基线 v1.36.0（灵根补全）。

## 原文依据（先立规矩，再写代码）

| 章 | 原文要点 | 落到本轮的规则 |
| --- | --- | --- |
| 第 220 章 | 灵泉有大有小，"灵脉有枯竭之日"；灵气在天地间"有的地方浓一些、有的地方淡一些" | 灵气有底值（九域表已给 1~6），且会**随时间涨落**；不同地方浓淡不同 |
| 第 172 章 | 灵药"采尽之时"便枯，"千年之期"不是无限取用 | 灵气枯则采集点上限下降，出不了高货 |
| 第 358、363 章 | 修士越来越多，灵石"越采越少"；一地经不起无穷索取 | 枯竭是常态方向之一，且与凶险相连（乱世更甚） |

**不采用**的臆造设定：不写"灵气潮汐周期表"、不写"每百年必有一次大枯"这类原文没有的公式，只做"会涨会落、幅度小、有上限下限"。

## 接口合同

数据层（`public/world.js`）：

```js
QI_LABELS                                   // 1..6 → 枯涸/稀薄/寻常/丰沛/浓郁/灵涌
REGION_DRIFT = { stepDays: 180, witherChance: 0.28, reviveChance: 0.22, dangerFollow: 0.5, maxChronicle: 12 }
regionQi(region, world)      // 实际灵气（漂移值优先，clamp 1..6）
regionDanger(region, world)  // 实际凶险（clamp 1..5）
qiLabel(qi)                  // 中文档位
qiCultMult(qi)               // 修炼倍率：1 + (qi-3)×0.05 → 0.90 .. 1.15
qiPriceMult(qi)              // 对底值的价格系数
driftOf(world, regionId)     // 该地漂移量或 null
```

规则层（`public/game.js`）：

```js
ensureRegionDrift(world)          // 幂等补字段：regionDrift / driftDays / driftSteps / regionChronicle
evolveRegions(world, months)      // 推进并返回本次纪事文本数组；不足 180 天不动作
regionCultMult(world)             // 所在地上灵气对修炼的倍率
```

`advanceTime` 内部调用 `evolveRegions`，并把结果留在 `world.lastDriftEvents`；`app.js` 只负责把它显示成系统消息（不另写判定）。

## 玩法规则（可验收）

1. **尺度**：每 180 天检查一次；一步只动一个区域（`pickDriftRegion` 按漂移步数派生，排除仙界 `taiqing`）。
2. **幅度**：28% 枯一寸、22% 复一寸、50% 不动；到 1 或 6 就停，不越界。
3. **凶险**：灵气动时，有 50% 概率凶险反向动一寸（旺则安、枯则乱），clamp 1..5。
4. **修炼**：`cultivation` 正增量 × `qiCultMult(实际灵气)`——旺地 1.15、寻常 1.00、枯地 0.90。
5. **采集**：`regionNodeCap(region, eraType, 实际灵气)`，枯地出不了高货；末法＋枯涸连凡品都难。
6. **物价**：`priceMultiplier` 只乘**漂移差**（`qiPriceMult(实际)/qiPriceMult(底值)`）——没有漂移时恒为 1，旧价格口径不变（底值差异已由 `REGION_PRICE_MULT` 承担，再乘一遍是重复计价）。
7. **可见**：漂移发生的回合弹一行系统提示；世界切片带当前灵气档位与最近两条本地「地脉纪事」。
8. **确定性**：伪随机由 `(区域 id, 漂移步数)` 派生（FNV-1a），同一存档同一步必得同一结果，测试可复现。
9. **兼容**：旧档没有漂移字段 → `ensureRegionDrift` 补空；读档**只补字段不补漂移**、不判罚；静态九域表永不被改写。

## 文件归属

- 数据与常量：`public/world.js`（主智能体范围）
- 规则与推进：`public/game.js`（A 范围，本轮由主智能体整合）
- 显示一行提示：`public/app.js`（B 范围，本轮只加一处 `appendSystem`）
- 反例与回归：`tests/region-drift.test.mjs` + 加入 `tests/run-offline.mjs` 白名单（C 范围）

## 验收

- `tests/region-drift.test.mjs` 12 条全过：迁移幂等、半年一步、幅度与上下限、静态表不被污染、确定性、修炼/物价/采集三处生效、切片含纪事、旧档与读档不判罚、纪事上限。
- 全量离线 `tests/run-offline.mjs` **43/43 套**通过（新增 1 套），旧套件零改动。

## 本轮不做

- 区域**演化出新的势力/地标**（遗留清单里另一条，需先有势力生灭规则）。
- 灵气影响**突破成功率/天劫**（属"单一突破裁决入口"那条遗留，统一入口后再接）。
- 地图可视化（界面工程项）。
