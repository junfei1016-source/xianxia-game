# 第五十九轮交付：v1.56.0 宗门四补

日期：2026-11-04。分支 `codex/state-input-guards`，从 `1f11582`（v1.55.0）继续。只做本地提交。

## 做的是你点的四件

1. 宗门大比
2. 拜师
3. 藏经阁接真货
4. 宗门战事

## 原文依据

| 章 | 原文 | 落成 |
| --- | --- | --- |
| 16 | 七玄门少年"比试拳脚" | 门内比试的场面感 |
| 1550 | "大比"二字出现的场合 | 十年一场的大比 |
| 8 | 墨大夫："从今天起，你就是我的亲传弟子了" | 拜师与传功 |
| 668 | 御灵宗**藏经阁**，"偷窥了多本秘术功法" | 藏经阁给真功法条目 |
| 934 | "除非道友存心想**再次挑起正魔大战**" | 正魔战事可以打起来 |
| 680 | 坠魔谷："古修战场…贪图里面古修的**遗宝功法**" | 战时掉战场遗宝 |

## 规则

1. **大比** `runSectTournament`：`TOURNAMENT_MONTHS = 120`（十年）。评分 = 境界阶×10 + 修为/10 + 功法层数×2 + 随机 0~30，对手分 = 30 + 境界阶×8 + 随机 0~25。
   - score ≥ 对手 +15 → 夺魁：贡献 +60、800 灵石、声望 +10，并调一次 `sectRankUp`。
   - score ≥ 对手 → 前三：贡献 +25、300 灵石。
   - 否则落败：声望 −2。
2. **拜师** `takeMaster`：内门以上 + 贡献 ≥60 + 未拜过；师父名来自传入值、或 NPC 里名字/描述含"长老|师父|师尊|真人"的那位、否则"本门长老"；当场传一门**中阶真功法**。
3. **藏经阁真货**：`sectCatalog` 按当前辈分从 `TECHNIQUES` 取低阶/中阶/高阶功法作为第一项；兑换时 `normalizeTechnique` 后 push 进 `player.techniques`；重复修同一门会被拒。
4. **战事**：`maybeStartWar`（乱世 25% 概率）→ `world.war = { active, side, monthsLeft: 24 }`；战时完成势力任务会调 `warLoot`（50% 概率掉遗宝）；`settleWar` 倒计时，打完播报停战，此后不再掉遗宝。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/game.js` | 引入 `TECHNIQUES` / `normalizeTechnique`；`sectCatalog` 换真功法；`sectRedeem` 写进修习列表；新增 `TOURNAMENT_MONTHS` / `ensureTournament` / `sectTournamentScore` / `runSectTournament` / `canTakeMaster` / `takeMaster` / `maybeStartWar` / `settleWar` / `warLoot`；年度结算接大比与战事；`takeMaster` 字段；`GAME_VERSION` 1.56.0 |
| `public/world.js` | 藏经阁条目加 `secret` 标记（上一轮已加，本轮沿用） |
| `tests/sect-features.test.mjs` | 新套件 9 条 |
| `tests/sect-system.test.mjs` | 配合真功法调整 5 处断言（`bought` 记名字、功法进 `player.techniques`、正常退出要收回） |
| `tests/run-offline.mjs`、`README.md`、`package.json` | 白名单与版本 |

## 实际测试结果

| 检查 | 结果 |
| --- | --- |
| 新套件 | 9/9 通过 |
| 全量离线 | **57/57 套**通过（新增 1 套） |
| 前端冒烟 | 运行时错误 0 |

## 踩坑（如实）

1. **`TECHNIQUES` 重复导入**：文件头 `import { TECHNIQUES, ... }` 本来就有，我又在名字列表末尾加了一次 → `Identifier 'TECHNIQUES' has already been declared`，整个套件从 56/56 掉到 2/56。删掉多余那行才恢复。
2. `leaveSect` 的"秘传"判定只查了背包，而真功法现在进的是 `player.techniques`——正常退出时"交还"只念了台词没真删。改成两边都查、两边都删，并把测试断言收紧成 `player.techniques.length === 0`。
3. 大比用例里日期是"先推进再调用"，而 `ensureTournament` 会按当时日期定赛期，导致永远不到期（返回 null）。改成"先定赛期，再推进日期"。
4. `normalizeTechnique` 不会补 `layer` 字段，测试里断言 `layer === 1` 拿到 undefined——改为只断言有名字。

## 未做

- **大比没有"对手是谁"**：只有一个分数，没有对手 NPC、没有赌注、没有观战描写。
- **战事不分区**：现在是全局一个 `world.war`，没有"哪一片战场、哪家参战、伤亡多少"。
- **战场遗宝只是背包里的名字**，没接法宝/功法数据。
- **拜师之后的实利**：师父只传一次功法，没有"每月指点""危急时护徒"这类持续效果。
