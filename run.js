#!/usr/bin/env node
// 跨平台启动器：在启动 Electron 前彻底移除 ELECTRON_RUN_AS_NODE。
// 某些 Agent / IDE（Claude Code、WorkBuddy 等）会向子进程注入该变量=1，
// 导致 Electron 以「纯 Node 模式」运行，require('electron') 返回路径字符串、
// app 为 undefined、窗口无法创建。必须在启动前删除它。
const { spawn } = require('child_process');
const path = require('path');

delete process.env.ELECTRON_RUN_AS_NODE;
const leakKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'ELECTRON_RUN_AS_NODE');
if (leakKey) delete process.env[leakKey];

const electronBin = path.join(__dirname, 'node_modules', '.bin', 'electron');
const child = spawn(electronBin, ['.'], { stdio: 'inherit', shell: true, cwd: __dirname });

child.on('error', (err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code === null ? 1 : code));
