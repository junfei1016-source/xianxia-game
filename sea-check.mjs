// Check the sentinel fuse bytes inside node.exe (the base binary for SEA injection)
import fs from 'node:fs';

const exePath = process.execPath;
const buf = fs.readFileSync(exePath);
console.log('execPath:', exePath, 'size:', buf.length);

const fuse = Buffer.from('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', 'utf8');
const hits = [];
let idx = buf.indexOf(fuse);
while (idx !== -1) {
  hits.push(idx);
  idx = buf.indexOf(fuse, idx + 1);
}
console.log('fuse occurrences:', hits.length, hits.map(h => h.toString()));

for (const h of hits.slice(0, 5)) {
  const after = buf.subarray(h + fuse.length, h + fuse.length + 8);
  console.log(`at ${h}: after = ${JSON.stringify(after.toString('latin1'))} hex=${after.toString('hex')}`);
}

// Also check the blob sentinel name and magic
const blob = fs.readFileSync(new URL('./sea-test.blob', import.meta.url));
console.log('sea-test.blob size:', blob.length, 'first4:', blob.subarray(0, 4).toString('hex'));
const prep = fs.readFileSync(new URL('./sea-prep.blob', import.meta.url));
console.log('sea-prep.blob size:', prep.length, 'first4:', prep.subarray(0, 4).toString('hex'));
