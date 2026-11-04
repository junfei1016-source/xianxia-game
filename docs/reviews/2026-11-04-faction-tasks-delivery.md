# 第五十三轮交付：v1.50.0 宗门任务殿

日期：2026-11-04。分支 `codex/state-input-guards`，从 `da1b546`（v1.49.0）继续。只做本地提交。

## 一句话

任务殿不再是"一个区域一块公共牌子"，而是**每家势力各挂各的牌**：谁给的活、给谁家记功、拿谁家的功勋换东西，全部分家。好感攒够了还能把关系从"中立"变"结盟"。

## 规则

1. **按势力发牌**（`factionBoards(world)`）：取当前区域的本地势力（`factionsIn`），每家两张，牌面按势力性质出：
   | 势力类型 | 干什么活 |
   | --- | --- |
   | 宗门 | 猎妖、采办 |
   | 帮派 | 打杀、跑腿 |
   | 商会 | 押货、采办 |
   | 朝廷 | 缉捕、跑腿 |
   | 世家 | 采办、跑腿 |
   | 妖族 | 血食（猎妖） |
   | 散修联盟 | 三样都接 |
   宗门层级（tier ≤2）能挂"高阶+长老会"，小势力只能挂低阶。
2. **功勋分家**：完成后功勋记 `world.factionMerit[factionId]`，好感 `favor += 功勋 × 4`；别家不受影响。
3. **好感结盟**：`favor >= 100` 自动把关系改成"结盟"（`tryFactionAlly`）。
4. **敌对不给活**；**超期扣那家好感十点**（不再是全局功勋）。
5. **功勋台分立场**：正道（回春丹/破界符/灵石）、魔道（血煞丹/阴煞之气/灵石）、中立（灭尘丹/灵玉/灵石）。

## 接口

```js
FACTION_TASK_STYLE / FACTION_SHOP / FACTION_ALLY_FAVOR   // world.js
factionBoards(world) -> [{ faction, merit, favor, board }]
takeFactionTask(world, player, factionId, taskId)
factionMeritOf(world, factionId) / factionShop(world, factionId)
redeemFaction(world, player, factionId, itemId)
tryFactionAlly(world, factionId)
```

模型侧新增 `takeFactionTask` / `redeemFaction`（各 `{factionId, id}`），两套 schema 与提示词同步。

## 界面

「任务」页现在分两层：公共「任务殿」（区域牌）+「宗门任务殿」（按势力折叠，标题带功勋与好感，里面是两件活和该家的功勋台）。

## 实际测试结果

| 检查 | 结果 |
| --- | --- |
| 新套件 `tests/faction-tasks.test.mjs` | 9/9 通过 |
| 全量离线 | **54/54 套**通过（新增 1 套） |
| 前端冒烟 | 运行时错误 0 |

测试钉住：每家两张牌且编号不撞、敌对不给活、境界不够不给接、做完只涨自家功勋、好感满 100 自动结盟、超期扣那家好感、兑换只扣自家功勋。

## 踩坑

- `factionsIn` 在 game.js 里没导入（只有 world.js 有），`factionBoards` 一跑就 `ReferenceError`。补进 import。

## 未做

- 势力好感目前只有"做任务涨、超期扣"两个来源，还没有**敌对行为**（抢人家货、杀人家弟子）导致的掉好感。
- 长老会级的势力任务仍不强制"多人联手"（第 1358 章的设定还没落到机制上）。
- 结盟之后除了 `relation` 字段变，还没有实际好处（比如功法/丹药折扣、护法加成）——现有 `factionCultMult` 吃的是"结盟势力数量"，所以修炼加成已经生效，其余没有。
