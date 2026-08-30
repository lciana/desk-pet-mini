// screen.js —— 屏幕截图（主进程调用，需 electron）
const { desktopCapturer } = require('electron');

async function capture() {
  const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
  if (!srcs.length) throw new Error('没有可截取的屏幕');
  return srcs[0].thumbnail.toDataURL().replace(/^data:image\/\w+;base64,/, '');
}

module.exports = { capture };
