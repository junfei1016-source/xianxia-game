// Default test suites are deterministic and must never call a paid model API.
globalThis.fetch = async () => {
  throw new Error('离线测试禁止网络 fetch；真实模型联调请使用独立在线脚本。');
};
