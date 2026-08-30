// todo.js —— 待办 / 历史 / 模板
// 数据结构存于 data/todo.json:
//   today:    [{id,text,deadline,time,done,created}]
//   history:  [{id,text,deadline,time,done|expired}]
//   templates:[{id,text,deadline,time}]
//   lastResetDate: 'YYYY-MM-DD'  —— 用于每日重置的幂等守卫

const storage = require('./storage');
const FILE = 'todo.json';

let seq = Date.now();
function uid() { return 't' + (seq++).toString(36) + Math.random().toString(36).slice(2, 6); }

function ymd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayStr() { return ymd(new Date()); }

function load() {
  return storage.read(FILE, { today: [], history: [], templates: [], lastResetDate: null });
}
function save(d) { storage.write(FILE, d); }

function add(text, deadline, time) {
  const d = load();
  d.today.push({ id: uid(), text, deadline: deadline || null, time: time || null, done: false, created: new Date().toISOString() });
  save(d); return d;
}
function check(id) {
  const d = load();
  const it = d.today.find(t => t.id === id);
  // 仅标记完成，不立即移除：保留到今日列表（显示删除线），5 点重置时随其他项一起进入历史
  if (it && !it.done) { it.done = true; it.doneAt = new Date().toISOString(); }
  save(d); return d;
}
function remove(id) { const d = load(); d.today = d.today.filter(t => t.id !== id); save(d); return d; }

function history() { return load().history; }
function delHistory(id) { const d = load(); d.history = d.history.filter(t => t.id !== id); save(d); return d; }
function reAdd(id) {
  const d = load();
  const it = d.history.find(t => t.id === id);
  if (it) {
    d.today.push({ id: uid(), text: it.text, deadline: it.deadline, time: it.time || null, done: false, created: new Date().toISOString() });
    d.history = d.history.filter(t => t.id !== id);
  }
  save(d); return d;
}

function templates() { return load().templates; }
function addTemplate(text, deadline, time) {
  const d = load();
  d.templates.push({ id: uid(), text, deadline: deadline || null, time: time || null });
  save(d);
  // 验证写入：重新读取确认模板已持久化
  const verify = load();
  if (!verify.templates.find(t => t.text === text)) {
    console.error('[todo] 模板持久化失败！', text);
    // 重试一次
    const d2 = load();
    d2.templates.push({ id: uid(), text, deadline: deadline || null, time: time || null });
    save(d2);
  }
  return d;
}
function delTemplate(id) { const d = load(); d.templates = d.templates.filter(t => t.id !== id); save(d); return d; }

// 每日 05:00 重置：今日全部项 -> 历史（已完成 done:true / 未完成 expired:true），清空今日，模板注入
function dailyReset() {
  const d = load();
  if (d.lastResetDate === todayStr()) return d;  // 幂等守卫：当天已重置则跳过（防止重复灌入模板）
  d.today.forEach(t => d.history.push({
    id: uid(), text: t.text, deadline: t.deadline, time: t.time || null,
    done: !!t.done, expired: !t.done,
  }));
  d.today = [];
  d.templates.forEach(t => d.today.push({ id: uid(), text: t.text, deadline: t.deadline, time: t.time || null, done: false, created: new Date().toISOString(), fromTemplate: true }));
  d.lastResetDate = todayStr();
  save(d); return d;
}
// 是否已需要重置（lastResetDate 不是今天）→ 主进程启动补跑用
function needsDailyReset() { return load().lastResetDate !== todayStr(); }

module.exports = { add, check, remove, history, delHistory, reAdd, templates, addTemplate, delTemplate, dailyReset, needsDailyReset, load };
