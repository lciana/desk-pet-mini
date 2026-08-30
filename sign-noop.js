// sign-noop.js —— 免数字签名的占位签名脚本
// 用途：个人分发不需要代码签名证书。提供自定义 sign 钩子后，
// electron-builder 不再调用默认的 WinSignTool，从而不会去下载
// winCodeSign 工具链（其内包含 macOS 的 .dylib 符号链接，在非管理员
// Windows 上解压会因无符号链接权限而失败）。
// 直接返回即可：不对 exe 做任何签名。
module.exports = async (configuration) => {
  // configuration.path 为待签名文件路径，这里跳过签名
  return;
};
module.exports.default = module.exports;
