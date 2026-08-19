// 天下大势差异化：五种大势画像互不相同 + 得失关系 + 文本推断
import { ERA_TYPES, eraTypeFromText } from './public/game.js';

let fails = 0;
const assert = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fails++; };

// ---------- 1. 五种画像互不相同 ----------
const keys = Object.keys(ERA_TYPES);
assert('五种大势齐全', keys.length === 5);
const profiles = keys.map((k) => `${ERA_TYPES[k].gainMult}/${ERA_TYPES[k].dangerMult}/${ERA_TYPES[k].cultMult}`);
assert('画像两两不同（收益/危险/修炼组合唯一）', new Set(profiles).size === 5);

// ---------- 2. 有得有失 ----------
assert('盛世：收益高且最安全', ERA_TYPES['盛世'].gainMult > 1 && ERA_TYPES['盛世'].dangerMult < 1);
assert('乱世：收益高但危险', ERA_TYPES['乱世'].gainMult > 1 && ERA_TYPES['乱世'].dangerMult > 1);
assert('末法：修炼慢、资源少、最安全', ERA_TYPES['末法时代'].cultMult < 1 && ERA_TYPES['末法时代'].gainMult < 1 && ERA_TYPES['末法时代'].dangerMult === Math.min(...keys.map((k) => ERA_TYPES[k].dangerMult)));
assert('正魔大战：收益最高、最危险', ERA_TYPES['正魔大战'].gainMult === Math.max(...keys.map((k) => ERA_TYPES[k].gainMult)) && ERA_TYPES['正魔大战'].dangerMult === Math.max(...keys.map((k) => ERA_TYPES[k].dangerMult)));
assert('秘境将启：收益第二高、危险居中', ERA_TYPES['秘境将启'].gainMult > ERA_TYPES['乱世'].gainMult && ERA_TYPES['秘境将启'].dangerMult === 1.0);

// ---------- 3. 文本推断 ----------
assert('推断盛世', eraTypeFromText('天下太平，盛世繁华') === '盛世');
assert('推断乱世', eraTypeFromText('天下大乱，群雄割据') === '乱世');
assert('推断末法', eraTypeFromText('灵气枯竭，末法降临') === '末法时代');
assert('推断秘境将启', eraTypeFromText('上古秘境即将开启') === '秘境将启');
assert('推断正魔大战', eraTypeFromText('正魔大战一触即发') === '正魔大战');
assert('未知文本回退乱世', eraTypeFromText('天气不错') === '乱世');
assert('空文本回退乱世', eraTypeFromText('') === '乱世');

console.log(fails === 0 ? '\n✅ 大势差异化测试全部通过' : `\n❌ ${fails} 个失败`);
process.exit(fails === 0 ? 0 : 1);
