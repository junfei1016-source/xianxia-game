# 第三十六轮交付：功法改为"品质 + 特定要求"框架（v1.34.0）

日期：2026-11-04 ｜ 范围：用户指出不必拘泥小说里的具体功法名，只要"品质 + 特定要求"这个框架

## 一、改法

### 1. 名录降级为样例

- 之前：`learnTechnique` 只认 18 门名录，名录外的名字一律拒；
- 现在：**任意功法名都能收**，只要给 `grade`（七等品阶）；名录内同名才走名录的精确设定；
- 名字相近的自创功法（如"寒渊诀残卷"）不再被误当名录功法。

### 2. 要求清单（8 类）

| kind | 判定 |
| --- | --- |
| `realm` | 大境界够不够 |
| `element` | 灵根属性含不含（`player.spiritRoots`） |
| `physique` | 体质是否相符 |
| `place` | 当前区域名是否为此地 |
| `item` | 背包里有没有此物 |
| `mentor` | 是否拜此人为师 |
| `previous` | 是否已修某前置功法 |
| `cost` | 只作叙事，不拦 |

未满足时回执逐条写明，例如：

```
修习条件不足：地利：元磁山（此处是青芜国）
```

### 3. 效果不依赖名录

品阶定倍率（基础 ×1.0 → 仙阶 ×6.0），类型定作用：主修加修炼、炼体减伤、剑诀伤敌、神识助破阵。自创功法同样生效。

## 二、改动清单

| 文件 | 改动 |
| --- | --- |
| `public/techniques.js` | `REQUIREMENT_KINDS`、`normalizeTechnique`、`checkTechniqueRequirements`、`requirementText`、`techniqueExact`、`defOf`；效果聚合改用条目自带的品阶/类型 |
| `public/game.js` | `learnTechnique` 收任意功法并判条件；`practiceTechnique`/`setMainTechnique` 按条目查；schema 支持 grade/type/element/requirements；版本 1.33.0 → 1.34.0 |
| `tests/technique-framework.test.mjs`（新增） | 8 条：任意名、默认品阶、地利、灵根、物品+前置、修为、自创功法效果、回合接入 |
| `docs/specs/techniques.md` | 第七节改为框架与要求表 |
| `README.md` / `package.json` / `run-offline.mjs` | 版本、说明、第 41 套 |

## 三、测试日志

```
[离线测试] 功法框架（品阶+特定要求）
ℹ tests 8  ℹ pass 8  ℹ fail 0
离线测试完成：41/41 套通过
```

## 四、踩到的坑

`techniqueByName` 是"包含即命中"，于是自创的"寒渊诀残卷"被认成了名录里的"寒渊诀"，
要求清单被整条忽略。加了 `techniqueExact`（完全同名才走名录）才修好——
**模糊匹配用在搜索上很好，用在规则判定上就是漏洞。**

## 五、遗留

- 灵根资质未接（伪灵根应卡层数）；
- `place` 只判当前区域，还没有"离地即失效"；
- `cost` 只写叙事，没有实际扣寿元/散功；
- 御兽类仍只有叙事。
