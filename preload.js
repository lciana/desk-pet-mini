// preload.js —— 桥：让渲染进程安全调用主进程功能
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  chat: (messages) => ipcRenderer.invoke('chat', messages),

  getWindowPos: () => ipcRenderer.invoke('win:getPos'),
  moveWindowAbs: (x, y) => ipcRenderer.invoke('win:moveAbs', { x, y }),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('win:setIgnore', ignore),
  setAlwaysTop: (on) => ipcRenderer.invoke('win:setAlwaysTop', on),

  todo: {
    list: () => ipcRenderer.invoke('todo:list'),
    add: (text, deadline, time) => ipcRenderer.invoke('todo:add', { text, deadline, time }),
    check: (id) => ipcRenderer.invoke('todo:check', id),
    remove: (id) => ipcRenderer.invoke('todo:remove', id),
    reAdd: (id) => ipcRenderer.invoke('todo:reAdd', id),
    history: () => ipcRenderer.invoke('todo:history'),
    delHistory: (id) => ipcRenderer.invoke('todo:delHistory', id),
    templates: () => ipcRenderer.invoke('todo:templates'),
    addTemplate: (text, deadline, time) => ipcRenderer.invoke('todo:addTemplate', { text, deadline, time }),
    delTemplate: (id) => ipcRenderer.invoke('todo:delTemplate', id),
  },

  captureAndSee: () => ipcRenderer.invoke('screen:see'),

  memory: {
    list: () => ipcRenderer.invoke('memory:get'),
    add: (category, key, value) => ipcRenderer.invoke('memory:add', { category, key, value }),
    update: (id, category, key, value) => ipcRenderer.invoke('memory:update', { id, category, key, value }),
    remove: (id) => ipcRenderer.invoke('memory:remove', id),
  },

  getPersona: () => ipcRenderer.invoke('persona:get'),
  savePersona: (data) => ipcRenderer.invoke('persona:save', data),
  exportPersona: () => ipcRenderer.invoke('persona:export'),
  importPersona: () => ipcRenderer.invoke('persona:import'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  testConfig: (cfg) => ipcRenderer.invoke('config:test', cfg),
  exportMemory: () => ipcRenderer.invoke('memory:export'),
  importMemory: () => ipcRenderer.invoke('memory:import'),

  // ---- 番茄钟 ----
  pomodoro: {
    start: () => ipcRenderer.invoke('pomodoro:start'),
    pause: () => ipcRenderer.invoke('pomodoro:pause'),
    reset: () => ipcRenderer.invoke('pomodoro:reset'),
    skip: () => ipcRenderer.invoke('pomodoro:skip'),
    getState: () => ipcRenderer.invoke('pomodoro:getState'),
    getConfig: () => ipcRenderer.invoke('pomodoro:getConfig'),
    saveConfig: (cfg) => ipcRenderer.invoke('pomodoro:saveConfig', cfg),
  },

  on: (channel, cb) => {
    const ok = ['proactive-say', 'show-todos', 'pomodoro-tick', 'pomodoro-done'];
    if (ok.includes(channel)) ipcRenderer.on(channel, (e, ...args) => cb(...args));
  },

  quit: () => ipcRenderer.invoke('app:quit'),

  // ---- 首次上传角色形象（仅换角色，UI 不变）----
  characterGet: () => ipcRenderer.invoke('character:get'),
  characterPick: () => ipcRenderer.invoke('character:pick'),
  characterSkip: () => ipcRenderer.invoke('character:skip'),
});
