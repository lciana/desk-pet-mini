// memory.js —— 结构化长期记忆
const storage = require('./storage');
const FILE = 'memories.json';

const CATEGORIES = { me: '关于你', us: '我们/关系', pref: '喜好', date: '重要日期', other: '其他' };

function load() {
  return (storage.read(FILE, { items: [] }).items) || [];
}
function save(items) { storage.write(FILE, { items }); }
function catName(c) { return CATEGORIES[c] || CATEGORIES.other; }

function add({ category, key, value }) {
  const items = load();
  const item = {
    id: 'm' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    category: CATEGORIES[category] ? category : 'other',
    key: (key || '').trim(),
    value: (value || '').trim(),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  save(items);
  return items;
}
function update(id, fields) {
  const items = load();
  const it = items.find(x => x.id === id);
  if (!it) return items;
  if (fields.category && CATEGORIES[fields.category]) it.category = fields.category;
  if (typeof fields.key === 'string') it.key = fields.key.trim();
  if (typeof fields.value === 'string') it.value = fields.value.trim();
  save(items);
  return items;
}
function remove(id) { const items = load().filter(x => x.id !== id); save(items); return items; }
function toPrompt() {
  const items = load();
  if (!items.length) return '（暂时还没有记住的关于你的事）';
  return items.map(m => `- [${catName(m.category)}] ${m.key ? m.key + '：' : ''}${m.value}`).join('\n');
}

module.exports = { CATEGORIES, load, add, update, remove, toPrompt, catName };
