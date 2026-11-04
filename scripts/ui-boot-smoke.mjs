// 无浏览器环境下的前端启动冒烟：给 app.js 一套最小 DOM/存储垫片，跑一次 init()。
// 目的只有一个——回答"页面脚本到底会不会一进来就崩"，不替代真实浏览器验证。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const renders = new Map(); // id -> 最后一次 innerHTML 赋值
const listeners = new Map();

function makeEl(id = '') {
  const el = {
    id,
    tagName: 'DIV',
    className: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    style: new Proxy({}, { get: () => '', set: () => true }),
    dataset: {},
    children: [],
    offsetWidth: 1,
    scrollTop: 0,
    scrollHeight: 100,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, force) { if (force === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (force) this._s.add(c); else this._s.delete(c); return this._s.has(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(type, fn) { const k = `${id}:${type}`; if (!listeners.has(k)) listeners.set(k, []); listeners.get(k).push(fn); },
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML() {},
    removeChild() {},
    remove() {},
    closest() { return null; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    focus() {},
    animate() { return { finished: Promise.resolve() }; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20, bottom: 20, right: 100 }; },
    cloneNode() { return makeEl(id); },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return renders.get(id) || ''; },
    set(v) { renders.set(id, String(v)); },
  });
  return el;
}

const cache = new Map();
const document = {
  getElementById(id) { if (!cache.has(id)) cache.set(id, makeEl(id)); return cache.get(id); },
  querySelector() { return makeEl('__q'); },
  querySelectorAll() { return []; },
  createElement(tag) { return makeEl(`<${tag}>`); },
  addEventListener() {},
  body: makeEl('body'),
  documentElement: makeEl('html'),
  head: makeEl('head'),
};

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

globalThis.document = document;
globalThis.window = globalThis;
globalThis.localStorage = localStorage;
globalThis.location = { href: 'http://127.0.0.1:3211/', reload() {}, origin: 'http://127.0.0.1:3211' };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-smoke' }, configurable: true }); } catch { /* node 自带 navigator */ }
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.alert = () => {};
globalThis.fetch = async () => { throw new Error('冒烟测试不联网'); };
globalThis.TextDecoder = globalThis.TextDecoder || class { decode() { return ''; } };

const errors = [];
process.on('uncaughtException', (e) => errors.push(String(e && e.message || e)));
process.on('unhandledRejection', (e) => errors.push(String(e && e.message || e)));

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/app.js');
try {
  await import('file:///' + here.replace(/\\/g, '/'));
} catch (e) {
  errors.push('IMPORT FAIL: ' + (e && e.message));
}
await new Promise((r) => setTimeout(r, 300));

const chips = ['difficultyChips', 'paceChips', 'turnLimitChips', 'cultGainChips', 'modeChips', 'lengthChips', 'eraChips'];
const chipInfo = {};
for (const id of chips) {
  const el = cache.get(id);
  chipInfo[id] = el ? el.children.map((c) => c.textContent).filter(Boolean) : [];
}
const report = {
  '采到的元素数': cache.size,
  '绑定的事件种类': listeners.size,
  '各选项组渲染出的按钮': chipInfo,
  '难度含炼狱': (chipInfo.difficultyChips || []).includes('炼狱'),
  '存档位已渲染': /档位 1/.test(renders.get('saveSlots') || ''),
  '运行时错误': errors,
};
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
