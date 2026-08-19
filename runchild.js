
const { spawn } = require('node:child_process');
const name = process.argv[2];
const child = spawn('.\\' + name, [], { cwd: process.cwd(), windowsHide: true });
let out = '';
child.stdout.on('data', d => { out += d; process.stdout.write(d); });
child.stderr.on('data', d => { out += d; process.stderr.write(d); });
setTimeout(() => { child.kill(); process.exit(0); }, 4000);
child.on('exit', () => process.exit(0));
