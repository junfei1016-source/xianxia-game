// Flip the SEA sentinel fuse '0' -> '1' in the injected exe.
// Mirrors postject's api.js: the sentinel must occur exactly once and
// must be followed by ':0' (or already ':1').
import fs from 'node:fs';

const [, , exePath] = process.argv;
if (!exePath) {
  console.error('usage: node sea-flip.mjs <exe>');
  process.exit(2);
}

const buf = fs.readFileSync(exePath);
const fuse = Buffer.from('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', 'utf8');

const first = buf.indexOf(fuse);
if (first === -1) {
  console.error('ERROR: sentinel not found');
  process.exit(1);
}
const last = buf.lastIndexOf(fuse);
if (first !== last) {
  console.error('ERROR: multiple sentinel occurrences:', first, last);
  process.exit(1);
}

const colonIdx = first + fuse.length;
const flagIdx = colonIdx + 1;
const colon = buf[colonIdx];
const flag = buf[flagIdx];
console.log(`sentinel at ${first}, after = '${String.fromCharCode(colon)}' '${String.fromCharCode(flag)}'`);

if (colon !== 0x3a) {
  console.error('ERROR: expected ":" after sentinel');
  process.exit(1);
}
if (flag === 0x31) {
  console.log('fuse already flipped (1) — nothing to do');
  process.exit(0);
}
if (flag !== 0x30) {
  console.error('ERROR: expected "0" or "1" flag, got', flag);
  process.exit(1);
}

buf[flagIdx] = 0x31; // '1'
fs.writeFileSync(exePath, buf);
console.log('OK: fuse flipped 0 -> 1');
