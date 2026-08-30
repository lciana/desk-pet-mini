// storage.js —— 本地文件存储（JSON）
// ⚠️ 重要：打包成 EXE 后，程序目录 resources/app.asar 是「只读」的。
// 所有需要持久化的数据（配置 / 人设 / 待办 / 记忆 / 番茄钟等）必须写入
// 用户可写目录 app.getPath('userData')（Windows 上位于 %APPDATA%/桌宠Mini），
// 否则安装到其他电脑后写入会失败，程序无法保存任何设置。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 解析用户数据目录（带兜底，避免 app 未就绪时崩溃）
function userDataDir() {
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (e) {
    // 兜底：退回项目根（仅开发期有效；打包后安装目录可能只读）
    try {
      const fallback = path.join(__dirname, '..', '..');
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    } catch (e2) {
      return path.join(__dirname, '..', '..');
    }
  }
}

// 打包后全部数据统一落在 userData 目录，避免污染安装目录 / asar 只读区
const DATA_DIR = userDataDir();
const ROOT_DIR = userDataDir();

function ensure(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function read(name, def) {
  ensure(DATA_DIR);
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) return def;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return def; }
}

function write(name, obj) {
  ensure(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(obj, null, 2), 'utf8');
}

// 用户可直接编辑的项目级配置（persona.json / config.json / pomodoro.config.json）
// 注：打包后这些文件同样落在 userData，便于迁移与手动修改
function readRoot(name, def) {
  ensure(ROOT_DIR);
  const p = path.join(ROOT_DIR, name);
  if (!fs.existsSync(p)) return def;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return def; }
}
function writeRoot(name, obj) {
  ensure(ROOT_DIR);
  fs.writeFileSync(path.join(ROOT_DIR, name), JSON.stringify(obj, null, 2), 'utf8');
}

module.exports = { read, write, readRoot, writeRoot, DATA_DIR, ROOT_DIR };
