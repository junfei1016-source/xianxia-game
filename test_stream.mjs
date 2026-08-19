// 验证流式输出：POST stream:true，读取 SSE 分片（临时诊断脚本）
const API_KEY = process.env.DSH_KEY || process.argv[2] || '';
if (!API_KEY) { console.error('缺少 Key'); process.exit(2); }

const payload = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: API_KEY,
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: '用一句话介绍修仙。' }],
  temperature: 0.8,
  stream: true,
};

const res = await fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
console.log('status:', res.status, '| content-type:', res.headers.get('content-type'));

const reader = res.body.getReader();
const decoder = new TextDecoder();
let full = '';
let chunks = 0;
let buffer = '';
let deltaCount = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks++;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const data = t.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      const d = j?.choices?.[0]?.delta?.content;
      if (typeof d === 'string' && d) { full += d; deltaCount++; }
    } catch { /* ignore */ }
  }
}
console.log('网络分片数:', chunks, '| SSE delta 数:', deltaCount);
console.log('解析出的完整文本:', full);
