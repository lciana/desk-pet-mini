// pomodoro.js —— 番茄钟核心（状态机 + 计时 + 统计 + 持久化）
// 计时真相：运行态下 remaining = duration - floor((now - startedAt)/1000)，实时计算，不依赖每次递减存储。
// 状态 (data/pomodoro.json):
// { state:'idle'|'running'|'paused', phase:'work'|'break'|'longBreak',
//   startedAt: ISO|null, remaining: 暂停/空闲时有效, duration: 当前阶段总秒数,
//   todayCompleted, totalCompleted, streak, lastDoneDate }
// 配置 (pomodoro.config.json, 项目根，可编辑):
// { workMinutes, breakMinutes, longBreakMinutes, longBreakInterval, autoStartBreak, autoStartWork }

const storage = require('./storage');
const STATE_FILE = 'pomodoro.json';
const CFG_FILE = 'pomodoro.config.json';

const DEFAULT_CFG = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartBreak: true, autoStartWork: false };

function loadCfg() { return Object.assign({}, DEFAULT_CFG, storage.readRoot(CFG_FILE, {})); }
function saveCfg(cfg) { storage.writeRoot(CFG_FILE, Object.assign({}, DEFAULT_CFG, cfg)); }
function durations(cfg) { return { work: cfg.workMinutes * 60, break: cfg.breakMinutes * 60, longBreak: cfg.longBreakMinutes * 60 }; }
function phaseDuration(phase, cfg) { const d = durations(cfg); return phase === 'work' ? d.work : phase === 'longBreak' ? d.longBreak : d.break; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function now() { return Date.now(); }

function freshState(cfg) {
  const dur = phaseDuration('work', cfg);
  return { state: 'idle', phase: 'work', startedAt: null, remaining: dur, duration: dur, todayCompleted: 0, totalCompleted: 0, streak: 0, lastDoneDate: todayStr() };
}
function loadRaw() {
  let s = storage.read(STATE_FILE, null);
  if (!s) s = freshState(loadCfg());
  s = Object.assign(freshState(loadCfg()), s);
  if (s.lastDoneDate !== todayStr()) { s.todayCompleted = 0; s.lastDoneDate = todayStr(); }
  return s;
}
function save(s) { storage.write(STATE_FILE, s); }

// 实时计算当前剩余秒数（运行态）
function liveRemaining(s, cfg) {
  if (s.state !== 'running' || !s.startedAt) return s.remaining;
  const rem = s.duration - Math.floor((now() - new Date(s.startedAt).getTime()) / 1000);
  return Math.max(0, rem);
}

// 启动时一次性对齐（处理 App 关闭期间流逝的时间）
let _inited = false;
function ensureInit() {
  if (_inited) return; _inited = true;
  const cfg = loadCfg(); const s = loadRaw();
  if (s.state === 'running' && s.startedAt) {
    const rem = s.duration - Math.floor((now() - new Date(s.startedAt).getTime()) / 1000);
    if (rem <= 0) { const r = finalizePhase(s, cfg); save(r.state); }
    else { s.remaining = rem; save(s); }
  }
}

function load() { ensureInit(); const s = loadRaw(); s.remaining = liveRemaining(s, loadCfg()); return s; }

// 结算当前阶段完成 → 切换下一阶段。返回 { state, event }
function finalizePhase(s, cfg) {
  let event = null;
  if (s.phase === 'work') {
    s.todayCompleted += 1; s.totalCompleted += 1; s.streak += 1;
    const isLong = s.streak % cfg.longBreakInterval === 0;
    s.phase = isLong ? 'longBreak' : 'break';
    event = { type: 'work-done', isLongBreak: isLong, todayCompleted: s.todayCompleted, totalCompleted: s.totalCompleted };
  } else { s.phase = 'work'; s.streak = 0; event = { type: 'break-done', todayCompleted: s.todayCompleted, totalCompleted: s.totalCompleted }; }
  const auto = s.phase === 'work' ? cfg.autoStartWork : cfg.autoStartBreak;
  s.duration = phaseDuration(s.phase, cfg);
  if (auto) { s.state = 'running'; s.startedAt = new Date().toISOString(); s.remaining = s.duration; }
  else { s.state = 'idle'; s.startedAt = null; s.remaining = s.duration; }
  return { state: s, event };
}

// 每秒推进
function tick() {
  const cfg = loadCfg(); const s = loadRaw();
  if (s.state !== 'running') return { state: load(), event: null };
  const remaining = liveRemaining(s, cfg);
  if (remaining > 0) return { state: load(), event: null };
  const r = finalizePhase(s, cfg); save(r.state); return { state: load(), event: r.event };
}

function start() {
  const cfg = loadCfg(); const s = load();
  if (s.state === 'running') return s;
  if (s.state === 'paused') { s.startedAt = new Date(now() - (s.duration - s.remaining) * 1000).toISOString(); }
  else { s.duration = phaseDuration(s.phase, cfg); s.remaining = s.duration; s.startedAt = new Date().toISOString(); }
  s.state = 'running'; save(s); return load();
}
function pause() {
  const s = load();
  if (s.state !== 'running') return s;
  s.remaining = liveRemaining(s, loadCfg()); s.state = 'paused'; s.startedAt = null; save(s); return load();
}
function reset() {
  const cfg = loadCfg(); const s = load();
  s.state = 'idle'; s.startedAt = null; s.duration = phaseDuration(s.phase, cfg); s.remaining = s.duration; save(s); return load();
}
function skip() {
  const cfg = loadCfg(); const s = load();
  s.phase = s.phase === 'work' ? 'break' : 'work'; s.state = 'idle'; s.startedAt = null;
  s.duration = phaseDuration(s.phase, cfg); s.remaining = s.duration; save(s); return load();
}
function getConfig() { return loadCfg(); }
function saveConfig(cfg) { saveCfg(cfg); return loadCfg(); }
function dailyReset() { const s = load(); s.todayCompleted = 0; s.lastDoneDate = todayStr(); save(s); return s; }

module.exports = { DEFAULT_CFG, load, tick, start, pause, reset, skip, getConfig, saveConfig, dailyReset, phaseDuration };
