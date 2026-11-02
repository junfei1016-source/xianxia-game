import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../public/game.js';
import { WORLD_VERSION } from '../public/world.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('GAME_VERSION 与 package.json 一致（防止版本漂移）', () => {
  assert.equal(GAME_VERSION, pkg.version);
});

test('版本号形如 x.y.z', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(WORLD_VERSION, /^\d+\.\d+\.\d+$/);
});
