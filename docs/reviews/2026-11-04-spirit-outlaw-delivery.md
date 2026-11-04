# 第五十轮交付：v1.47.0 黑户在灵界的日子

日期：2026-11-04。分支 `codex/state-input-guards`，从 `8ebb44a`（v1.46.0）继续。只做本地提交。

## 一句话

偷渡过去不再只是一个"没仙籍"的标记：**每年要一粒灭尘丹，否则三百年后两色雷劫必死**；平时还会被天渊卫盘查；想洗白得在灵界结盟、花钱办**身份牌**。

## 原文依据

| 章 | 原文 | 落成 |
| --- | --- | --- |
| 1315 | "既没有在飞灵台出现，也没有去天渊城服役" | 没走正途=黑户，天渊卫会找上门 |
| 1315/1316 | "你没有服过灭尘丹，洗去下界的异界气息，三百年一次的小天劫就会是**两色雷劫**……就算你再神通惊人，也绝挨不过去的" | 每年一粒灭尘丹；不服用则累积，满三百年必死 |
| 1316 | "只有**每年服下一粒灭尘丹**，才可让你气息和我们灵界融为一体"；"在我们天渊城，每年都会给飞升修士发一粒" | 在册者有供给，黑户没有 |
| 1316 | 天渊卫"每一个都拥有**自由穿梭各地区域，不受限制的权利**" | 黑户每年 25% 被盘查，罚款并上通缉册 |
| 1583 | "韩道友并非我们天云人，给他准备一个最高级别的**自由身份牌**。我可以做起**担保人**" | 身份牌洗白：须有本地势力结盟 + 1000 灵石 |

## 规则

1. **年度结算**（`settleOutlaw`，随 `advanceTime` 推进）：
   - 背包里有灭尘丹 → 自动吞一粒，`unsuppressedMonths = 0`，播报"气息淡了几分"；
   - 没有 → `+12 个月`，播报"还压得住约 N 年"；
   - 攒到 **300 年（3600 个月）** → 两色雷劫：`hp = 0`、`deathByRisk`，直接身死道消。
2. **盘查**（`policeCheck`，每年 25% 概率）：抽走两成灵石（至少 20 块），置 `flags.spiritWanted`。
3. **身份牌**（`canGetSpiritPass` / `getSpiritPass`）：须有 `relation === '结盟'` 的灵界势力，且灵石 ≥ 1000；成功后 `spiritOutlaw = false`、`spiritRegistered = true`、劫气清零。
4. 模型侧新增 `requestPass: { faction }` 字段（两套 schema 与提示词同步），成不上都回执。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/game.js` | 新增 `ensureOutlaw` / `isOutlaw` / `settleOutlaw` / `policeCheck` / `canGetSpiritPass` / `getSpiritPass`、常量 `TWO_COLOR_MONTHS`、`SPIRIT_PASS_COST`；`advanceTime` 末尾调用并把事件放进 `world.lastOutlawEvents`；`requestPass` 字段与结算；`GAME_VERSION` 1.47.0 |
| `public/app.js` | 状态面板加「劫气：X 年未服丹」；系统消息播报 `lastOutlawEvents` |
| `tests/spirit-outlaw.test.mjs` | 新套件 11 条 |
| `tests/run-offline.mjs` | 白名单加「黑户在灵界」 |
| `README.md` / `package.json` | 1.47.0 |

## 实际测试结果

| 检查 | 结果 |
| --- | --- |
| 新套件 `tests/spirit-outlaw.test.mjs` | 11/11 通过 |
| 全量离线 | **51/51 套**通过（新增 1 套） |
| 前端冒烟 | 运行时错误 0 |

## 踩坑

- **月份/天数搞混**：`settleOutlaw` 一开始把累计值当天数存、又按 `÷12` 当年数除，结果"过去一年"跑了 30 次年结算，劫气嗖地涨到 708 个月（实测值）。改成按整月推进（`days/30`）再按 `÷12` 取整年后，一年正好一条。
- 测试里直接给 `world.outlaw.unsuppressedMonths` 赋值会撞上"字段还没建"，`setup()` 里先调 `ensureOutlaw`。
- PowerShell 的 `-replace` 把 `\n` 写成了字面量，测试文件当场语法错；改用 edit 工具补真换行。

## 未做

- 灭尘丹还没有**独立丹方/产出**（靠背包里同名词条，玩家得靠交易或事件获得）。
- 黑户**不能去天渊城服役**这一点目前只是设定，没有专门的地方拦（灵界任务/服役玩法还没做）。
- 盘查只有罚款，没有"被押送天渊城"的分支。
