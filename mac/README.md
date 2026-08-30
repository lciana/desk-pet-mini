# 桌宠 Mini —— macOS 版

Windows 版的所有内容与行为**完全不变**，Mac 版是在其基础上的纯增量适配。

---

## 一、为什么 Windows 上打不出 Mac 包

electron-builder 有硬性限制：

```
⨯ Build for macOS is supported only on macOS
```

`dmg` 依赖 macOS 的 `hdiutil`，`.app` 的签名/公证也只能在 macOS 完成。
所以**在这台 Windows 电脑上无法直接产出可安装的 Mac 包**——配置与代码适配已全部做好，
只差最后一步「在 macOS 上执行构建」，下面给你两条路。

---

## 二、产出 Mac 安装包的两种方式

### 方式 A：有 Mac 电脑（最快，几分钟）

1. 把整个项目文件夹拷到 Mac（**不要拷 `node_modules/` 和 `dist/`**，拷过去也用不了，Mac 需要重新下载 macOS 版的 Electron）。
2. 终端执行：

```bash
cd 桌宠Mini目录
chmod +x mac/build-mac.sh
./mac/build-mac.sh              # 自动识别本机架构
# 或指定：./mac/build-mac.sh arm64 | x64 | universal
```

3. 产物在 `dist/`：`桌宠Mini-1.0.0-mac-arm64.dmg`（安装盘）与 `.zip`（绿色版，解压即可用）。

### 方式 B：没有 Mac，用 GitHub Actions（免费，云端构建）

1. 把项目推送到 GitHub 仓库。**本地 git 仓库已初始化并提交好**，你只需：
   - 在 https://github.com/new 建一个空仓库（**不要**勾 README / .gitignore / License）
   - 双击运行 `mac/push-to-github.bat`，粘贴仓库地址回车

   手动执行的话，等价命令：

   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M master
   git push -u origin master
   ```

   > GitHub 已不支持密码登录，弹窗时**密码处填 Personal Access Token**
   > （Settings → Developer settings → Personal access tokens 生成）。

2. 仓库页面 → **Actions** → **Build macOS** → **Run workflow** → 选架构（Apple 芯片选 `arm64`，Intel 选 `x64`）→ 运行。
3. 约 10 分钟后，在运行结果页下载 `桌宠Mini-macOS-arm64` 产物，里面就是 `.dmg` 和 `.zip`。

**注意**：必须带上 `assets/vosk-models/*.zip`（41.9MB 中文语音模型），缺了打包后就没有离线语音。
已在 `.gitignore` 中确认它**不会**被忽略；同时 `tools/nsistools/`（9MB 的 Windows NSIS 工具链）已排除、不入库。

> 双击 `dist/*.dmg`，把「桌宠Mini」拖进 Applications 即可安装。

---

## 三、首次打开的注意事项（未签名应用）

没有 Apple 开发者证书，应用未签名，macOS 会拦截：

- 提示「无法打开，因为它来自身份不明的开发者」时：
  **右键点击应用 → 打开 → 确认打开**。只需做一次，之后双击即可正常启动。
- 若仍被拦截：系统设置 → 隐私与安全性 → 仍要打开。
- 有 Apple 开发者账号的话，把证书名填进 `package.json` 的 `build.mac.identity` 即可签名（当前为 `null`，即跳过签名）。

---

## 四、Mac 上需要授予的权限

| 功能 | 需要的权限 | 说明 |
|------|-----------|------|
| 语音输入对话 | **麦克风** | 首次使用语音输入时系统弹窗，点「好」 |
| 看屏幕 | **屏幕录制** | 首次「看屏幕」时弹窗；需到 系统设置 → 隐私与安全性 → 屏幕录制 中勾选 |
| 窗口置顶 / 全局快捷键 | 辅助功能（如被询问） | 通常不需要 |

权限说明文案已写进 `Info.plist`（`package.json` 的 `build.mac.extendInfo`）——
**这两项必须保留**，否则 macOS 会直接拒绝授权，「看屏幕」和语音输入会失效。

---

## 五、这次为 Mac 做了哪些适配

全部改动都在平台分支内（`IS_MAC` / `IS_WIN`），Windows 运行时走的是原来的代码路径。

| 项 | Windows（原行为，未动） | macOS（新增） |
|----|------------------------|--------------|
| 硬件加速 | 关闭（保证透明窗正常） | 保持开启（透明窗系统原生支持，关了拖累 Retina） |
| 任务栏 / Dock | `skipTaskbar: true` | `app.dock.hide()` 隐藏 Dock 图标 |
| 隐藏时机 | — | **托盘创建成功后**才隐藏，避免托盘失败导致桌宠失联无法退出 |
| 截图处理 | 接管 PrintScreen / Win+Shift+S / Shift+PrintScreen / Win+Alt+A，临时解除置顶 | **不接管任何快捷键**，改用 `setContentProtection(true)` 让桌宠从截图/录屏中隐身 |
| 托盘图标 | 原图直接使用 | 缩到 32px（菜单栏仅 16pt，大图会被压糊） |
| 跨桌面空间 | — | `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true})`，切桌面/全屏 App 时桌宠不消失 |
| 退出快捷键 | Ctrl+Q / Alt+F4 | 追加 Cmd+Q |
| 应用图标 | `build/icon.ico` | 新增 `mac/icon.icns`（由 ico 生成，含 Retina 2x 尺寸） |

### 文件分布

**`mac/` 目录（Mac 专属，可整体打包带走）**

| 文件 | 用途 |
|------|------|
| `README.md` | 本说明 |
| `build-mac.sh` | Mac 本机一键构建脚本 |
| `make-icns.py` | 从 `build/icon.ico` 生成 Mac 图标 |
| `icon.icns` | Mac 应用图标（547KB） |
| `push-to-github.bat` | Windows 双击推送到 GitHub |

**留在原位、不能移动的文件**：

- `.github/workflows/build-mac.yml` —— GitHub Actions **强制**要求 workflow 位于 `.github/workflows/`，
  移走即刻失效
- `main.js` —— 7 处 Mac 平台分支内联在代码中（`IS_MAC` / `IS_WIN`），拆出来会破坏应用本体
- `package.json` —— `mac` / `dmg` 配置段内联在此；`win` / `nsis` 段原样未动
- `.gitignore` —— Mac 与 Windows 共用

> 也就是说：Mac 支持是**内联**在 Windows 项目里的，除了 `mac/` 目录下这 5 个文件可以独立存放，
> 其余部分必须与主程序同在。

---

## 六、截图处理：Mac 版采用「窗口防截屏」（已确认方案）

Mac 版**不接管任何截图快捷键**，改用窗口级防截屏：

```js
win.setContentProtection(true);   // 仅 macOS 分支
```

**效果**：桌宠不会出现在系统截图（Cmd+Shift+3/4/5）、录屏和屏幕共享/会议画面中，
系统截图功能完全不受影响，按一次就截图，不需要「按两次」。

**代价**：你想录屏或开会共享屏幕来展示桌宠时，也录不到它。

**改回来**：把 `main.js` 中 `win.setContentProtection(true)` 的 `true` 改成 `false` 即可。

> Windows 版保持原设计不变（接管 PrintScreen / Win+Shift+S / Win+Alt+A 并临时解除置顶 1.5 秒），
> 这是你一直在用的行为，未做改动。
