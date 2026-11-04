// 复用本地白名单静态服务和模型模拟器；默认独立3103端口。
process.env.REVIEW_SUITE = 'guards';
process.env.REVIEW_PORT ||= '3103';
await import('./review-deadlines.mjs');
