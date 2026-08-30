// renderer.js —— 网页端逻辑（显示 + 交互）
// 若运行在浏览器直接打开 index.html（无 Electron preload），自动启用内置 stub，
// 用 localStorage + setInterval 模拟全部功能，实现零依赖预览。
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const IS_ELECTRON = !!window.api;

  // ===================== 清脆像素风点击音效（Web Audio API）=====================
  let audioCtx = null;
  let sfxOn = true;     // 界面点击音效开关（false = 关闭）
  let sfxVol = 60;      // 音效音量 0-100
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  // 清脆的「叮」声：高频方波 + 极快衰减，像像素游戏UI点击
  function playClickSound() {
    if (!sfxOn) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      // 方波更清脆，像8-bit游戏音效
      osc.type = 'square';
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.03);
      // 极短包络：瞬间起音 + 快速衰减（音量随用户设置缩放）
      const peak = 0.13 * (sfxVol / 100);
      gain.gain.setValueAtTime(Math.max(0.0001, peak), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch(e) { /* 静默失败 */ }
  }
  // 关闭按钮：稍低沉的清脆「哒」声
  function playPopSound() {
    if (!sfxOn) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.025);
      const peak = 0.13 * (sfxVol / 100);
      gain.gain.setValueAtTime(Math.max(0.0001, peak), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch(e) { /* 静默失败 */ }
  }
  // 给所有按钮/可点击元素统一绑定音效
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .tab-btn, .ctx-item, .mm-tab-btn, .mini, .todo-list li');
    if (target) {
      if (target.closest('.btn-close')) playPopSound(); else playClickSound();
    }
  }, { capture: true });

  // ===================== 浏览器预览 stub =====================
  function makeStub() {
    const store = (() => {
      let mem = {};
      try { mem = JSON.parse(localStorage.getItem('pet-mini') || '{}'); } catch (e) { mem = {}; }
      return {
        get(k, d) { return k in mem ? mem[k] : d; },
        set(k, v) { mem[k] = v; try { localStorage.setItem('pet-mini', JSON.stringify(mem)); } catch (e) {} },
      };
    })();

    // ---- 番茄钟 stub（内含计时器）----
    const CFG_DEF = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartBreak: true, autoStartWork: false };
    const dur = (c) => ({ work: c.workMinutes * 60, break: c.breakMinutes * 60, longBreak: c.longBreakMinutes * 60 });
    function loadCfg() { return Object.assign({}, CFG_DEF, store.get('pomoCfg', {})); }
    function todayStr() { return new Date().toISOString().slice(0, 10); }
    function fresh() { return { state: 'idle', phase: 'work', remaining: dur(loadCfg()).work, startedAt: null, todayCompleted: 0, totalCompleted: 0, streak: 0, lastDoneDate: todayStr() }; }
    function load() { let s = store.get('pomo', null) || fresh(); s = Object.assign(fresh(), s); if (s.lastDoneDate !== todayStr()) { s.todayCompleted = 0; s.lastDoneDate = todayStr(); } if (s.state === 'running' && s.startedAt) { const el = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000); const r = dur(loadCfg())[s.phase] - el; s.remaining = r > 0 ? r : 1; } store.set('pomo', s); return s; }
    function save(s) { store.set('pomo', s); }
    function phaseDur(ph, c) { const d = dur(c); return ph === 'work' ? d.work : ph === 'longBreak' ? d.longBreak : d.break; }
    const handlers = { 'pomodoro-tick': [], 'pomodoro-done': [], 'proactive-say': [], 'show-todos': [] };
    let timer = null;
    function emit(ch, payload) { (handlers[ch] || []).forEach((cb) => cb(payload)); }
    function startTimer() { if (timer) return; timer = setInterval(() => { const s = load(); if (s.state !== 'running') return; s.remaining -= 1; if (s.remaining > 0) { save(s); emit('pomodoro-tick', s); return; }
        if (s.phase === 'work') { s.todayCompleted++; s.totalCompleted++; s.streak++; const isLong = s.streak % loadCfg().longBreakInterval === 0; s.phase = isLong ? 'longBreak' : 'break'; emit('pomodoro-done', { type: 'work-done', isLongBreak: isLong, todayCompleted: s.todayCompleted, totalCompleted: s.totalCompleted }); } else { s.phase = 'work'; s.streak = 0; emit('pomodoro-done', { type: 'break-done' }); }
        const c = loadCfg(); const auto = s.phase === 'work' ? c.autoStartWork : c.autoStartBreak; if (auto) { s.state = 'running'; s.startedAt = new Date().toISOString(); } else { s.state = 'idle'; s.startedAt = null; } s.remaining = phaseDur(s.phase, c); save(s); emit('pomodoro-tick', s); }, 1000); }
    startTimer();

    return {
      chat: () => Promise.resolve('（预览模式：未连接大模型，去设置里填 API Key 即可对话）'),
      poke: () => Promise.resolve({ text: '别戳我啦，痒~' }),
      getWindowPos: () => Promise.resolve([0, 0]),
      moveWindowAbs: (x, y) => { const a = $('app'); if (a) a.style.transform = `translate(${x}px, ${y}px)`; },
      setIgnoreMouse: () => {},
      setAlwaysTop: () => {},
      todo: {
        list: () => Promise.resolve(store.get('todo', { today: [], history: [], templates: [] })),
        add: (text, deadline, time) => { const d = store.get('todo', { today: [], history: [], templates: [] }); d.today.push({ id: 't' + Date.now(), text, deadline: deadline || null, time: time || null, done: false }); store.set('todo', d); return Promise.resolve(d); },
        check: (id) => { const d = store.get('todo', { today: [], history: [], templates: [] }); d.today = d.today.filter((t) => t.id !== id); store.set('todo', d); return Promise.resolve(d); },
        remove: (id) => { const d = store.get('todo', { today: [], history: [], templates: [] }); d.today = d.today.filter((t) => t.id !== id); store.set('todo', d); return Promise.resolve(d); },
        reAdd: (id) => { const d = store.get('todo', { today: [], history: [], templates: [] }); const it = d.history.find((t) => t.id === id); if (it) d.today.push(Object.assign({}, it, { id: 't' + Date.now(), done: false })); d.history = d.history.filter((t) => t.id !== id); store.set('todo', d); return Promise.resolve(d); },
        history: () => Promise.resolve(store.get('todo', { today: [], history: [], templates: [] }).history),
        delHistory: (id) => { const d = store.get('todo', { today: [], history: [], templates: [] }); d.history = d.history.filter((t) => t.id !== id); store.set('todo', d); return Promise.resolve(d); },
        templates: () => Promise.resolve(store.get('todo', { today: [], history: [], templates: [] }).templates),
        addTemplate: (text, deadline, time) => { const d = store.get('todo', { today: [], history: [], templates: [] }); d.templates.push({ id: 't' + Date.now(), text, deadline: deadline || null, time: time || null }); store.set('todo', d); return Promise.resolve(d); },
        delTemplate: (id) => { const d = store.get('todo', { today: [], history: [], templates: [] }); d.templates = d.templates.filter((t) => t.id !== id); store.set('todo', d); return Promise.resolve(d); },
      },
      captureAndSee: () => Promise.resolve({ text: '（预览模式看不到屏幕，连上 AI 后可用）' }),
      memory: {
        list: () => Promise.resolve(store.get('mem', [])),
        add: (category, key, value) => { const arr = store.get('mem', []); arr.push({ id: 'm' + Date.now(), category, key, value }); store.set('mem', arr); return Promise.resolve(arr); },
        update: (id, category, key, value) => { const arr = store.get('mem', []); const it = arr.find((x) => x.id === id); if (it) Object.assign(it, { category, key, value }); store.set('mem', arr); return Promise.resolve(arr); },
        remove: (id) => { const arr = store.get('mem', []).filter((x) => x.id !== id); store.set('mem', arr); return Promise.resolve(arr); },
      },
      getPersona: () => Promise.resolve(store.get('persona', { name: '桌宠', traits: '' })),
      savePersona: (d) => { store.set('persona', d); return Promise.resolve(d); },
      exportPersona: () => Promise.resolve({ ok: true, msg: '预览模式：导出不可用' }),
      importPersona: () => Promise.resolve({ ok: true, msg: '预览模式：导入不可用' }),
      getConfig: () => Promise.resolve(store.get('cfg', { aiEnabled: false, apiKey: '', model: 'glm-4.5', visionModel: 'glm-4.5v', baseUrl: '', alwaysTop: true, autoStart: false, proactive: true, focusMin: 30 })),
      saveConfig: (d) => { store.set('cfg', d); if (d.alwaysTop !== undefined && api.setAlwaysTop) api.setAlwaysTop(d.alwaysTop); return Promise.resolve(d); },
      testConfig: () => Promise.resolve({ ok: false, msg: '预览模式无法测试连接' }),
      exportMemory: () => Promise.resolve({ ok: true, msg: '预览模式：导出不可用' }),
      importMemory: () => Promise.resolve({ ok: true, msg: '预览模式：导入不可用' }),
      pomodoro: {
        start: () => { const s = load(); if (s.state === 'running') return Promise.resolve(s); if (!s.remaining || s.remaining <= 0) s.remaining = phaseDur(s.phase, loadCfg()); s.state = 'running'; s.startedAt = new Date().toISOString(); save(s); emit('pomodoro-tick', s); return Promise.resolve(s); },
        pause: () => { const c = loadCfg(); const s = load(); if (s.state !== 'running') return Promise.resolve(s); const el = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000); s.remaining = Math.max(0, phaseDur(s.phase, c) - el); s.state = 'paused'; s.startedAt = null; save(s); emit('pomodoro-tick', s); return Promise.resolve(s); },
        reset: () => { const s = load(); s.state = 'idle'; s.startedAt = null; s.remaining = phaseDur(s.phase, loadCfg()); save(s); emit('pomodoro-tick', s); return Promise.resolve(s); },
        skip: () => { const s = load(); s.phase = s.phase === 'work' ? 'break' : 'work'; s.state = 'idle'; s.startedAt = null; s.remaining = phaseDur(s.phase, loadCfg()); save(s); emit('pomodoro-tick', s); return Promise.resolve(s); },
        getState: () => Promise.resolve(load()),
        getConfig: () => Promise.resolve(loadCfg()),
        saveConfig: (cfg) => { store.set('pomoCfg', cfg); return Promise.resolve(loadCfg()); },
      },
      on: (ch, cb) => { if (handlers[ch]) handlers[ch].push(cb); },
      // 预览模式：角色上传不可用，直接视为已配置（用默认形象，不弹向导）
      characterGet: () => Promise.resolve({ configured: true, src: null }),
      characterPick: () => Promise.resolve(null),
      characterSkip: () => Promise.resolve({ configured: true, src: null }),
    };
  }

  const api = window.api || makeStub();

  // ===================== 错误提示 =====================
  window.addEventListener('error', (e) => {
    let el = document.getElementById('fatal');
    if (!el) { el = document.createElement('div'); el.id = 'fatal'; el.style.cssText = 'position:fixed;left:8px;top:8px;max-width:90%;background:#c0392b;color:#fff;font-size:11px;padding:6px 10px;border-radius:6px;z-index:9999;white-space:pre-wrap;font-family:monospace;'; document.body.appendChild(el); }
    el.textContent = 'JS 错误: ' + (e.message || '未知');
  });

  // ===================== 点击穿透（仅 Electron）=====================
  let ignoreMouseOn = true;   // 初始：穿透模式（true = 忽略鼠标 = 点击穿透到桌面）
  let onboardOpen = false;    // 首次上传向导是否打开（打开时强制捕获鼠标）
  let dragActive = false;
  let lastMX = 0, lastMY = 0;
  const PANEL_IDS = ['chat-ui', 'todo-panel', 'settings-panel', 'pomodoro-panel', 'main-menu'];
  // 需要捕获的区域：鼠标悬停其上时必须能收到点击/拖拽/右键事件
  const INTERACTIVE = '#pet, #ctx-menu, #chat-ui, #todo-panel, #settings-panel, #pomodoro-panel, #main-menu, .panel-header, .main-header';
  function isAnyUIActive() {
    return PANEL_IDS.some((id) => !$(id).classList.contains('hidden')) || !$('ctx-menu').classList.contains('hidden');
  }
  // 鼠标当前是否悬停在人物/面板上（用坐标查 DOM，穿透模式下也可用）
  function isOverInteractive() {
    const el = document.elementFromPoint(lastMX, lastMY);
    return !!(el && el.closest(INTERACTIVE));
  }
  function setCaptureMode(onCapturing) {
    if (!IS_ELECTRON) return;
    const wantIgnore = !onCapturing;
    if (wantIgnore === ignoreMouseOn) return;
    ignoreMouseOn = wantIgnore;
    console.log('[cap] 捕获模式=' + onCapturing + ' (setIgnoreMouse=' + wantIgnore + ')');
    api.setIgnoreMouse(wantIgnore).catch((e) => console.log('[cap] setIgnoreMouse 失败:', e));
  }
  // 统一接口：拖拽中→捕获；面板/右键开着→捕获；否则看鼠标是否悬停在人物/面板上（hover 即捕获，移开即穿透）
  function syncCapture() {
    if (onboardOpen) { setCaptureMode(true); return; } // 向导打开时强制捕获，便于点击
    if (dragActive) { setCaptureMode(true); return; }
    if (isAnyUIActive()) { setCaptureMode(true); return; }
    setCaptureMode(isOverInteractive());
  }

  // ===================== 拖拽状态（角色 + 面板共用）=====================
  let petDrag = false, petStart = null, petPos = null, didPetDrag = false, justDragged = false;
  let pDrag = false, pStart = null;
  function getPetPos() {
    if (petPos) return petPos;
    const r = $('pet').getBoundingClientRect();
    petPos = { x: r.left, y: r.top };
    return petPos;
  }
  function endPetDrag() {
    if (!petDrag) return;
    petDrag = false; petStart = null; dragActive = false;
    if (IS_ELECTRON) syncCapture();
  }
  function endPanelDrag() {
    if (!pDrag) return;
    pDrag = false; pStart = null; dragActive = false;
    if (IS_ELECTRON) syncCapture();
  }
  // 任意新按下都清掉“刚拖拽过”标记，避免松手后的 click 误关面板
  document.addEventListener('mousedown', () => { justDragged = false; });

  // ===================== 气泡（椭圆可爱气泡，跟随人物上方）====================
  let bubbleTimer = null;
  function showBubble(text) {
    const b = $('bubble');
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.add('hidden'), 7000);
    // 定位到人物头顶正上方
    const pet = $('pet');
    const pr = pet.getBoundingClientRect();
    const bw = b.offsetWidth, bh = b.offsetHeight;
    // 气泡居中在人物头顶上方
    let left = pr.left + (pr.width - bw) / 2;
    let top = pr.top - bh - 16; // 气泡在人物上方，留出尾巴空间
    // 边界修正
    if (left < 4) left = 4;
    if (left + bw > window.innerWidth - 4) left = window.innerWidth - bw - 4;
    if (top < 4) top = 4;
    if (top + bh > window.innerHeight - 4) { top = window.innerHeight - bh - 4; }
    b.style.left = left + 'px';
    b.style.top = top + 'px';
  }
  function logLine(who, text) { const div = document.createElement('div'); div.className = who === 'me' ? 'me' : 'pet'; div.textContent = (who === 'me' ? '我: ' : 'ta: ') + text; const box = $('chat-log'); box.appendChild(div); box.scrollTop = box.scrollHeight; }

  // ===================== 对话 =====================
  async function sendChat() {
    const input = $('chat-input'); const text = input.value.trim(); if (!text) return;
    input.value = ''; logLine('me', text);
    const reply = await api.chat([{ role: 'user', content: text }]);
    logLine('pet', reply); showBubble(reply);
  }
  $('btn-send').onclick = sendChat;
  $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  // ===================== 语音输入（本地离线：Vosk WASM，无需联网/无需 Key）====================
  let voskModel = null;   // 离线模型（首次使用时加载，之后复用）
  let voskRec = null;     // 当前识别器
  let isRecording = false;
  let voiceStream = null, voiceCtx = null, voiceNode = null, voiceSrc = null;
  const voiceBtn = $('btn-voice');
  async function ensureVoskModel() {
    if (voskModel) return voskModel;
    if (!window.Vosk) throw new Error('语音模块未加载');
    showBubble('🎤 正在加载离线语音模型…');
    voskModel = await window.Vosk.createModel('vosk://vosk-model-small-cn-0.22.zip');
    return voskModel;
  }
  async function startVoice() {
    let model;
    try { model = await ensureVoskModel(); }
    catch (e) { showBubble('离线语音加载失败：' + (e && e.message || e)); return; }
    voskRec = new model.KaldiRecognizer(16000);
    voskRec.on('result', (m) => {
      const t = (m && m.result && m.result.text || '').trim();
      if (t) { $('chat-input').value += t; $('chat-input').dispatchEvent(new Event('input', { bubbles: true })); showBubble('识别到: ' + t); }
    });
    voskRec.on('partialresult', (m) => {
      const p = (m && m.result && m.result.partial || '').trim();
      if (p) showBubble('🎤 ' + p);
    });
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 }, video: false });
    } catch (e) { showBubble('无法访问麦克风：' + (e && e.message || e)); voskRec = null; return; }
    voiceCtx = new (window.AudioContext || window.webkitAudioContext)();
    voiceSrc = voiceCtx.createMediaStreamSource(voiceStream);
    voiceNode = voiceCtx.createScriptProcessor(4096, 1, 1);
    voiceNode.onaudioprocess = (ev) => { if (voskRec) { try { voskRec.acceptWaveform(ev.inputBuffer); } catch (err) { console.warn('[voice] acceptWaveform', err); } } };
    const mute = voiceCtx.createGain(); mute.gain.value = 0; // 避免麦克风回放
    voiceSrc.connect(voiceNode); voiceNode.connect(mute); mute.connect(voiceCtx.destination);
    isRecording = true;
    voiceBtn.classList.add('recording');
    showBubble('🎤 正在听…（离线）');
  }
  function stopVoice() {
    isRecording = false;
    if (voiceBtn) voiceBtn.classList.remove('recording');
    try { if (voiceNode) { voiceNode.onaudioprocess = null; voiceNode.disconnect(); } } catch (e) {}
    try { if (voiceSrc) voiceSrc.disconnect(); } catch (e) {}
    try { if (voiceCtx) voiceCtx.close(); } catch (e) {}
    try { if (voiceStream) voiceStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    voiceNode = null; voiceSrc = null; voiceCtx = null; voiceStream = null;
    if (voskRec) { try { voskRec.remove(); } catch (e) {} voskRec = null; }
  }
  if (voiceBtn) {
    voiceBtn.onclick = () => {
      try { getAudioCtx().resume(); } catch (e) {}
      if (isRecording) { stopVoice(); return; }
      startVoice();
    };
  }

  // ===================== 戳一戳（连点3下：随机说一句口头禅）=====================
  const POKE_FALLBACK = ['戳我干嘛呀~', '别戳啦，痒~', '嘿，在呢！', '（被你戳了一下，瞪你）'];
  async function triggerPoke() {
    const pet = $('pet'); pet.classList.remove('shake'); void pet.offsetWidth; pet.classList.add('shake');
    const cp = (typeof getRandomCatchphrase === 'function') ? getRandomCatchphrase() : null;
    if (cp) { showBubble(cp); return; }
    showBubble(POKE_FALLBACK[Math.floor(Math.random() * POKE_FALLBACK.length)]);
  }
  let clickStamps = [];
  function onPetClick() {
    const now = Date.now(); clickStamps = clickStamps.filter((t) => now - t < 1200); clickStamps.push(now);
    if (3 - clickStamps.length <= 0) { clickStamps = []; triggerPoke(); }
  }

  // ===================== UI 主题系统（7 套像素风双色主题）====================
  // 每套主题 = 一张背景图 + 一组 CSS 变量（primary / dark / light / panel）
  // 主题切换：换主菜单背景图 + 设 :root CSS 变量 → 整套 UI 配色联动
  const THEMES = [
    { id: 1, name: '暖橙',   bg: 'assets/ui-theme-1.png', swatch: '#C47840',
      vars: { primary: '#C47840', hover: '#B06830', dark: '#5D3A1A', light: '#FFFEF9', lightTxt: '#FFF8E7', panel: '#FFF8E7', borderLt: '#D4B896' } },
    { id: 2, name: '雾蓝',   bg: 'assets/ui-theme-2.png', swatch: '#6B8490',
      vars: { primary: '#6B8490', hover: '#5A7580', dark: '#2D4155', light: '#D7EBF5', lightTxt: '#F0F6FA', panel: '#EDF4F8', borderLt: '#B8CDD8' } },
    { id: 3, name: '极简',   bg: 'assets/ui-theme-3.png', swatch: '#A0A0A0',
      vars: { primary: '#9A9A9A', hover: '#888888', dark: '#3C3C3C', light: '#F4F4F4', lightTxt: '#ECECEC', panel: '#FAFAFA', borderLt: '#D0D0D0' } },
    { id: 4, name: '樱粉',   bg: 'assets/ui-theme-4.png', swatch: '#FF7D9B',
      vars: { primary: '#FF7D9B', hover: '#F06888', dark: '#A51941', light: '#FFF0F3', lightTxt: '#FFE0E6', panel: '#FFF5F7', borderLt: '#F0C0CC' } },
    { id: 5, name: '草绿',   bg: 'assets/ui-theme-5.png', swatch: '#9BC35F',
      vars: { primary: '#9BC35F', hover: '#88B04D', dark: '#375523', light: '#F0FAE4', lightTxt: '#E2F5D0', panel: '#F5FAEE', borderLt: '#C8DEA8' } },
    { id: 6, name: '钢蓝',   bg: 'assets/ui-theme-6.png', swatch: '#2A69CC',
      vars: { primary: '#2A69CC', hover: '#1E5BB8', dark: '#143A6E', light: '#EDF3FD', lightTxt: '#D0E2F8', panel: '#F0F4FB', borderLt: '#A8C4E4' } },
    { id: 7, name: '金黄',   bg: 'assets/ui-theme-7.png', swatch: '#FFCC33',
      vars: { primary: '#FFCC33', hover: '#E6B82E', dark: '#8A6A1A', light: '#FFF9E8', lightTxt: '#FFE8A0', panel: '#FFFDF5', borderLt: '#E8D888' } },
  ];
  let currentThemeId = 1;  // 默认 UI1

  /** 取当前主题对应的功能面板背景图（UI1=默认，UI2–UI7=新图）*/
  function currentThemeBg() {
    const t = THEMES.find(th => th.id === currentThemeId) || THEMES[0];
    return t.bg;
  }

  /** 应用主题：设 CSS 变量 + 换主菜单背景图 */
  function applyTheme(themeId) {
    const t = THEMES.find(th => th.id === themeId);
    if (!t) return;
    currentThemeId = themeId;
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => {
      root.style.setProperty('--t-' + k.replace(/([A-Z])/g, '-$1').toLowerCase(), v);
    });
    // 换主菜单背景
    const mm = $('main-menu');
    if (mm) mm.style.backgroundImage = `url('${t.bg}')`;
    // 更新色块选中态
    document.querySelectorAll('.theme-swatch').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.id) === themeId);
    });
    // 持久化
    try { localStorage.setItem('pet-mini-theme', JSON.stringify({ id: themeId })); } catch(e) {}
  }

  /** 初始化主题选择器（生成色块 DOM 并绑定事件）*/
  function initThemePicker() {
    const picker = $('theme-picker');
    if (!picker) return;
    picker.innerHTML = '';
    THEMES.forEach(t => {
      const s = document.createElement('div');
      s.className = 'theme-swatch' + (t.id === currentThemeId ? ' active' : '');
      s.dataset.id = t.id;
      s.dataset.n = t.id;
      s.style.background = t.swatch;
      s.title = t.name;
      s.addEventListener('click', () => applyTheme(t.id));
      picker.appendChild(s);
    });
  }

  // ===================== 边缘吸附：人物 ↔ 像素风猫猫头 =====================
  // 把人物拖到桌面（窗口）边缘 → 变成「与角色金发同色的浅金色」像素风猫猫头，停靠在边缘（遮挡屏幕边角）
  // 再次点击猫猫头 → 变回人物。转换时带可爱互动特效（弹跳缩放 + 像素星光 / 小爱心粒子 + 弹跳音）。
  const CAT_W = 80, CAT_H = 85;   // 猫猫头停靠尺寸（1/3 放大后）
  const petEl = $('pet');
  let petDocked = false, dockEdge = null, catSVG = '', catColor = null;

  // ---- 颜色工具 ----
  function hexToRgb(h) { h = (h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  function rgbToHex(c) { const f = v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); return '#' + f(c.r) + f(c.g) + f(c.b); }
  function darken(c, f) { return { r: c.r * f, g: c.g * f, b: c.b * f }; }
  function mixWhite(c, t) { return { r: c.r + (255 - c.r) * t, g: c.g + (255 - c.g) * t, b: c.b + (255 - c.b) * t }; }
  // 眼睛取对比色：深色毛→白眼，浅色毛→深眼，保证任何毛色下都清晰可见
  function contrastColor(c) { const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114; return lum < 140 ? '#FFF6E8' : '#3A2B22'; }

  // 像素猫猫头图案（12×11 网格）：X=描边 F=毛色 S=耳内浅色 E=眼睛 M=口鼻浅色 N=鼻子粉 W=眼神高光
  const CAT_MAP = [
    "..X......X..",
    ".XSX....XSX.",
    ".XFFFFFFFFX.",
    "XFFFFFFFFFFX",
    "XFFFFFFFFFFX",
    "XFFWEFFWEFFX",
    "XFFEEFFFEEFX",
    "XFFFMNNMFFFX",
    "XFFMMMMMMFFX",
    ".XFFFFFFFFX.",
    "..XXXXXXXX..",
  ];
  function buildCatHeadSVG(baseHex) {
    const base = hexToRgb(baseHex);
    const C = {
      'X': rgbToHex(darken(base, 0.45)),
      'F': rgbToHex(base),
      'S': rgbToHex(mixWhite(base, 0.22)),   // 耳内浅色（深色毛上也可见）
      'E': contrastColor(base),               // 对比眼色，深毛显白眼
      'M': rgbToHex(mixWhite(base, 0.42)),
      'N': '#E8899A',
      'W': '#FFFFFF',
    };
    const P = 8, rows = CAT_MAP.length, cols = CAT_MAP[0].length;
    let rects = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = CAT_MAP[r][c];
        if (ch === '.' || ch === ' ') continue;
        rects += `<rect x="${c * P}" y="${r * P}" width="${P}" height="${P}" fill="${C[ch]}"/>`;
      }
    }
    return `<svg viewBox="0 0 ${cols * P} ${rows * P}" width="100%" height="100%" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  }

  // 通用发色提取：对任意发色（金/青/粉/蓝/紫/红等）均有效。
  // 策略：图像上部 40%（头发区域）权重 ×3，下部（服装/皮肤）权重 ×1；
  //       跳过近黑/近白/灰阶/肤色像素；饱和度越高权重越大；最终结果微提亮。
  function extractHairColor(imgEl) {
    try {
      if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) return null;
      const w = 64, h = 64, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(imgEl, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data;
      const hairLine = Math.floor(h * 0.40);   // 上部 40% = 头发区域
      const buckets = {};
      for (let y = 0; y < h; y++) {
        const rowW = (y < hairLine) ? 3 : 1;     // 头发区域 3 倍权重
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          if (a < 128) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx < 40 || mn > 240) continue;       // 跳过近黑/近白
          const sat = (mx - mn) / Math.max(1, mx);
          if (sat < 0.10) continue;                // 跳过灰阶（皮肤/阴影）
          // 下半区跳过明显肤色：R>G>B 且色差小、饱和度中等
          const isSkin = (y >= hairLine) && (r > g && g > b) && (r - g < 45) && (g - b < 45) && (sat < 0.30);
          if (isSkin) continue;
          const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
          const wgt = rowW * (1 + sat * 3);        // 饱和度加成
          if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0, w: 0 };
          const o = buckets[key];
          o.r += r * wgt; o.g += g * wgt; o.b += b * wgt; o.n++; o.w += wgt;
        }
      }
      let best = null;
      for (const k in buckets) {
        const o = buckets[k];
        if (!best || o.w > best.score) best = { score: o.w, r: o.r / o.w, g: o.g / o.w, b: o.b / o.w };
      }
      if (!best) return null;
      // 微提亮，让猫头更可爱（暗色多提亮、亮色少提亮）
      let cr = best.r, cg = best.g, cb = best.b;
      const lum = cr * 0.299 + cg * 0.587 + cb * 0.114;
      const bf = lum < 170 ? 1.18 : 1.06;
      cr = Math.min(255, Math.round(cr * bf + 22));
      cg = Math.min(255, Math.round(cg * bf + 18));
      cb = Math.min(255, Math.round(cb * bf + 16));
      return rgbToHex({ r: Math.round(cr), g: Math.round(cg), b: Math.round(cb) });
    } catch (e) { return null }
  }
  function applyCatColor() {
    const img = $('pet-img');
    // 统一发色提取（支持金/青/粉/蓝/紫/红等任意发色）；提取失败则用浅金默认
    const base = extractHairColor(img) || '#F2D2A9';
    catColor = base; catSVG = buildCatHeadSVG(base);
    if (petDocked) $('pet-cat').innerHTML = catSVG;
  }

  // ---- 边缘检测：人物中心是否贴近某条窗口边缘 ----
  function petEdgeInfo() {
    const W = innerWidth, H = innerHeight;
    const x = petPos ? petPos.x : 0, y = petPos ? petPos.y : 0;
    const bw = parseInt(petEl.style.width) || 144, bh = parseInt(petEl.style.height) || 266;
    const cx = x + bw / 2, cy = y + bh / 2, SNAP = 42;
    if (cx <= SNAP) return 'left';
    if (cx >= W - SNAP) return 'right';
    if (cy <= SNAP) return 'top';
    if (cy >= H - SNAP) return 'bottom';
    return null;
  }

  // ---- 可爱互动特效：星光 + 小爱心粒子 ----
  function spawnSparkles() {
    const fx = $('pet-fx'); if (!fx) return;
    const pw = fx.parentElement.offsetWidth, ph = fx.parentElement.offsetHeight;
    const cx = pw / 2, cy = ph / 2;
    // 6 颗四角星光 + 4 颗小爱心
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div'); s.className = 'spark';
      const ang = Math.random() * Math.PI * 2, dist = 28 + Math.random() * 46;
      s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'px');
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.background = Math.random() < 0.5 ? '#FFD766' : '#FFF3C4';
      fx.appendChild(s);
      setTimeout(() => s.remove(), 780);
    }
    for (let i = 0; i < 4; i++) {
      const h = document.createElement('div'); h.className = 'heart';
      const ang = Math.random() * Math.PI * 2, dist = 22 + Math.random() * 36;
      h.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      h.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'px');
      h.style.left = cx + 'px'; h.style.top = cy + 'px';
      // 爱心颜色：粉红/浅红/玫瑰金
      const colors = ['#FF8FA0', '#FFB5C2', '#E8899A', '#FFD1DC'];
      h.style.background = colors[i % colors.length];
      fx.appendChild(h);
      setTimeout(() => h.remove(), 900);
    }
  }
  function playPop(dir) {
    try {
      const C = getAudioCtx(); if (!C) return;
      if (C.state === 'suspended') C.resume();
      const o = C.createOscillator(), g = C.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(dir === 'down' ? 520 : 700, C.currentTime);
      o.frequency.exponentialRampToValueAtTime(dir === 'down' ? 240 : 980, C.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, C.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, C.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, C.currentTime + 0.18);
      o.connect(g).connect(C.destination); o.start(); o.stop(C.currentTime + 0.2);
    } catch (e) {}
  }

  // ---- 停靠：人物 → 猫猫头 ----
  function dockToEdge(edge) {
    if (!catSVG) applyCatColor();
    const W = innerWidth, H = innerHeight, hw = CAT_W / 2, hh = CAT_H / 2;
    petEl.style.width = CAT_W + 'px'; petEl.style.height = CAT_H + 'px';
    let left = petPos ? petPos.x : (W - CAT_W) / 2;
    let top = petPos ? petPos.y : (H - CAT_H) / 2;
    if (edge === 'left') { left = CAT_W * 0.30 - hw; top = Math.max(8, Math.min(H - CAT_H - 8, top)); }
    else if (edge === 'right') { left = W - CAT_W * 0.30 - hw; top = Math.max(8, Math.min(H - CAT_H - 8, top)); }
    else if (edge === 'top') { top = CAT_H * 0.30 - hh; left = Math.max(8, Math.min(W - CAT_W - 8, left)); }
    else if (edge === 'bottom') { top = H - CAT_H * 0.30 - hh; left = Math.max(8, Math.min(W - CAT_W - 8, left)); }
    petPos = { x: left, y: top };
    petEl.style.left = left + 'px'; petEl.style.top = top + 'px';
    dockEdge = edge; petDocked = true;
    petEl.classList.add('docked');
    const img = $('pet-img'), cat = $('pet-cat');
    img.style.display = ''; img.classList.remove('pet-pop'); img.classList.add('pet-shrink');
    playPop('down');
    setTimeout(() => {
      img.classList.remove('pet-shrink'); img.style.display = 'none';
      cat.innerHTML = catSVG;
      cat.classList.remove('hidden', 'cat-pop'); void cat.offsetWidth; cat.classList.add('cat-pop');
      spawnSparkles();
    }, 240);
  }
  // ---- 还原：猫猫头 → 人物 ----
  function undockToChar() {
    const W = innerWidth, H = innerHeight, PW = 144, PH = 266;
    let left = petPos ? petPos.x : (W - PW) / 2;
    let top = petPos ? petPos.y : (H - PH) / 2;
    left = Math.max(8, Math.min(W - PW - 8, left));
    top = Math.max(8, Math.min(H - PH - 8, top));
    petPos = { x: left, y: top };
    petEl.style.left = left + 'px'; petEl.style.top = top + 'px';
    petEl.style.width = ''; petEl.style.height = '';   // 还原为 CSS 的 144×266
    petEl.classList.remove('docked');
    petDocked = false; dockEdge = null;
    const img = $('pet-img'), cat = $('pet-cat');
    cat.classList.remove('cat-pop'); cat.classList.add('cat-shrink');
    playPop('up');
    setTimeout(() => {
      cat.classList.add('hidden'); cat.classList.remove('cat-shrink');
      img.style.display = ''; img.classList.remove('pet-shrink'); img.classList.remove('pet-pop'); void img.offsetWidth; img.classList.add('pet-pop');
      spawnSparkles();
    }, 200);
  }

  // 立绘加载后（或启动时）提取毛色并生成猫猫头
  $('pet-img').addEventListener('load', applyCatColor);
  applyCatColor();

  // ---- UI 主题系统初始化 ----
  try {
    const raw = localStorage.getItem('pet-mini-theme');
    if (raw) { const saved = JSON.parse(raw); if (saved && saved.id) currentThemeId = saved.id; }
  } catch(e) {}
  applyTheme(currentThemeId);   // 应用保存的主题（或默认 UI1）
  initThemePicker();            // 生成色块选择器 DOM

  // ===================== 首次上传向导（仅上传角色，UI 不变）=====================
  let obPicked = false; // 是否已选过图
  function closeOnboard() {
    onboardOpen = false;
    const ob = $('onboard');
    if (ob) ob.classList.add('hidden');
    if (IS_ELECTRON) syncCapture();
  }
  async function initOnboarding() {
    try {
      const state = await api.characterGet();
      if (state && state.configured) {
        // 已配置：直接套用已保存形象（可在 UI 不变的前提下换角色图）
        if (state.src) { const img = $('pet-img'); img.src = state.src; }
        return; // 不显示向导
      }
    } catch (e) { /* 读取失败按未配置走向导 */ }

    // 未配置：显示首次上传向导
    const ob = $('onboard');
    if (!ob) return;
    ob.classList.remove('hidden');
    onboardOpen = true;
    if (IS_ELECTRON) syncCapture();

    const previewImg = $('ob-preview-img');
    if (previewImg) previewImg.onload = () => previewImg.classList.add('loaded');
    const doPick = async () => {
      try {
        const r = await api.characterPick();
        if (r && r.src) {
          $('pet-img').src = r.src;       // 实时换角色 + 自动重算猫头毛色
          if (previewImg) previewImg.src = r.src;
          obPicked = true;
          return r;
        }
      } catch (e) {}
      return null;
    };
    const pickBtn = $('ob-pick'), finishBtn = $('ob-finish'), skipBtn = $('ob-skip');
    if (pickBtn) pickBtn.onclick = async () => { await doPick(); };
    if (finishBtn) finishBtn.onclick = async () => {
      if (!obPicked) { const r = await doPick(); if (!r) return; } // 没选过就先选
      closeOnboard();
    };
    if (skipBtn) skipBtn.onclick = async () => {
      try { await api.characterSkip(); } catch (e) {}
      closeOnboard(); // 保留默认 assets/char-daily.png
    };
  }
  initOnboarding();

  // ===================== 角色拖动（在全屏窗口内移动角色本体）=====================
  $('pet').addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; e.preventDefault();
    petDrag = true; didPetDrag = false; dragActive = true;
    const p = getPetPos();
    petStart = { mouseX: e.clientX, mouseY: e.clientY, petX: p.x, petY: p.y };
    if (IS_ELECTRON) setCaptureMode(true);
  });
  $('pet-img').addEventListener('dragstart', (e) => e.preventDefault());

  // ===================== 面板拖拽（标题栏拖动，可拖到全屏任意处）=====================
  document.querySelectorAll('.panel').forEach((panel) => {
    const header = panel.querySelector('.panel-header') || panel.querySelector('.main-header');
    if (!header) {
      // 主菜单没有 header 元素，用整个面板顶部区域作为拖拽手柄
      if (panel.id === 'main-menu') {
        panel.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          // 只在设置视图下允许拖拽，且仅限顶部标题栏区域（修复5：不希望别的区域拖动）
          if (!mainMenuShowingSettings) return;
          // 排除：关闭按钮、所有表单元素、按钮、滚动区域（只允许.set-fixed-header标题栏拖拽）
          if (e.target.closest('.fn-overlay, .btn-close, input, textarea, select, button, label, .set-scroll-body, .tab-btn, .settings-tabs')) return;
          e.preventDefault();
          pDrag = true; dragActive = true;
          pStart = { panel, mx: e.clientX, my: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
          if (IS_ELECTRON) setCaptureMode(true);
        });
      }
      return;
    }
    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.btn-close, .main-close')) return; // 不拦截关闭按钮
      e.preventDefault();
      pDrag = true; dragActive = true;
      pStart = { panel, mx: e.clientX, my: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
      if (IS_ELECTRON) setCaptureMode(true);
    });
  });

  // ===================== 统一拖拽监听（只注册一次，杜绝 once:true 丢失监听→覆盖层卡死）=====================
  document.addEventListener('mousemove', (e) => {
    lastMX = e.clientX; lastMY = e.clientY;
    // 实时根据鼠标悬停位置切换捕获/穿透（仅在没有面板、没有拖拽时）
    if (!dragActive && !isAnyUIActive()) syncCapture();
    if (petDrag && petStart) {
      if (e.buttons !== 1) { endPetDrag(); return; }
      const W = window.innerWidth, H = window.innerHeight;
      let newX = petStart.petX + (e.clientX - petStart.mouseX);
      let newY = petStart.petY + (e.clientY - petStart.mouseY);
      newX = Math.max(-120, Math.min(W - 40, newX));
      newY = Math.max(-240, Math.min(H - 40, newY));
      if (petStart._lx === newX && petStart._ly === newY) return;
      petStart._lx = newX; petStart._ly = newY; didPetDrag = true; justDragged = true;
      petPos = { x: newX, y: newY };
      const pet = $('pet'); pet.style.left = newX + 'px'; pet.style.top = newY + 'px'; pet.style.bottom = 'auto';
      // 面板跟随角色移动
      const openPanel = PANEL_IDS.find((id) => !$(id).classList.contains('hidden'));
      if (openPanel) { positionPanelNearPet($(openPanel)); }
    }
    if (pDrag && pStart) {
      if (e.buttons !== 1) { endPanelDrag(); return; }
      const dx = e.clientX - pStart.mx, dy = e.clientY - pStart.my;
      const W = window.innerWidth, H = window.innerHeight;
      const pw = pStart.panel.offsetWidth, ph = pStart.panel.offsetHeight;
      // 至少保留 60px 在屏幕内，避免把面板拖丢
      let nl = Math.max(60 - pw, Math.min(W - 60, pStart.left + dx));
      let nt = Math.max(0, Math.min(H - 40, pStart.top + dy));
      pStart.panel.style.left = nl + 'px'; pStart.panel.style.top = nt + 'px'; pStart.panel.style.right = 'auto';
      justDragged = true;
    }
  }, { capture: true });

  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    if (petDrag) {
      const wasDocked = petDocked;
      const edge = petEdgeInfo();
      if (!didPetDrag) {
        // 单击：已是猫猫头则变回人物，否则正常戳一戳
        if (petDocked) undockToChar();
        else onPetClick();
      } else {
        // 拖拽结束：贴边则吸附成猫猫头；原本是猫猫头但被拖离边缘则变回人物
        if (edge) dockToEdge(edge);
        else if (wasDocked) undockToChar();
      }
      endPetDrag();
    }
    if (pDrag) { endPanelDrag(); }
  }, { capture: true });
  window.addEventListener('blur', () => { endPetDrag(); endPanelDrag(); });

  // ===================== 面板定位（跟随角色）=====================
  // 打开面板时自动放到角色附近（面板在角色右侧，不超出屏幕）
  function positionPanelNearPet(panel) {
    if (!panel) return;
    const pet = $('pet');
    const pr = pet.getBoundingClientRect();
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const W = window.innerWidth, H = window.innerHeight;
    // 默认放在角色右侧
    let left = pr.right + 12;
    let top = Math.max(8, pr.top - 12);
    // 如果右边放不下，改到角色左边
    if (left + pw > W - 8) { left = pr.left - pw - 12; }
    // 如果左边也放不下，贴右边缘
    if (left < 8) { left = W - pw - 8; }
    // 确保不超出下边界
    if (top + ph > H - 8) { top = H - ph - 8; }
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
  }
  function openPanelNearPet(id) {
    // 打开新面板前，先关闭所有其他面板（同时只显示一个）
    PANEL_IDS.forEach((pid) => { if (pid !== id) $(pid).classList.add('hidden'); });
    const p = $(id);
    const wasHidden = p.classList.contains('hidden');
    p.classList.remove('hidden');
    positionPanelNearPet(p);
    // 显示点击穿透捕获层（点它即关闭面板）
    $('panel-backdrop').classList.remove('hidden');
    syncCapture();
    return wasHidden;
  }
  async function doSee() { showBubble('让我看看你在干嘛…'); const r = await api.captureAndSee(); showBubble(r.text); }

  // ===================== 待办 =====================
  function todoMeta(t) { const p = []; if (t.time) p.push(`<span class="time">${esc(t.time)}</span>`); if (t.deadline) p.push(`<span class="date">${esc(t.deadline)}</span>`); return p.length ? `<div class="meta-row">${p.join(' ')}</div>` : ''; }
  function renderTodo(data) {
    const today = $('todo-today'); today.innerHTML = '';
    data.today.forEach((t) => { const li = document.createElement('li'); if (t.done) li.classList.add('done'); li.innerHTML = `<div class="todo-main"><input type="checkbox" ${t.done ? 'checked' : ''} data-id="${t.id}"><span class="text" title="${esc(t.text)}">${esc(t.text)}</span><button class="mini" data-del="${t.id}">-</button></div>${todoMeta(t)}`; today.appendChild(li); });
    const tpl = $('todo-templates'); tpl.innerHTML = '';
    data.templates.forEach((t) => { const li = document.createElement('li'); li.innerHTML = `<div class="todo-main"><span class="text" title="${esc(t.text)}">${esc(t.text)}</span>${todoMeta(t)}<button class="mini" data-tpldel="${t.id}">-</button></div>`; tpl.appendChild(li); });
    const his = $('todo-history'); his.innerHTML = '';
    data.history.forEach((t) => { const li = document.createElement('li'); li.innerHTML = `<div class="todo-main"><span class="text" title="${esc(t.text)}">${esc(t.text)}</span>${todoMeta(t)}<button class="mini" data-readd="${t.id}">+</button><button class="mini" data-hdel="${t.id}">-</button></div>`; his.appendChild(li); });
  }
  async function refreshTodo() { renderTodo(await api.todo.list()); }
  function toggleTodo() { const p = $('todo-panel'); if (p.classList.contains('hidden')) { openPanelNearPet('todo-panel'); refreshTodo(); } else { p.classList.add('hidden'); syncCapture(); } }
  $('btn-todo-add').onclick = async () => { const text = $('todo-text').value.trim(); if (!text) return; await api.todo.add(text, $('todo-deadline').value || null, $('todo-time').value || null); $('todo-text').value = ''; $('todo-deadline').value = ''; $('todo-time').value = ''; await refreshTodo(); };
  $('btn-tpl-add').onclick = async () => {
    const text = $('tpl-text').value.trim();
    if (!text) return;
    const result = await api.todo.addTemplate(text, null, $('tpl-time').value || null);
    $('tpl-text').value = '';
    $('tpl-time').value = '';
    if (result && result.templates && !result.templates.find(t => t.text === text)) {
      console.warn('[tpl] template not persisted, retrying...');
      await api.todo.addTemplate(text, null, $('tpl-time').value || null);
    }
    await refreshTodo();
  };
  $('todo-today').addEventListener('click', async (e) => { if (e.target.checked && e.target.dataset.id) { await api.todo.check(e.target.dataset.id); await refreshTodo(); showBubble('搞定一项 ✓'); } });
  $('todo-today').addEventListener('click', async (e) => { if (e.target.dataset.del) { await api.todo.remove(e.target.dataset.del); await refreshTodo(); } });
  $('todo-templates').addEventListener('click', async (e) => { if (e.target.dataset.tpldel) { await api.todo.delTemplate(e.target.dataset.tpldel); await refreshTodo(); } });
  $('todo-history').addEventListener('click', async (e) => { if (e.target.dataset.readd) { await api.todo.reAdd(e.target.dataset.readd); await refreshTodo(); } if (e.target.dataset.hdel) { await api.todo.delHistory(e.target.dataset.hdel); await refreshTodo(); } });

  // ===================== 长期记忆 =====================
  async function refreshMemory() {
    const items = await api.memory.list(); const ul = $('mem-list'); ul.innerHTML = '';
    if (!items.length) { ul.innerHTML = '<li class="empty">还没有记住的事，加一条试试~</li>'; return; }
    items.forEach((m) => { const li = document.createElement('li'); const cat = m.category ? (window.MEM_CAT[m.category] || '其他') : '其他'; li.innerHTML = `<span class="tag">${cat}</span><span>${m.key ? esc(m.key) + '：' : ''}${esc(m.value)}</span><button class="mini" data-memdel="${m.id}">-</button>`; ul.appendChild(li); });
  }
  window.MEM_CAT = { me: '关于你', us: '我们/关系', pref: '喜好', date: '重要日期', other: '其他' };
  $('btn-mem-add').onclick = async () => {
    const value = $('mem-value').value.trim(); const key = $('mem-key').value.trim(); const cat = $('mem-cat').value;
    if (!value) { showBubble('内容不能为空呀~'); return; }
    await api.memory.add(cat, key, value); $('mem-value').value = ''; $('mem-key').value = ''; await refreshMemory(); showBubble('记住啦 ✓');
  };
  $('mem-list').addEventListener('click', async (e) => { if (e.target.dataset.memdel) { await api.memory.remove(e.target.dataset.memdel); await refreshMemory(); } });
  $('btn-mem-export').onclick = async () => { const r = await api.exportMemory(); $('sync-msg').textContent = r.msg; };
  $('btn-mem-import').onclick = async () => { const r = await api.importMemory(); $('sync-msg').textContent = r.msg; if (r.ok) await refreshMemory(); };

  // ===================== 口头禅管理 =====================
  let catchphrases = [];
  function renderCatchphrases() {
    const ul = $('catchphrase-list'); ul.innerHTML = '';
    if (!catchphrases.length) { ul.innerHTML = '<li class="empty">还没有口头禅，加一句吧~</li>'; return; }
    catchphrases.forEach((cp, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="text">${esc(cp)}</span><button class="mini" data-cpdel="${i}">-</button>`;
      ul.appendChild(li);
    });
  }
  function loadCatchphrases() {
    try { catchphrases = JSON.parse(localStorage.getItem('pet-catchphrases') || '[]'); } catch(e) { catchphrases = []; }
    renderCatchphrases();
  }
  function saveCatchphrases() {
    localStorage.setItem('pet-catchphrases', JSON.stringify(catchphrases));
  }
  function addCatchphrase(text) {
    text = text.trim();
    if (!text) return;
    if (catchphrases.length >= 10) { showBubble('口头禅最多10条哦~'); return; }
    catchphrases.push(text); saveCatchphrases(); renderCatchphrases();
  }
  function removeCatchphrase(idx) {
    catchphrases.splice(idx, 1); saveCatchphrases(); renderCatchphrases();
  }
  function getRandomCatchphrase() {
    if (!catchphrases.length) return null;
    return catchphrases[Math.floor(Math.random() * catchphrases.length)];
  }
  // 暴露给其他模块使用
  window.getRandomCatchphrase = getRandomCatchphrase;
  window.getCatchphrases = () => [...catchphrases];
  window.addCatchphrase = addCatchphrase;

  $('btn-catchphrase-add').onclick = () => {
    const input = $('catchphrase-input');
    addCatchphrase(input.value);
    input.value = '';
  };
  $('catchphrase-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-catchphrase-add').click(); } });
  $('catchphrase-list').addEventListener('click', (e) => {
    if (e.target.dataset.cpdel != null) { removeCatchphrase(Number(e.target.dataset.cpdel)); }
  });
  loadCatchphrases();

  // ===================== 设置（含 Tab 切换 + 新功能选项）====================
  function splitList(str, sep) { return String(str || '').split(sep).map((s) => s.trim()).filter(Boolean); }

  // Tab 切换
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = $(tabId);
      if (target) target.classList.add('active');
    });
  });

  async function loadSettings() {
    const cfg = await api.getConfig(); const per = await api.getPersona();
    // AI 连接 tab
    $('cfg-key').value = cfg.apiKey || ''; $('cfg-model').value = cfg.model || ''; $('cfg-vision').value = cfg.visionModel || ''; $('cfg-base').value = cfg.baseUrl || '';
    $('cfg-autolearn').checked = !!cfg.autoLearn; $('cfg-ai').checked = !!cfg.aiEnabled; updateAiBadge(cfg.aiEnabled);
    // 口头禅
    loadCatchphrases();
    $('cfg-autoCatchphrase').checked = cfg.autoCatchphrase !== false; // default true
    // 人设与记忆 tab
    $('per-name').value = per.name || ''; $('per-age').value = (per.age != null && per.age !== '') ? per.age : ''; $('per-height').value = (per.height != null && per.height !== '') ? per.height : ''; $('per-birthday').value = per.birthday || ''; $('per-weight').value = per.weight || ''; $('per-job').value = per.job || ''; $('per-hobbies').value = Array.isArray(per.hobbies) ? per.hobbies.join(', ') : (per.hobbies || ''); $('per-traits').value = per.traits || ''; $('per-facts').value = Array.isArray(per.facts) ? per.facts.join('\n') : (per.facts || '');
    // 功能设定 tab
    $('cfg-alwaysTop').checked = cfg.alwaysTop !== false; // default true
    $('cfg-autoStart').checked = !!cfg.autoStart;
    $('cfg-proactive').checked = cfg.proactive !== false; // default true
    $('cfg-focusMin').value = cfg.focusMin || 30;
    // 界面音效
    $('cfg-sfx-off').checked = !!cfg.sfxOff;
    $('cfg-sfx-vol').value = (cfg.sfxVol != null) ? cfg.sfxVol : 60;
    sfxOn = !cfg.sfxOff;
    sfxVol = (cfg.sfxVol != null) ? cfg.sfxVol : 60;
    $('cfg-todoSpeak').checked = cfg.todoSpeak !== false; // 默认开启
    await refreshMemory();
    await refreshCharacterPicker();
  }

  // 人设旁「一次性人物形象选择」：仅当使用默认形象时提供入口，选后锁定不可改
  async function refreshCharacterPicker() {
    const box = $('char-pick-box'); if (!box) return;
    const preview = $('char-pick-preview');
    const status = $('char-pick-status');
    const pickBtn = $('btn-char-pick');
    const locked = $('char-pick-locked');
    try {
      const state = await api.characterGet();
      if (!state || !state.configured) { box.style.display = 'none'; return; } // 尚未完成首次向导
      box.style.display = 'flex';
      if (state.src) {
        preview.src = state.src; preview.style.display = 'block';
        pickBtn.style.display = 'none';
        locked.style.display = 'inline'; locked.textContent = '当前形象（已锁定，不可更改）';
        status.textContent = '你已选定桌宠的人物形象。';
      } else {
        preview.style.display = 'none';
        pickBtn.style.display = 'inline-block';
        locked.style.display = 'none';
        status.textContent = '你当前使用默认形象，可点击下方按钮选择一次人物形象：';
      }
    } catch (e) { box.style.display = 'none'; }
  }

  // 置顶切换即时生效
  $('cfg-alwaysTop').addEventListener('change', async (e) => {
    if (IS_ELECTRON) api.setAlwaysTop(e.target.checked);
  });

  function openSettings() {
    const p = $('settings-panel');
    const wasHidden = p.classList.contains('hidden');
    if (wasHidden) {
      p.classList.remove('hidden');
      positionPanelNearPet(p);
      // 强制重绘，解决 Windows 透明窗上面板内容不显示的问题
      void p.offsetHeight;
      $('panel-backdrop').classList.remove('hidden');
      loadSettings();
    } else {
      p.classList.add('hidden');
      $('panel-backdrop').classList.add('hidden');
    }
    syncCapture();
  }
  function toggleChat() { const p = $('chat-ui'); if (p.classList.contains('hidden')) { openPanelNearPet('chat-ui'); } else { p.classList.add('hidden'); syncCapture(); } }
  $('btn-test-cfg').onclick = async () => { const cfg = { apiKey: $('cfg-key').value.trim(), model: $('cfg-model').value.trim(), visionModel: $('cfg-vision').value.trim(), baseUrl: $('cfg-base').value.trim() }; $('cfg-test-msg').textContent = '测试中…'; const r = await api.testConfig(cfg); $('cfg-test-msg').textContent = r.msg; };

  $('btn-save-set').onclick = async () => {
    await api.saveConfig({
      apiKey: $('cfg-key').value.trim(),
      model: $('cfg-model').value.trim(),
      visionModel: $('cfg-vision').value.trim(),
      baseUrl: $('cfg-base').value.trim(),
      autoLearn: $('cfg-autolearn').checked,
      aiEnabled: $('cfg-ai').checked,
      alwaysTop: $('cfg-alwaysTop').checked,
      autoStart: $('cfg-autoStart').checked,
      proactive: $('cfg-proactive').checked,
      focusMin: Number($('cfg-focusMin').value) || 30,
      sfxOff: $('cfg-sfx-off').checked,
      sfxVol: Number($('cfg-sfx-vol').value) || 60,
      todoSpeak: $('cfg-todoSpeak').checked,
      autoCatchphrase: $('cfg-autoCatchphrase').checked,
    });
    // 界面音效：保存后立即应用（无需重开设置）
    sfxOn = !$('cfg-sfx-off').checked;
    sfxVol = Number($('cfg-sfx-vol').value) || 60;
    await api.savePersona({
      name: $('per-name').value.trim(),
      age: $('per-age').value === '' ? undefined : Number($('per-age').value),
      height: $('per-height').value === '' ? undefined : Number($('per-height').value),
      birthday: $('per-birthday').value.trim(),
      weight: $('per-weight').value.trim(),
      job: $('per-job').value.trim(),
      hobbies: splitList($('per-hobbies').value, /[,，；]/),
      traits: $('per-traits').value.trim(),
      facts: splitList($('per-facts').value, /\n/),
    });
    updateAiBadge($('cfg-ai').checked);
    showBubble('设置已保存~');
  };
  // 退出桌宠（现在由 mm-quit-tab 统一处理，这里保留兼容）
  const quitBtn = $('btn-quit-app');
  if (quitBtn) {
    quitBtn.onclick = () => {
      if (IS_ELECTRON && api.quit) { api.quit(); } else { window.close(); }
    };
  }
  // 新的退出 Tab 按钮也绑一次（防止遗漏）
  const quitTab = $('mm-quit-tab');
  if (quitTab) {
    // 已在上面统一处理，无需重复
  }
  $('btn-per-export').onclick = async () => { const r = await api.exportPersona(); $('sync-msg').textContent = r.msg; showBubble(r.ok ? '人设已导出 ✓' : '导出失败'); };
  $('btn-per-import').onclick = async () => { const r = await api.importPersona(); $('sync-msg').textContent = r.msg; if (r.ok) showBubble('人设已导入 ✓'); };
  // 人设旁：一次性选择人物形象（选后锁定）
  const charPickBtn = $('btn-char-pick');
  if (charPickBtn) charPickBtn.onclick = async () => {
    const r = await api.characterPick();
    if (r && r.src) {
      $('pet-img').src = r.src; // 实时换角色 + 自动重算猫头毛色
      showBubble('形象已确定啦，之后就不能改咯~');
      await refreshCharacterPicker();
    } else {
      showBubble('没有选择图片哦');
    }
  };
  function updateAiBadge(on) { const b = $('ai-badge'); if (!b) return; b.textContent = on ? 'AI 已开启' : 'AI 未开启'; b.classList.toggle('on', !!on); }

  // ===================== 主菜单面板（参考UI图片背景 + JS坐标映射点击）====================
  let mainMenuShowingSettings = false;
  function openMainMenu() {
    // 关闭其他面板
    ['chat-ui', 'todo-panel', 'settings-panel', 'pomodoro-panel'].forEach((id) => $(id).classList.add('hidden'));
    const mm = $('main-menu');
    mm.classList.remove('hidden');
    // 重置为功能视图（显示图片背景）
    mainMenuShowingSettings = false;
    $('main-set-content').classList.add('hidden');
    mm.style.backgroundImage = "url('" + currentThemeBg() + "')";
    // 移除设置模式CSS类
    mm.classList.remove('main-menu-settings');
    // 三 Tab 选中态：功能=选中（浅底深字），其他=未选中（深底浅字）
    document.querySelectorAll('.mm-tab-btn').forEach(b => b.classList.remove('active-tab'));
    $('mm-fn-tab').classList.add('active-tab');
    positionPanelNearPet(mm);
    void mm.offsetHeight; // 强制重绘
    $('panel-backdrop').classList.remove('hidden');
    syncCapture();
  }
  function switchMainTab(tab) {
    const mm = $('main-menu');
    // 先清除所有 Tab 的选中态
    document.querySelectorAll('.mm-tab-btn').forEach(b => b.classList.remove('active-tab'));

    if (tab === 'set') {
      mainMenuShowingSettings = true;
      $('main-set-content').classList.remove('hidden');
      mm.style.backgroundImage = 'none';
      // 防御：彻底隐藏 hover/flash 层
      $('main-hover').style.display = 'none';
      $('main-flash').style.display = 'none';
      mm.classList.add('main-menu-settings');
      // 设置=选中（浅底深字）
      $('mm-set-tab').classList.add('active-tab');
      loadSettings();
    } else {
      mainMenuShowingSettings = false;
      $('main-set-content').classList.add('hidden');
      mm.style.backgroundImage = "url('" + currentThemeBg() + "')";
      mm.classList.remove('main-menu-settings');
      // 功能=选中（浅底深字）
      $('mm-fn-tab').classList.add('active-tab');
    }
  }

  // ===================== 设置面板输入框防御保障 =====================
  // 确保点击设置面板内的输入框时能正常聚焦（防御性代码）
  const setContent = $('main-set-content');
  if (setContent) {
    setContent.addEventListener('click', (e) => {
      // 如果点击的是输入框或文本域，确保聚焦
      const target = e.target.closest('input, textarea, select');
      if (target) {
        requestAnimationFrame(() => {
          target.focus();
          console.log('[set-input] focused:', target.id || target.name || target.tagName);
        });
      }
    });
    // 阻止设置内容区表单元素的 mousedown 冒泡触发面板拖拽
    setContent.addEventListener('mousedown', (e) => {
      if (e.target.closest('input, textarea, select, label, button, .tab-btn')) {
        e.stopPropagation();
      }
    });
  }

  // ===================== 主菜单（PIL像素级精确坐标映射）====================
  // 面板 256×336，新图 1561×1971，scale: SX=0.1640, SY=0.1705
  // 坐标通过 PIL 浅色内区域扫描精确定位（2026-08-24 新UI图片重核）
  const MM_REGIONS = {
    // ×按钮：面板右上角，距上边缘 22px、距右边缘 12px（22×16）
    // 面板 256 宽 -> 右边界 256-12=244，左边界 244-22=222；y 22-38
    // 注意：此处与 styles.css 的 #mm-close 必须始终保持一致
    'close':       [222, 244, 22, 38],
    // 功能/设置 tab 改用 DOM 按钮 (.mm-tab-btn)，不再用坐标映射
    // 连通域扫描：阈值 R>230 G>190 B>130，排除棕色边框与顶部标签栏
    'chat':        [29, 118, 85, 176],     // 对话卡片内部（89×91）
    'see':         [135, 224, 85, 176],    // 看屏幕卡片内部（89×91）
    'todo':        [29, 121, 199, 290],    // 待办卡片内部（92×91）
    'pomodoro':    [135, 227, 199, 290],   // 番茄钟卡片内部（92×91）
  };
  function hitTestMainMenu(x, y) {
    for (const [fn, r] of Object.entries(MM_REGIONS)) {
      if (x >= r[0] && x <= r[1] && y >= r[2] && y <= r[3]) return fn;
    }
    return null;
  }
  function positionOverlay(el, fn) {
    const r = MM_REGIONS[fn];
    if (!r) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = r[0] + 'px'; el.style.top = r[2] + 'px';
    el.style.width = (r[1] - r[0]) + 'px'; el.style.height = (r[3] - r[2]) + 'px';
  }
  // 悬停高亮
  $('main-menu').addEventListener('mousemove', (e) => {
    if (mainMenuShowingSettings) { $('main-hover').style.display = 'none'; return; }
    const rect = $('main-menu').getBoundingClientRect();
    const fn = hitTestMainMenu(e.clientX - rect.left, e.clientY - rect.top);
    if (fn) { positionOverlay($('main-hover'), fn); }
    else { $('main-hover').style.display = 'none'; }
  });
  $('main-menu').addEventListener('mouseleave', () => { $('main-hover').style.display = 'none'; });
  // 点击
  $('main-menu').addEventListener('click', (e) => {
    if (mainMenuShowingSettings) return;
    const rect = $('main-menu').getBoundingClientRect();
    const fn = hitTestMainMenu(e.clientX - rect.left, e.clientY - rect.top);
    if (!fn) return;
    // 按下闪光反馈
    positionOverlay($('main-flash'), fn);
    const f = $('main-flash'); f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
    // 延迟执行动作（让用户看到闪光）
    setTimeout(() => {
      if (fn === 'close') { $('main-menu').classList.add('hidden'); $('panel-backdrop').classList.add('hidden'); syncCapture(); return; }
      // 功能/设置 tab 已改用 .mm-tab-btn DOM 按钮，不再走这里
      $('main-menu').classList.add('hidden');
      // 看屏幕不打开新面板，需要立即关闭遮罩层；其他面板会自己管理遮罩
      if (fn === 'see') { $('panel-backdrop').classList.add('hidden'); syncCapture(); doSee(); }
      else if (fn === 'chat') toggleChat();
      else if (fn === 'todo') toggleTodo();
      else if (fn === 'pomodoro') togglePomodoro();
    }, 150);
  });

  // 功能/设置/退出 Tab DOM 按钮点击（统一三Tab交互）
  document.querySelectorAll('.mm-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.id === 'mm-close') return;   // 关闭按钮×单独处理，见下方
      const tab = btn.dataset.tab;

      // 退出 Tab：直接退出，不做切换动画
      if (tab === 'quit') {
        // 闪光反馈
        const f = $('main-flash');
        f.style.display = 'block';
        f.style.left = btn.offsetLeft + 'px';
        f.style.top = btn.offsetTop + 'px';
        f.style.width = btn.offsetWidth + 'px';
        f.style.height = btn.offsetHeight + 'px';
        f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
        setTimeout(() => {
          if (IS_ELECTRON && api.quit) { api.quit(); } else { window.close(); }
        }, 120);
        return;
      }

      // 已在设置模式时，允许点"功能"切回去（不再 return 阻拦）
      if (mainMenuShowingSettings && tab !== 'fn') return;
      // 闪光反馈
      const f = $('main-flash');
      f.style.display = 'block';
      f.style.left = btn.offsetLeft + 'px';
      f.style.top = btn.offsetTop + 'px';
      f.style.width = btn.offsetWidth + 'px';
      f.style.height = btn.offsetHeight + 'px';
      f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
      setTimeout(() => {
        if (tab === 'set') switchMainTab('set');
        else switchMainTab('fn');
      }, 120);
    });
  });

  // 设置面板内关闭按钮
  document.getElementById('set-panel-close').onclick = () => {
    switchMainTab('fn'); // 回到功能视图
  };

  // 主菜单关闭按钮 ×（DOM 元素，与 Tab 栏同排、紧贴「退出」右侧）
  // 闪光反馈复用 MM_REGIONS['close'] 热区坐标，保持与卡片一致的视觉。
  // stopPropagation 是必须的：否则会冒泡到 #main-menu 的坐标映射，导致关闭逻辑执行两次。
  const mmCloseBtn = $('mm-close');
  if (mmCloseBtn) {
    mmCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      positionOverlay($('main-flash'), 'close');
      const fl = $('main-flash');
      fl.classList.remove('flash'); void fl.offsetWidth; fl.classList.add('flash');
      setTimeout(() => {
        $('main-menu').classList.add('hidden');
        $('panel-backdrop').classList.add('hidden');
        syncCapture();
      }, 150);
    });
  }

  // ===================== 番茄钟 =====================
  const RING_R = 54, RING_C = 2 * Math.PI * RING_R;
  function fmt(sec) { sec = Math.max(0, Math.floor(sec)); const m = String(Math.floor(sec / 60)).padStart(2, '0'); const s = String(sec % 60).padStart(2, '0'); return `${m}:${s}`; }
  function phaseLabel(ph) { return ph === 'work' ? '🍅 专注中' : ph === 'longBreak' ? '🛋️ 长休息' : '☕ 休息中'; }
  function renderPomo(s) {
    const total = s.phase === 'work' ? currentCfg.workMinutes * 60 : s.phase === 'longBreak' ? currentCfg.longBreakMinutes * 60 : currentCfg.breakMinutes * 60;
    const progress = Math.max(0, Math.min(1, s.remaining / total));
    const ring = $('pomo-ring-fg'); if (ring) { ring.style.strokeDasharray = RING_C; ring.style.strokeDashoffset = RING_C * (1 - progress); }
    $('pomo-time').textContent = fmt(s.remaining);
    $('pomo-phase').textContent = phaseLabel(s.phase);
    $('pomo-toggle').textContent = s.state === 'running' ? '⏸ 暂停' : '▶ 开始';
    $('pomo-today').textContent = s.todayCompleted; $('pomo-total').textContent = s.totalCompleted;
    document.body.dataset.pomoPhase = s.phase; document.body.dataset.pomoState = s.state;
  }
  let currentCfg = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };
  async function initPomo() { currentCfg = await api.pomodoro.getConfig(); const s = await api.pomodoro.getState(); renderPomo(s); $('pomo-work-min').value = currentCfg.workMinutes; $('pomo-break-min').value = currentCfg.breakMinutes; $('pomo-long-min').value = currentCfg.longBreakMinutes; $('pomo-long-interval').value = currentCfg.longBreakInterval; $('pomo-auto-break').checked = !!currentCfg.autoStartBreak;
    // 加载背景音设置
    const soundCfg = currentCfg.sound || {};
    $('pomo-sound-enable').checked = soundCfg.enable !== false;
    $('pomo-sound-type').value = soundCfg.type || 'rain';
    $('pomo-custom-sound').value = soundCfg.customPath || '';
    $('pomo-sound-volume').value = soundCfg.volume || 30;
    $('pomo-custom-sound-row').style.display = $('pomo-sound-type').value === 'custom' ? '' : 'none';
  }
  function togglePomodoro() { const p = $('pomodoro-panel'); if (p.classList.contains('hidden')) { openPanelNearPet('pomodoro-panel'); initPomo(); } else { p.classList.add('hidden'); syncCapture(); } }
  $('pomo-toggle').onclick = async () => { const s = await api.pomodoro.getState(); if (s.state === 'running') await api.pomodoro.pause(); else await api.pomodoro.start(); renderPomo(await api.pomodoro.getState()); };
  $('pomo-reset').onclick = async () => { await api.pomodoro.reset(); renderPomo(await api.pomodoro.getState()); };
  $('pomo-skip').onclick = async () => { await api.pomodoro.skip(); renderPomo(await api.pomodoro.getState()); };
  $('pomo-save-cfg').onclick = async () => {
    const cfg = { workMinutes: Number($('pomo-work-min').value) || 25, breakMinutes: Number($('pomo-break-min').value) || 5, longBreakMinutes: Number($('pomo-long-min').value) || 15, longBreakInterval: Number($('pomo-long-interval').value) || 4, autoStartBreak: $('pomo-auto-break').checked, autoStartWork: false,
      sound: { enable: $('pomo-sound-enable').checked, type: $('pomo-sound-type').value, customPath: $('pomo-custom-sound').value.trim(), volume: Number($('pomo-sound-volume').value) || 30 },
    };
    await api.pomodoro.saveConfig(cfg); currentCfg = cfg;
    // 如果当前是空闲状态，重置计时器以反映新设置的时长
    const s = await api.pomodoro.getState();
    if (s.state === 'idle') { await api.pomodoro.reset(); }
    showBubble('番茄钟设置已保存~');
    renderPomo(await api.pomodoro.getState());
  };
  api.on('pomodoro-tick', (s) => renderPomo(s));
  api.on('pomodoro-done', (ev) => {
    if (ev && ev.type === 'work-done') showBubble(ev.isLongBreak ? '🍅 番茄完成！长休息一下~' : '🍅 番茄完成！休息一下吧~');
    else showBubble('☕ 休息结束，继续加油！');
    stopPomoSound(); // 停止背景音
  });

  // ===================== 番茄钟背景音系统（治愈系长循环 Ambient）====================
  let pomoSoundCtx = null;
  let pomoNoiseNode = null;
  let pomoGainNode = null;
  let pomoCustomAudio = null;
  function getPomoSoundCtx() {
    if (!pomoSoundCtx) pomoSoundCtx = new (window.AudioContext || window.webkitAudioContext)();
    return pomoSoundCtx;
  }

  // 创建长循环治愈系环境音（10~15秒缓冲区，无缝循环）
  function createAmbientSound(type) {
    const ctx = getPomoSoundCtx();
    const dur = 12; // 12秒长缓冲区，循环更自然
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'rain') {
      // ===== 治愈雨声：多层滤波噪声 + 幅度调制 =====
      // 模拟雨滴落在不同表面的声音：高频沙沙 + 中频淅沥
      for (let i = 0; i < bufferSize; i++) {
        const t = i / ctx.sampleRate;
        // 基础白噪声
        let sample = (Math.random() * 2 - 1) * 0.25;
        // 低频分量：大雨滴的"咚咚"感（很弱的低频脉冲）
        sample += Math.sin(t * 0.3) * 0.03 * (Math.random() > 0.99 ? 1 : 0.1);
        // 极慢的音量起伏（模拟雨势变化），周期约8秒
        const rainEnvelope = 0.75 + 0.25 * Math.sin(t * 0.785);
        // 轻微的高频调制，让声音更"活"
        const shimmer = 0.95 + 0.05 * Math.sin(t * 7.3);
        data[i] = sample * rainEnvelope * shimmer * 0.4;
      }
      // 平滑首尾以实现无缝循环（淡入淡出交叉）
      const fadeLen = Math.floor(ctx.sampleRate * 0.5); // 0.5秒淡入淡出
      for (let i = 0; i < fadeLen; i++) {
        const env = i / fadeLen; // 0→1
        data[i] *= env;
        data[bufferSize - 1 - i] *= env;
      }

    } else if (type === 'waves') {
      // ===== 治愈海浪声：低频振荡 + 噪声包络 + 深海共鸣 =====
      // 模拟海浪的呼吸感：约7秒一个波浪周期
      let phase = 0;
      for (let i = 0; i < bufferSize; i++) {
        const t = i / ctx.sampleRate;
        // 主波浪包络：正弦波模拟潮汐 (~0.14Hz)
        const waveEnv = (Math.sin(phase) + 1) * 0.5;
        phase += 0.009 + 0.002 * Math.sin(t * 0.11); // 稍微不规则的周期

        // 低频噪声：海水涌动/气泡声
        const lowNoise = (Math.random() * 2 - 1) * 0.12;
        // 中频噪声：浪花碎裂
        const midNoise = (Math.random() * 2 - 1) * 0.05 * waveEnv;

        // 深海低频共振（非常低频的正弦成分）
        const deepResonance = Math.sin(t * 0.06) * 0.04 * waveEnv;
        // 次谐波：增加厚度
        const subHarmonic = Math.sin(t * 0.12) * 0.025 * waveEnv;

        // 组合并应用包络
        let sample = (lowNoise + midNoise + deepResonance + subHarmonic);
        // 整体缓慢的音量呼吸
        const breath = 0.85 + 0.15 * Math.sin(t * 0.055);
        data[i] = sample * breath * 0.45;
      }
      // 首尾平滑
      const fadeLen = Math.floor(ctx.sampleRate * 1.5); // 1.5秒淡入淡出（海浪需要更长）
      for (let i = 0; i < fadeLen; i++) {
        const env = i / fadeLen;
        const smooth = env * env * (3 - 2 * env); // smoothstep
        data[i] *= smooth;
        data[bufferSize - 1 - i] *= smooth;
      }

    } else if (type === 'birds') {
      // ===== 治愈森林鸟鸣：安静背景 + 稀疏自然 chirp =====
      // 大部分时间安静（极低底噪），偶尔有鸟鸣
      for (let i = 0; i < bufferSize; i++) {
        data[i] = 0;
      }
      // 生成随机鸟鸣 chirp
      let pos = Math.floor(Math.random() * 2 * ctx.sampleRate); // 第一个chirp在0-2秒间
      while (pos < bufferSize - 3000) {
        // 每只鸟的 chirp 参数
        const chirpDur = 400 + Math.random() * 800; // 0.4-1.2秒
        const baseFreq = 2000 + Math.random() * 2500; // 2-4.5kHz
        const startFreqMul = 0.75 + Math.random() * 0.3; // 起始频率偏移
        const startFreq = baseFreq * startFreqMul;

        // 生成单个 chirp
        for (let j = 0; j < chirpDur && pos + j < bufferSize; j++) {
          const t = j / chirpDur;
          // 频率轨迹：先升后降（典型鸟鸣）
          const freqMod = 1 + t * 0.4 - t * t * 0.6;
          const freq = startFreq * freqMod;
          // 包络：快速起音 + 指数衰减 + 轻微颤音
          const env = Math.exp(-t * 2.5) * 0.1;
          const vibrato = 1 + 0.003 * Math.sin(j * 0.4);
          data[pos + j] += Math.sin(j * freq * 2 * Math.PI / ctx.sampleRate) * env * vibrato;
        }
        // 下一次鸣叫间隔：1-5秒（大部分时间安静）
        pos += chirpDur + Math.floor(ctx.sampleRate * (1 + Math.random() * 4));
      }
      // 极低底噪（森林环境音，几乎听不见但避免完全静音）
      for (let i = 0; i < bufferSize; i++) {
        data[i] += (Math.random() * 2 - 1) * 0.006;
      }
      // 首尾平滑（较短的淡入淡出，因为鸟鸣本身就很稀疏）
      const fadeLen = Math.floor(ctx.sampleRate * 0.3);
      for (let i = 0; i < fadeLen; i++) {
        const env = i / fadeLen;
        data[i] *= env;
        data[bufferSize - 1 - i] *= env;
      }

    } else { // fallback: 白噪音
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }
  // 背景音音频文件映射（相对 index.html 的 assets 路径，打包后仍在 resources 内可读取）
  const POMO_SOUND_FILES = {
    rain: 'assets/sounds/rain.mp3',
    waves: 'assets/sounds/waves.mp3',
    wind: 'assets/sounds/wind.mp3',
    nature: 'assets/sounds/nature.mp3',
  };
  function startPomoSound() {
    stopPomoSound();
    try {
      const enable = $('pomo-sound-enable').checked;
      const type = $('pomo-sound-type').value;
      const vol = ($('pomo-sound-volume').value || 30) / 100;
      if (!enable || !type) return;
      if (type === 'custom') {
        const path = ($('pomo-custom-sound') || {}).value || '';
        if (!path) { showBubble('请先填写自定义音频文件路径'); return; }
        pomoCustomAudio = new Audio(path);
      } else {
        const f = POMO_SOUND_FILES[type];
        if (!f) return;
        pomoCustomAudio = new Audio(f);
      }
      pomoCustomAudio.loop = true;
      pomoCustomAudio.volume = vol;
      pomoCustomAudio.play().catch(() => showBubble('背景音播放失败，请检查音频文件'));
    } catch(e) { showBubble('背景音启动失败: ' + e.message); }
  }
  function stopPomoSound() {
    try {
      if (pomoNoiseNode) { try{pomoNoiseNode.stop();}catch(e){} pmoNoiseNode=null; }
      if (pomoCustomAudio) { pomoCustomAudio.pause(); pomoCustomAudio=null; }
      if (pomoGainNode) { try{pomoGainNode.disconnect();}catch(e){} pmoGainNode=null; }
    } catch(e){}
  }
  // 音效类型切换时显示/隐藏自定义路径
  $('pomo-sound-type').addEventListener('change', () => {
    $('pomo-custom-sound-row').style.display = $('pomo-sound-type').value === 'custom' ? '' : 'none';
  });
  // 音量滑块实时生效（拖动中即调节正在播放的背景音）
  $('pomo-sound-volume').addEventListener('input', () => {
    if (pomoCustomAudio) pomoCustomAudio.volume = ($('pomo-sound-volume').value || 30) / 100;
  });
  // 番茄钟开始/暂停时控制背景音
  const _origToggle = $('pomo-toggle').onclick;
  $('pomo-toggle').onclick = async () => {
    await _origToggle.call($('pomo-toggle'), event);
    const s = await api.pomodoro.getState();
    if (s.state === 'running') startPomoSound(); else stopPomoSound();
  };
  const _origReset = $('pomo-reset').onclick;
  $('pomo-reset').onclick = async () => { await _origReset.call($('pomo-reset'), event); stopPomoSound(); };
  const _origSkip = $('pomo-skip').onclick;
  $('pomo-skip').onclick = async () => { await _origSkip.call($('pomo-skip'), event); stopPomoSound(); };

  // ===================== 待办语音朗读（TTS） =====================
  let _ttsVoices = [];
  function cacheVoices() { try { _ttsVoices = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() : []; } catch (e) {} }
  if ('speechSynthesis' in window) { try { cacheVoices(); window.speechSynthesis.onvoiceschanged = cacheVoices; } catch (e) {} }
  function speakText(text) {
    if (!text || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      const zh = _ttsVoices.find(v => /^zh|chinese|china/i.test(v.lang) || /中文|普通话|晓|Yaoyao|Huihui|Kangkang/i.test(v.name));
      if (zh) u.voice = zh;
      u.rate = 1.0; u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ===================== 待办提醒（时间到→人物晃动+气泡+语音）=====================
  let todoRemindActive = false;      // 是否正在提醒中
  let todoRemindTimer = null;        // 晃动动画定时器
  let remindedTodoIds = new Set();   // 已提醒过的todo ID（避免重复）
  function startTodoRemind(todoText, speak) {
    if (todoRemindActive) return;
    todoRemindActive = true;
    const pet = $('pet');
    pet.classList.add('shake'); // 先晃一下
    const line = todoText ? `提醒你一下~ 该${todoText}啦` : '有件待办到时间啦~';
    // 持续晃动：每1.5秒晃一次
    todoRemindTimer = setInterval(() => {
      pet.classList.remove('shake'); void pet.offsetWidth;
      pet.classList.add('shake');
      // 随机说口头禅
      const cp = getRandomCatchphrase();
      if (cp) showBubble(cp);
    }, 1500);
    // 立即说一次待办内容
    showBubble(line);
    if (speak) speakText(line);
  }
  function stopTodoRemind() {
    if (!todoRemindActive) return;
    todoRemindActive = false;
    if (todoRemindTimer) { clearInterval(todoRemindTimer); todoRemindTimer = null; }
    $('pet').classList.remove('shake');
  }
  // 点击人物停止提醒
  document.getElementById('pet').addEventListener('click', () => {
    if (todoRemindActive) { stopTodoRemind(); showBubble('好啦好啦，我知道啦~'); }
  });
  // 每30秒检查待办时间
  async function checkTodoReminders() {
    try {
      const data = await api.todo.list();
      if (!data || !data.today) return;
      const cfg = await api.getConfig().catch(() => ({}));
      const speak = !cfg || cfg.todoSpeak !== false; // 默认开启语音朗读
      const now = new Date();
      const hh = String(now.getHours()).padStart(2,'0');
      const mm = String(now.getMinutes()).padStart(2,'0');
      const nowStr = `${hh}:${mm}`;
      for (const t of data.today) {
        if (t.done || !t.time || remindedTodoIds.has(t.id)) continue;
        if (t.time <= nowStr) {
          remindedTodoIds.add(t.id);
          startTodoRemind(t.text, speak);
          break; // 一次只提醒一个
        }
      }
    } catch(e) {}
  }
  setInterval(checkTodoReminders, 30000); // 每30秒检查
  setTimeout(checkTodoReminders, 5000);   // 启动5秒后首次检查

  // ===================== 口头禅每周自动选取（从聊天记忆）=====================
  const CP_AUTO_KEY = 'pet-cp-last-auto-week'; // 存储上次自动更新的周数
  function getCurrentWeek() {
    const d = new Date();
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }
  async function tryAutoCatchphrase() {
    try {
      // 检查是否启用
      const cfg = await api.getConfig();
      if (cfg.autoCatchphrase === false) return;
      // 检查本周是否已更新过
      const lastWeek = Number(localStorage.getItem(CP_AUTO_KEY) || 0);
      const thisWeek = getCurrentWeek();
      if (lastWeek === thisWeek) return;
      // 检查是否已有足够多的口头禅
      if (catchphrases.length >= 8) return; // 接近上限就不自动加了
      // 获取聊天记忆
      const mems = await api.memory.list();
      if (!mems || mems.length < 3) return;
      // 用 AI 从记忆中提取口头禅
      const memText = mems.slice(-10).map(m => m.value).join('\n');
      const result = await api.chat([{
        role: 'user',
        content: `从以下聊天记忆中提取${Math.min(3, 10 - catchphrases.length)}句适合作为桌宠口头禅的短句（≤12字，可爱/俏皮/日常口语风格）。只输出JSON字符串数组，不要其他内容。\n\n记忆：\n${memText}`
      }]);
      // 解析结果
      const arr = JSON.parse(String(result || '[]').replace(/```json|```/g, '').trim());
      if (!Array.isArray(arr)) return;
      let added = 0;
      for (const phrase of arr) {
        const p = String(phrase || '').trim();
        if (!p || p.length > 15) continue;
        if (catchphrases.includes(p)) continue; // 去重
        addCatchphrase(p);
        added++;
      }
      if (added > 0) {
        localStorage.setItem(CP_AUTO_KEY, thisWeek);
        console.log(`[auto-cp] 本周自动添加 ${added} 条口头禅`);
      }
    } catch(e) { console.log('[auto-cp] 自动更新口头禅失败:', e.message); }
  }
  // 启动时检查一次，之后每天检查一次是否到了新的一周
  setTimeout(tryAutoCatchphrase, 10000); // 启动10秒后检查
  setInterval(tryAutoCatchphrase, 24 * 60 * 60 * 1000); // 每天检查一次

  // ===================== 主进程推送事件 =====================
  api.on('proactive-say', (text) => { if (typeof text === 'string') { showBubble(text); logLine('pet', text); } });
  api.on('show-todos', (data) => { if (!$('todo-panel').classList.contains('hidden')) renderTodo(data); });

  // ===================== 右键功能菜单 =====================
  const ctx = $('ctx-menu');
  const CTX_W = 150, CTX_H = 220;
  function showCtx(e) {
    const PAD = 6, SPAD = 12; const ox = e.clientX, oy = e.clientY; const W = window.innerWidth, H = window.innerHeight;
    const minX = PAD, maxX = Math.max(PAD, W - PAD - CTX_W), minY = PAD, maxY = Math.max(PAD, H - PAD - CTX_H);
    const cX0 = 40, cX1 = 220, cY0 = 40, cY1 = 260;
    const hitChar = (px, py) => px < cX1 && px + CTX_W > cX0 && py < cY1 && py + CTX_W > cY0;
    const inB = (px, py) => px >= minX && px <= maxX && py >= minY && py <= maxY;
    const tries = [{ x: ox, y: oy }, { x: ox - CTX_W - 4, y: oy }, { x: ox, y: oy - CTX_H - 4 }, { x: ox - CTX_W - 4, y: oy - CTX_H - 4 }, { x: cX1 + 4, y: Math.max(minY, Math.min(oy, maxY)) }];
    let placed = tries.find((t) => inB(t.x, t.y) && !hitChar(t.x, t.y)) || { x: Math.max(minX, Math.min(cX1 + 4, maxX)), y: Math.max(minY, Math.min(oy, maxY)) };
    placed.x = Math.max(minX, Math.min(maxX, placed.x)); placed.y = Math.max(minY, Math.min(maxY, placed.y));
    ctx.style.left = placed.x + 'px'; ctx.style.top = placed.y + 'px'; ctx.classList.remove('hidden'); syncCapture();
  }
  function hideCtx() { ctx.classList.add('hidden'); syncCapture(); }
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('#chat-ui, #todo-panel, #settings-panel, #pomodoro-panel, #main-menu')) { e.preventDefault(); return; } e.preventDefault(); openMainMenu(); });
  ctx.addEventListener('click', (e) => { const item = e.target.closest('.ctx-item'); if (!item) return; const act = item.dataset.act; hideCtx(); if (act === 'chat') toggleChat(); else if (act === 'see') doSee(); else if (act === 'todo') toggleTodo(); else if (act === 'set') openSettings(); else if (act === 'pomodoro') togglePomodoro(); });

  // ===================== 点击面板/人物外自动关闭 =====================
  function isInsideUI(t) { return t.closest('#pet, #ctx-menu, #chat-ui, #todo-panel, #settings-panel, #pomodoro-panel, #main-menu, .panel-header, .main-header'); }
  function closeAllPanels() { ['chat-ui', 'todo-panel', 'settings-panel', 'pomodoro-panel', 'main-menu'].forEach((id) => $(id).classList.add('hidden')); $('panel-backdrop').classList.add('hidden'); syncCapture(); }
  document.addEventListener('click', (e) => {
    // 刚结束拖拽，忽略松手后的那次 click，避免误关面板
    if (justDragged) { justDragged = false; return; }
    // 关闭按钮
    if (e.target.closest('.btn-close')) { closeAllPanels(); hideCtx(); return; }
    // 右键菜单外部
    if (!ctx.contains(e.target)) hideCtx();
    // 面板/角色外部 → 关闭所有面板
    if (!isInsideUI(e.target)) { closeAllPanels(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideCtx(); closeAllPanels(); } });

  // 点击穿透捕获层：点面板/人物以外的区域 → 关闭所有面板与右键菜单
  // 用 pointerdown（比 click 更早触发，且在捕获模式下必定能收到）
  $('panel-backdrop').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (justDragged) { justDragged = false; return; }
    closeAllPanels(); hideCtx();
  });

  // ===================== 工具 =====================
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ===================== 启动 =====================
  $('pet-img').addEventListener('error', () => { $('pet-img').style.display = 'none'; $('pet-ph').style.display = 'flex'; });
  initPomo();
})();
