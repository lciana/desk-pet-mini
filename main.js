// main.js —— 主进程（系统层）
// 透明置顶窗口、系统通知、截图、本地文件、调用大模型、番茄钟计时调度。
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Notification, dialog, Tray, Menu, screen, globalShortcut, protocol, nativeImage } = require('electron');
const path = require('path');
const url = require('url');

// ---- 崩溃留痕（排查闪退）----
// 注意：打包后 __dirname 位于只读的 resources/app.asar，不能写日志。
// 改为写入用户可写的 userData 目录（launch.log）。
function logErr(...a) {
  try {
    const line = a.map(x => (x && x.stack) ? x.stack : (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    let dir = __dirname;
    try { dir = app.getPath('userData'); } catch (e) {}
    fs.appendFileSync(path.join(dir, 'launch.log'), `[${new Date().toISOString()}] ${line}\n`);
  } catch (e) {}
}
process.on('uncaughtException', e => logErr('[uncaughtException]', e));
process.on('unhandledRejection', e => logErr('[unhandledRejection]', e));

// 平台判定：Mac 与 Windows 在透明窗/托盘/Dock/快捷键上差异较大，分支处理
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// Windows transparent window: disable GPU hw accel to keep transparency working
// macOS 上透明窗由系统原生支持，禁用硬件加速反而拖累 Retina 渲染，故仅 Windows 关闭
if (IS_WIN) app.disableHardwareAcceleration();

// 自定义协议：渲染进程通过 vosk:// 加载本地离线语音模型（位于 asar 内 assets/vosk-models）
protocol.registerSchemesAsPrivileged([
  { scheme: 'vosk', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// 单例锁：重复启动时自动关闭旧实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    try { win.webContents.send('proactive-say', '我已经在运行啦~'); } catch (e) {}
  }
});

const storage = require('./src/modules/storage');
const llm = require('./src/modules/llm');
const todo = require('./src/modules/todo');
const proactive = require('./src/modules/proactive');
const screenCap = require('./src/modules/screen');
const memory = require('./src/modules/memory');
const pomodoro = require('./src/modules/pomodoro');

let win = null;
let tray = null;

function createWindow() {
  // 全屏透明窗：覆盖整个工作区（不含任务栏），面板/角色可在全屏任意位置
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
  win.setIgnoreMouseEvents(true, { forward: true });

  // macOS：桌宠常驻桌面，需出现在所有桌面空间（Spaces）与全屏应用之上，
  // 否则切到另一个桌面或进入全屏 App 后桌宠会消失。
  if (IS_MAC) {
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch (e) { logErr('[setVisibleOnAllWorkspaces]', e); }
    // 窗口防截屏：桌宠不会出现在系统截图、录屏与屏幕共享中。
    // 因此 Mac 上无需接管 Cmd+Shift+3/4/5 等截图快捷键——截图照常工作，桌宠自动隐身。
    // （想让桌宠出现在录屏里，把这里的 true 改成 false 即可）
    try {
      win.setContentProtection(true);
    } catch (e) { logErr('[setContentProtection]', e); }
  }
  // Windows 修复：点击其他应用后窗口可能被遮住，失焦时重新断言置顶
  win.on('blur', () => {
    const cfg = getConfig();
    if (cfg.alwaysTop !== false) {
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  // 截屏时临时取消置顶（让桌宠不挡住截图内容），1.5秒后恢复
  let screenshotTempOff = false;
  function tempDisableForScreenshot() {
    if (!win || screenshotTempOff) return;
    const cfg = getConfig();
    if (cfg.alwaysTop === false) return;
    screenshotTempOff = true;
    win.setAlwaysOnTop(false);
    setTimeout(() => {
      screenshotTempOff = false;
      if (win) win.setAlwaysOnTop(true, 'screen-saver');
    }, 1500);
  }
  // 注册截屏快捷键检测（仅 Windows）
  // macOS 不注册任何快捷键：改用 win.setContentProtection(true) 让桌宠直接不出现在截图中，
  // 既不打断系统截图，也不需要「按两次才截上图」的别扭操作。
  app.whenReady().then(() => {
    if (!IS_WIN) return;
    try {
      globalShortcut.register('PrintScreen', tempDisableForScreenshot);               // 全屏截图
      globalShortcut.register('CommandOrControl+Shift+S', tempDisableForScreenshot);  // Win+Shift+S 截图工具
      globalShortcut.register('Shift+PrintScreen', tempDisableForScreenshot);         // 部分截图软件
      globalShortcut.register('Super+Alt+A', tempDisableForScreenshot);               // Win+Alt+A 微信截图
    } catch(e) { logErr('[globalShortcut]', e); }
  });
  win.webContents.on('console-message', (_e, level, msg, line, src) => {
    console.log(`[renderer lv${level}] ${msg} (${src}:${line})`);
  });
  win.webContents.on('crashed', (e, killed) => logErr('[renderer crashed] killed=', killed));
  app.on('render-process-gone', (_e, _wc, details) => logErr('[render-process-gone]', details));

  setupTray();
}

// ---- 系统托盘：右键退出 ----
function getCharacterPath() {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'character.json'), 'utf8'));
    if (meta && meta.fileName) {
      const p = path.join(app.getPath('userData'), meta.fileName);
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {}
  return null;
}
// 生成托盘图标：macOS 菜单栏图标只有 16pt（Retina 为 32px），
// 直接塞入大图（如 1381×1958 的角色图）会被系统压缩、边缘发虚，
// 故在 Mac 上统一缩到 32px；Windows 侧保持原图行为不变。
function makeTrayImage(iconPath) {
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) return img;
  if (!IS_MAC) return img;
  try { return img.resize({ width: 32, height: 32 }); } catch (e) { return img; }
}
function setupTray() {
  try {
    const custom = getCharacterPath();
    const icon = (custom && /\.(png|ico)$/i.test(custom)) ? custom : path.join(__dirname, 'assets', 'char-daily.png');
    tray = new Tray(makeTrayImage(icon));
    const menu = Menu.buildFromTemplate([
      { label: '关于桌宠', click: () => { if (win) win.show(); } },
      { type: 'separator' },
      { label: '退出桌宠', click: () => app.quit() },
    ]);
    tray.setToolTip('我的桌宠');
    tray.setContextMenu(menu);
    hideDockIfPossible();   // 托盘就绪后才隐藏 Dock（Mac）
  } catch (e) { logErr('[tray]', e); }
}

// macOS：桌宠是常驻桌面的小组件，不该占 Dock 位（Windows 侧对应 skipTaskbar: true）。
// 必须在托盘创建「成功之后」才隐藏——否则托盘万一失败，Dock 也没了，桌宠就彻底失联无法退出。
function hideDockIfPossible() {
  if (!IS_MAC || !app.dock) return;
  if (!tray) { logErr('[dock] 托盘未就绪，保留 Dock 图标以免失联'); return; }
  try { app.dock.hide(); } catch (e) { logErr('[dock.hide]', e); }
}

app.whenReady().then(() => {
  // vosk:// 协议：把请求映射到 asar 内 assets/vosk-models 下的模型文件
  protocol.registerFileProtocol('vosk', (request, callback) => {
    try {
      const u = new URL(request.url);
      // vosk:// 后跟的是归档文件名（如 vosk-model-small-cn-0.22.zip），它被解析为 URL 的 host，
      // 因此用 hostname 取文件名；不要用 pathname（pathname 恒为 "/"）。
      const name = decodeURIComponent(u.hostname || u.host || '');
      const p = path.join(app.getAppPath(), 'assets', 'vosk-models', name);
      callback({ path: p });
    } catch (e) { callback({ error: -2 }); }
  });
  createWindow(); startTimers();
});

// 全局快捷键：Ctrl+Q / Alt+F4 退出
app.on('browser-window-focus', () => {
  if (!win) return;
  // 用 globalShortcut 需要额外注册，改用 webContents 注入
  win.webContents.executeJavaScript(`
    document.addEventListener('keydown', (e) => {
      // Windows: Ctrl+Q / Alt+F4；macOS: Cmd+Q
      if ((e.ctrlKey && e.key === 'q') || (e.altKey && e.key === 'F4')
          || (e.metaKey && e.key === 'q')) {
        require('electron').ipcRenderer.send('request-quit');
      }
    });
  `).catch(() => {});
});
ipcMain.on('request-quit', () => app.quit());
ipcMain.handle('app:quit', () => app.quit());
app.on('window-all-closed', () => { /* 常驻 */ });

function chinaNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 3600000);
}

function getConfig() {
  return storage.readRoot('config.json', {
    aiEnabled: false, apiKey: '', model: 'glm-4.5', visionModel: 'glm-4.5v',
    baseUrl: '', todoSpeak: true,
  });
}
function getPersona() {
  return storage.readRoot('persona.json', {
    name: '桌宠', age: '', birthday: '', job: '', height: '', weight: '',
    hobbies: [], traits: '', facts: [],
  });
}

const OFFLINE_LINES = ['(AI 还没开，我先陪你坐着~)', '(我这儿没联网，去设置里打开 AI 开关就能聊啦)', '(嘴巴暂时打不开~ 开个 AI 呗)'];
function offlineReply() { return OFFLINE_LINES[Math.floor(Math.random() * OFFLINE_LINES.length)]; }
function notify(title, body) {
  if (Notification.isSupported()) { try { new Notification({ title, body }).show(); } catch (e) {} }
}

// ---------- 对话 ----------
ipcMain.handle('chat', async (e, messages) => {
  const cfg = getConfig();
  const userText = messages[messages.length - 1].content;
  if (!cfg.aiEnabled) return offlineReply();
  if (!cfg.apiKey) return '（还没配置大模型 API Key，请在设置里填写）';
  const persona = getPersona();
  const memBlock = `\n\n===== 你记住的关于对方的事 =====\n${memory.toPrompt()}`;
  const sys = { role: 'system', content:
`你是「${persona.name}」的桌面宠物分身，请以 ${persona.name} 的视角和口吻陪用户聊天。\n\n===== 人设 =====\n${persona.traits}\n\n===== 要求 =====\n- 第一人称、口语化、简短自然。\n- 体现人设特质，不过度撒娇或夸张。${memBlock}` };
  try {
    const reply = await llm.chat({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl, messages: [sys, ...messages] });
    maybeLearn(userText);
    return reply;
  } catch (err) { return '（对话出错：' + err.message + '）'; }
});

async function maybeLearn(text) {
  const cfg = getConfig();
  if (!cfg.aiEnabled || !cfg.autoLearn || !cfg.apiKey) return;
  try {
    const raw = await llm.chat({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl,
      messages: [{ role: 'user', content: `从这条消息提取值得长期记住的事实性信息（关于对方/关系/喜好/重要日期）。只输出 JSON 数组 [{category,key,value}]，没有就 [].\n消息：${text}` }] });
    const arr = JSON.parse(String(raw || '').replace(/```json|```/gi, '').trim());
    if (!Array.isArray(arr)) return;
    const existing = memory.load();
    for (const it of arr) {
      if (!it || !it.value) continue;
      if (it.key && existing.find(e => e.key && e.key === it.key)) continue;
      memory.add({ category: it.category, key: it.key, value: it.value });
    }
  } catch (e) {}
}

// ---------- 窗口：拖动 / 点击穿透 ----------
ipcMain.handle('win:getPos', () => (win ? win.getPosition() : [0, 0]));
ipcMain.handle('win:moveAbs', (e, { x, y }) => { if (win) win.setPosition(x, y); });
ipcMain.handle('win:setIgnore', (e, ignore) => { if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true }); });
ipcMain.handle('win:setAlwaysTop', (e, on) => { if (win) win.setAlwaysOnTop(!!on); });

// ---------- 待办 ----------
ipcMain.handle('todo:list', () => todo.load());
ipcMain.handle('todo:add', (e, { text, deadline, time }) => todo.add(text, deadline, time));
ipcMain.handle('todo:check', (e, id) => todo.check(id));
ipcMain.handle('todo:remove', (e, id) => todo.remove(id));
ipcMain.handle('todo:history', () => todo.history());
ipcMain.handle('todo:delHistory', (e, id) => todo.delHistory(id));
ipcMain.handle('todo:reAdd', (e, id) => todo.reAdd(id));
ipcMain.handle('todo:templates', () => todo.templates());
ipcMain.handle('todo:addTemplate', (e, { text, deadline, time }) => todo.addTemplate(text, deadline, time));
ipcMain.handle('todo:delTemplate', (e, id) => todo.delTemplate(id));

// ---------- 屏幕识别 ----------
ipcMain.handle('screen:see', async () => {
  const cfg = getConfig();
  if (!cfg.aiEnabled || !cfg.apiKey) return { text: '（AI 没开启，我看不到屏幕哦，去设置里打开 AI 开关）' };
  const persona = getPersona();
  try {
    const base64 = await screenCap.capture();
    const prompt = `你是「${persona.name}」，人设：${persona.traits}。你正看着用户的电脑屏幕，请以第一人称用一句中文（≤25字）做出反应。先单独输出1个英文tag(work/gaming/shopping/chatting/reading/video/other)，换行再输出你的反应。`;
    const raw = await llm.see({ apiKey: cfg.apiKey, model: cfg.visionModel, baseUrl: cfg.baseUrl, imageBase64: base64, prompt });
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return { text: lines[1] || raw };
  } catch (e) { return { text: '（识别失败：' + e.message + '）' }; }
});

// ---------- 人设 / 配置 ----------
ipcMain.handle('persona:get', () => getPersona());
ipcMain.handle('persona:save', (e, data) => { const merged = Object.assign(getPersona(), data); storage.writeRoot('persona.json', merged); return merged; });
ipcMain.handle('config:get', () => getConfig());
ipcMain.handle('config:save', (e, data) => { storage.writeRoot('config.json', data); return data; });
ipcMain.handle('config:test', async (e, cfg) => {
  if (!cfg || !cfg.apiKey) return { ok: false, msg: '请先填写 API Key' };
  try {
    const r = await llm.chat({ apiKey: cfg.apiKey, model: cfg.model || 'glm-4.5', baseUrl: cfg.baseUrl || 'https://open.bigmodel.cn/api/paas/v4', messages: [{ role: 'user', content: 'ping' }] });
    return { ok: true, msg: '连接成功 ✓ ' + String(r).slice(0, 24) };
  } catch (err) { return { ok: false, msg: '连接失败：' + err.message }; }
});
ipcMain.handle('persona:export', async () => {
  try {
    const json = JSON.stringify(getPersona(), null, 2);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { title: '导出人设', defaultPath: 'persona.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePath) return { ok: false, msg: '已取消' };
    require('fs').writeFileSync(filePath, json, 'utf8');
    return { ok: true, msg: `已导出到 ${filePath}` };
  } catch (e) { return { ok: false, msg: '导出失败：' + e.message }; }
});
ipcMain.handle('persona:import', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, msg: '已取消' };
    const data = JSON.parse(require('fs').readFileSync(filePaths[0], 'utf8'));
    if (!data || typeof data !== 'object') return { ok: false, msg: '文件格式无效' };
    storage.writeRoot('persona.json', Object.assign(getPersona(), data));
    return { ok: true, msg: `人设已从 ${path.basename(filePaths[0])} 导入` };
  } catch (e) { return { ok: false, msg: '导入失败：' + e.message }; }
});

// ---------- 长期记忆 ----------
ipcMain.handle('memory:get', () => memory.load());
ipcMain.handle('memory:add', (e, { category, key, value }) => memory.add({ category, key, value }));
ipcMain.handle('memory:update', (e, { id, category, key, value }) => memory.update(id, { category, key, value }));
ipcMain.handle('memory:remove', (e, id) => memory.remove(id));
ipcMain.handle('memory:export', async () => {
  const items = memory.load();
  const json = JSON.stringify({ items }, null, 2);
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: '导出记忆', defaultPath: 'memory.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (canceled || !filePath) return { ok: false, msg: '已取消' };
  try { require('fs').writeFileSync(filePath, json, 'utf8'); return { ok: true, msg: `已导出 ${items.length} 条` }; }
  catch (e) { return { ok: false, msg: '导出失败：' + e.message }; }
});
ipcMain.handle('memory:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (canceled || !filePaths || !filePaths.length) return { ok: false, msg: '已取消' };
  try {
    const data = JSON.parse(require('fs').readFileSync(filePaths[0], 'utf8'));
    const arr = Array.isArray(data) ? data : (data.items || []);
    const existing = memory.load();
    let added = 0, skipped = 0;
    for (const it of arr) {
      if (!it || !it.value) continue;
      if (it.key && existing.find(e => e.key && e.key === it.key)) { skipped++; continue; }
      memory.add({ category: it.category, key: it.key, value: it.value }); added++;
    }
    return { ok: true, msg: `导入完成：新增 ${added}，跳过重复 ${skipped}` };
  } catch (e) { return { ok: false, msg: '导入失败：' + e.message }; }
});

// ---------- 番茄钟 ----------
ipcMain.handle('pomodoro:start', () => pomodoro.start());
ipcMain.handle('pomodoro:pause', () => pomodoro.pause());
ipcMain.handle('pomodoro:reset', () => pomodoro.reset());
ipcMain.handle('pomodoro:skip', () => pomodoro.skip());
ipcMain.handle('pomodoro:getState', () => pomodoro.load());
ipcMain.handle('pomodoro:getConfig', () => pomodoro.getConfig());
ipcMain.handle('pomodoro:saveConfig', (e, cfg) => pomodoro.saveConfig(cfg));

// ---------- 首次上传角色形象（仅换角色，UI 不变）----------
ipcMain.handle('character:get', () => {
  const metaPath = path.join(app.getPath('userData'), 'character.json');
  if (!fs.existsSync(metaPath)) return { configured: false, src: null }; // 从未配置
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) {}
  if (meta && meta.configured) {
    const p = getCharacterPath(); // 有自定义图则返回 file://，否则 null（用默认形象）
    return { configured: true, src: p ? url.pathToFileURL(p).href : null };
  }
  return { configured: false, src: null };
});
ipcMain.handle('character:pick', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择你的主角色图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (canceled || !filePaths || !filePaths.length) return null;
    const src = filePaths[0];
    const ext = (path.extname(src) || '.png').toLowerCase();
    const destName = 'character' + ext;
    const dest = path.join(app.getPath('userData'), destName);
    fs.copyFileSync(src, dest);
    fs.writeFileSync(path.join(app.getPath('userData'), 'character.json'),
      JSON.stringify({ fileName: destName, configured: true }, null, 2), 'utf8');
    // 立即更新托盘图标（仅 png/ico 支持；Mac 上同时缩到菜单栏尺寸）
    if (tray && (ext === '.png' || ext === '.ico')) {
      try { tray.setImage(makeTrayImage(dest)); } catch (e) {}
    }
    return { src: url.pathToFileURL(dest).href };
  } catch (e) { return null; }
});
ipcMain.handle('character:skip', () => {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'character.json'),
      JSON.stringify({ fileName: null, configured: true }, null, 2), 'utf8');
    return { src: null };
  } catch (e) { return { src: null }; }
});

// ---------- 定时器 ----------
function startTimers() {
  // 番茄钟：每秒推进，推送 tick；阶段完成时通知 + 推送 done
  setInterval(() => {
    const { state, event } = pomodoro.tick();
    if (win) {
      win.webContents.send('pomodoro-tick', state);
      if (event) {
        if (event.type === 'work-done') notify('🍅 番茄完成！', event.isLongBreak ? '辛苦啦，长休息一下~' : '休息一下吧~');
        else notify('☕ 休息结束', '继续加油！');
        win.webContents.send('pomodoro-done', event);
      }
    }
  }, 1000);

  // 主动话题：每 5 分钟 roll 概率
  proactive.start({
    intervalMs: 5 * 60 * 1000, prob: 0.15, getPersona, getMemory: () => memory.toPrompt(),
    chat: async (messages) => {
      const cfg = getConfig();
      if (!cfg.aiEnabled || !cfg.apiKey) return null;
      return llm.chat({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl, messages });
    },
    onSay: (text) => { if (win) win.webContents.send('proactive-say', text); },
  });

  // 每日 05:00（中国时间）重置待办 + 番茄今日统计
  // 启动补跑：若上次重置不是今天（如桌宠在 5 点处于关闭状态），立即补一次
  if (todo.needsDailyReset()) {
    todo.dailyReset();
    pomodoro.dailyReset();
    if (win) win.webContents.send('show-todos', todo.load());
    notify('待办已更新', '模板已注入今日，昨日待办已归档');
  }
  scheduleDailyReset();
}
function scheduleDailyReset() {
  const now = chinaNow();
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;
  setTimeout(() => {
    todo.dailyReset();
    pomodoro.dailyReset();
    if (win) { win.webContents.send('show-todos', todo.load()); notify('待办已重置', '未完成的已归档，模板已注入今日'); }
    scheduleDailyReset();  // 递归重对齐到下一个 05:00，避免固定 24h 间隔的漂移
  }, delay);
}
