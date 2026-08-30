# 有 Mac 之后怎么操作

从零开始，把桌宠 Mini 打包成 macOS 安装包。全程约 **15 分钟**（首次），命令只有 4 条。

---

## 第 0 步：确认你的 Mac 是哪种芯片

点屏幕左上角  → **关于本机**，看「芯片」一行：

| 显示 | 架构 | 构建时选 |
|---|---|---|
| Apple M1 / M2 / M3 / M4 | arm64 | `arm64` |
| Intel Core | x64 | `x64` |

> 不指定也行，脚本会自动识别（`uname -m`）。
> 如果这台包要给两种 Mac 都能用，选 `universal`（体积约 2 倍）。

---

## 第 1 步：把项目弄到 Mac 上

源码在 `G:\desktop-pet\pet-mini`，三选一：

**方式 A：U 盘 / 移动硬盘**（最省事）
```
拷整个 pet-mini 文件夹，但【跳过】这三个：
  ✗ node_modules\    （Windows 版的依赖，Mac 用不了）
  ✗ dist\            （Windows 构建产物）
  ✗ tools\nsistools\ （Windows NSIS 工具链，9MB）
```
拷贝后约 **119MB**（主要是 42MB 的中文语音模型 + 20MB 的 UI 图）。

**方式 B：网盘 / 微信文件传输**
同上，打包成 zip 再传。

**方式 C：git clone**（如果已经推到 GitHub）
```bash
git clone https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>
```
这个方式最干净，`.gitignore` 已配好，不会拉到 `node_modules` 和 `dist`。

> ⚠️ 建议把文件夹放在**路径不含空格**的位置，例如 `~/Desktop/desk-pet`，避免个别工具对空格处理出问题。中文路径一般没问题。

---

## 第 2 步：Mac 上安装 Node.js

打开 **终端**（Command + 空格 搜「终端」），先看看有没有：

```bash
node -v
```

- 显示 `v20.x.x` 或更高 → 已装，跳过本步
- 显示 `command not found` → 去 https://nodejs.org 下载 **LTS** 版安装

装完再执行一次 `node -v` 确认。

<details>
<summary>用 Homebrew 装（可选）</summary>

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
```
</details>

---

## 第 3 步：执行构建

在终端里，进入项目目录（把路径换成你实际放的）：

```bash
cd ~/Desktop/desk-pet          # ← 换成你的路径
chmod +x mac/build-mac.sh
./mac/build-mac.sh
```

想要指定架构就加参数：

```bash
./mac/build-mac.sh arm64       # Apple 芯片
./mac/build-mac.sh x64         # Intel
./mac/build-mac.sh universal   # 通用包
```

**脚本会自动做这些事**，你不用管：

1. 检查是不是在 macOS 上运行（不是则报错退出）
2. 若没有 `node_modules`，自动 `npm install`（下载 macOS 版 Electron，约 100MB，这一步最慢）
3. 若缺 `mac/icon.icns` 才用 Python 生成（**现在已经有了，会跳过**）
4. 执行 `electron-builder --mac`
5. 列出产物

首次运行大约 **5～15 分钟**；之后有了 `node_modules`，重跑只要 1～2 分钟。

---

## 第 4 步：拿到产物

构建完成后，产物在项目下的 `dist/` 目录：

```
dist/
  桌宠Mini-1.0.0-mac-arm64.dmg     ← 安装盘（推荐）
  桌宠Mini-1.0.0-mac-arm64.zip     ← 绿色版，解压即用
```

**用 dmg（推荐）**
双击 `.dmg` → 把「桌宠Mini」图标**拖进 Applications 文件夹** → 完成。之后从启动台或 Applications 里打开。

**用 zip（绿色版，免安装）**
解压后把 `桌宠Mini.app` 拖到任意位置（比如 Applications），双击运行。适合不想走安装流程、或要放移动硬盘带着走。

---

## 第 5 步：首次打开会被拦截（正常）

因为没有 Apple 开发者证书，应用未签名，macOS 会拦：

> 「桌宠Mini」无法打开，因为它来自身份不明的开发者

**解决办法**：在 Applications 里**右键点击桌宠Mini → 打开 → 点「打开」**。

只需做这一次，以后双击就能正常启动。

如果右键也没有「打开」选项，去 **系统设置 → 隐私与安全性**，往下滚到「仍要打开」按钮。

---

## 第 6 步：授予权限

桌宠有两个功能需要系统授权，首次用到时会弹窗：

| 功能 | 权限 | 怎么给 |
|---|---|---|
| 语音输入对话 | 麦克风 | 弹窗点「好」 |
| 看屏幕 | 屏幕录制 | 弹窗后还需：系统设置 → 隐私与安全性 → 屏幕录制 → 勾选「桌宠Mini」 |

> 权限说明文案已经写进应用的 Info.plist 了（`NSMicrophoneUsageDescription`、
> `NSScreenCaptureUsageDescription`），所以弹窗会正常显示中文说明。
> 不给也不影响其他功能，只是语音和看屏幕用不了。

---

## 常见问题

**Q：脚本报 `Permission denied`**
```bash
chmod +x mac/build-mac.sh
```

**Q：`npm install` 很慢或卡住**
Electron 二进制要从 GitHub 下载。可以挂国内镜像：
```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

**Q：报 `Build for macOS is supported only on macOS`**
说明你在 Windows 上跑了。必须在 Mac 上执行（或改用 GitHub Actions 云端构建）。

**Q：`node_modules` 已经有了但构建报错**
大概率是 Windows 版残留的依赖。删掉重装：
```bash
rm -rf node_modules
./mac/build-mac.sh
```

**Q：想看详细构建日志**
```bash
DEBUG=electron-builder ./mac/build-mac.sh
```

**Q：构建产物在哪、多大**
`dist/` 下，单个架构的 dmg 约 180MB（含整个 Electron 运行时 + 42MB 语音模型）。

---

## 一条命令速查

```bash
cd <项目目录> && chmod +x mac/build-mac.sh && ./mac/build-mac.sh
```

---

## 附：Mac 版和 Windows 版的差异

Mac 版做了这些平台适配（Windows 行为完全不变），用的时候会感受到：

| 表现 | 说明 |
|---|---|
| Dock 栏没有图标 | 桌宠是常驻小组件，通过菜单栏托盘图标操作，右键可退出 |
| 截图里看不到桌宠 | 用了窗口防截屏（`setContentProtection`），系统截图/录屏/会议共享中自动隐身 |
| 切桌面、进全屏 App 也一直在 | 设置了跨所有桌面空间可见 |
| 菜单栏图标清晰 | 自动缩到 16pt 显示（Mac 菜单栏的尺寸） |
| Cmd+Q 可退出 | 除托盘右键外，也支持 Mac 的退出快捷键 |
