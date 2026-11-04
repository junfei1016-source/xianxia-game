# 第四十二轮交付：v1.39.0 开局定图

日期：2026-11-04。分支 `codex/state-input-guards`，从 `2fe7f2e`（v1.38.1）继续。只做本地提交。

## 一句话

以前地图是"静态九域 + 局中随时能开的新域"，现在是**开局一次性把整张地图钉进存档**（区域、路程、物价系数），此后谁都不许改。势力、物价、秘境、采集点全部挂在这同一张图上。

## 为什么

局中开新域会让叙事前后矛盾：同一片荒原能出现在两个方向、路程可以随口报、物价系数对不上地图。用户的要求也直白："每一局开局先把地图定死，再谈其他。"

## 规则

1. **开局定图**：`startGame` 里第一件事就是 `lockWorldMap(world)`，把九域（含旧档里已开出的动态区域）深拷进 `world.map = { version, lockedAtTurn, regions, travel }`。
2. **此后只读**：`regionById` / `regionByName` / `allRegions` / `travelDays` / `priceMultiplier` 一律先看 `world.map`；模块级世界表只是模板，不再被读写。
3. **不许开新域**：`addRegion` 在定图后直接拒绝，理由写清楚（"本局地图已在开局定死…未知之地只能作为传闻或遗迹存在"）；模型再提 `newRegion` 会进诊断日志。
4. **提示词同步**：两套输出说明里的「新区域 newRegion」整段换成"地图已定死，不要登记新区域、不要写行程表之外的地界；未知之处只能当传闻/遗迹提一句"。
5. **旧档兼容**：没有 `world.map` 的旧存档，读档时用"静态九域 + 当时的 dynamicRegions + dynamicTravel"补一份，幂等、不判罚；没有地图表的世界仍走老路（测试里专门守着这条）。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `public/world.js` | 新增 `worldMapOf` / `lockWorldMap`；`regionById` / `regionByName` / `allRegions` / `travelDays` 改为优先读存档地图；`addRegion` 定图后拒绝；`WORLD_VERSION` 1.4.0 |
| `public/game.js` | 两处 newRegion 说明改写为"地图开局定死"；`GAME_VERSION` 1.39.0 |
| `public/app.js` | 开局、读档、回退三处都调 `lockWorldMap`（幂等） |
| `tests/world-map-lock.test.mjs` | 新套件 8 条 |
| `tests/run-offline.mjs` | 白名单加「开局定图」 |
| `README.md` / `package.json` | 1.39.0 |

## 实际测试结果

| 检查 | 结果 |
| --- | --- |
| 新套件 `tests/world-map-lock.test.mjs` | 8/8 通过 |
| 全量离线 `tests/run-offline.mjs` | **46/46 套**通过（新增 1 套，旧 45 套零改动） |
| 前端冒烟 | 运行时错误 0 |

测试守住的几条不变量：定图幂等（第二次调用不得覆盖）、改了存档地图不影响模块常量、定图后 `addRegion` 必拒、旧档动态区域与路程要一起并进地图、没有地图表的旧世界仍能正常查区域与路程。

## 未做 / 需要你定

1. **每局地图目前完全一样**：都是同一套九域。要不要按开局种子做"同一张骨架、每局微扰"（区域灵气/危险小幅浮动、路程 ±1 日、开局落点随机）？那样才是"每局都有自己的地图"。
2. 地图还没有**可视化**（右侧只有一个区域名与可达列表）。要的话我可以在「图鉴」里加一张节点图（Canvas 或纯 CSS）。
3. 定图之后，`docs/specs/region-generation-standard.md` 那套"新域生成标准"暂时成了死文档——是先留着（将来做"开局随机生成地图"时还用得上），还是删掉？
