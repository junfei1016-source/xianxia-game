// 最小 SEA 测试入口（CJS）
console.log('SEA_BLOB_LOADED');
require('node:http').createServer((req, res) => { res.end('sea-ok'); }).listen(3456, () => console.log('LISTEN 3456'));
