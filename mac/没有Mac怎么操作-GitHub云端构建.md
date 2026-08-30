# 没有 Mac 怎么操作（GitHub Actions 云端构建）

用 GitHub 提供的 **macOS 云主机**替你构建，免费，无需 Mac 电脑。
全程约 **20 分钟**（其中云端构建约 10 分钟，等待期间你可以干别的）。

> **最新进展（08-29 21:55 实测）**：本机到 GitHub 的网络已恢复连通
> （`github.com` HTTP 200、`git ls-remote` 正常返回）。
> 所以推送这步**可以让 AI 代劳**，你只需先做下面第 2 步和第 3 步。

---

## 总览

```
① 注册 GitHub 账号
        ↓
② 创建一个【空仓库】
        ↓
③ 生成 PAT（访问令牌）← 最关键的一步
        ↓
④ 把代码推上去（AI 可代劳 / 双击脚本 / 手动命令，三选一）
        ↓
⑤ Actions → Build macOS → Run workflow → 选架构
        ↓
⑥ 等约 10 分钟 → 下载产物
        ↓
⑦ 安装、授权、开用
```

---

## 第 1 步：注册 GitHub 账号

打开 https://github.com → 右上角 **Sign up**，用邮箱注册即可。已有账号跳过。

---

## 第 2 步：创建空仓库

1. 登录后打开 https://github.com/new
2. **Repository name** 填一个名字，例如 `desk-pet-mini`
3. 选 **Public**（公开）
   > 为什么建议 Public：公开仓库的 GitHub Actions **完全免费不限量**。
   > 私有仓库每月只有 2000 分钟免费额度，macOS 主机按 3 倍速扣，大概够跑 60 次——也够用，
   > 但如果你介意源码公开，可以选 Private，额度基本也够。
4. **这三个都不要勾**（重要）：
   - ☐ Add a README file
   - ☐ Add .gitignore
   - ☐ Choose a license
   
   > 仓库必须**完全是空的**。勾了任何一项，推送时都会因为历史不一致而失败。
5. 点 **Create repository**
6. 建好后页面会显示一个地址，形如：
   ```
   https://github.com/你的用户名/desk-pet-mini.git
   ```
   **复制它**，后面要用。

---

## 第 3 步：生成 PAT（访问令牌）

现在 GitHub **已经不支持用账号密码推送**了，必须用 PAT 当密码。

1. 点右上角**头像** → **Settings**
2. 拉到左侧最下面 → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. 点 **Generate new token** → 选 **Generate new token (classic)**
5. 填这些：
   - **Note**：随便写，比如 `desk-pet`
   - **Expiration**：选 `90 days`（或 `No expiration`）
   - **Select scopes**：勾选 **`repo`**（会自动勾上它下面所有子项）
6. 拉到最下面点 **Generate token**
7. ⚠️ **立刻复制那串 `ghp_xxxx...` 并保存好**——它只显示这一次，关掉页面就再也看不到了

---

## 第 4 步：把代码推上去

三选一：

### 方式 A：让 AI 代劳（推荐，当前网络已通）

把这两样给我：
- 仓库地址（第 2 步复制的）
- PAT（第 3 步生成的）

我会执行推送并在完成后告诉你。

### 方式 B：双击脚本

双击运行项目里的：

```
mac\push-to-github.bat
```

按提示粘贴仓库地址，回车。弹窗要求登录时：
- **用户名** = 你的 GitHub 用户名
- **密码** = 第 3 步的 PAT（**不是**你的 GitHub 登录密码）

### 方式 C：手动命令

在 Git Bash 或终端里：

```bash
cd G:/desktop-pet/pet-mini
git remote add origin https://github.com/<用户名>/<仓库名>.git
git branch -M master
git push -u origin master
```

---

## 第 5 步：触发云端构建

1. 打开你的仓库页面，点顶部 **Actions** 标签
2. 左侧列表里点 **Build macOS**
3. 右侧点 **Run workflow**（黑色下拉按钮）
4. 在 **arch** 下拉框选：
   - `arm64` —— Apple 芯片（M1/M2/M3/M4），**大多数情况选这个**
   - `x64` —— Intel 芯片
   - `universal` —— 两种都能跑，体积约 2 倍
5. 点绿色的 **Run workflow**

> 第一次进来可能看不到 workflow 列表，刷新一下页面；或先确认代码已推送成功
> （仓库首页能看到 `mac/`、`main.js` 等文件）。

---

## 第 6 步：等待并下载

- 点进正在跑的那个任务，能看到实时日志
- 大约 **8～12 分钟**跑完，出现绿色对勾 ✓
- 同一页面往下拉，底部 **Artifacts** 区域会出现：
  ```
  桌宠Mini-macOS-arm64
  ```
  点它下载（是个 zip 包，约 180MB）

> 如果网络不好下不下来，可以等 Actions 邮件通知，或稍后再来下载。
> 产物默认保留 **90 天**。

---

## 第 7 步：安装使用

下载的 zip 解压后里面有两个文件：

```
桌宠Mini-1.0.0-mac-arm64.dmg   ← 安装盘
桌宠Mini-1.0.0-mac-arm64.zip   ← 绿色版
```

**用 dmg**（推荐）：双击 → 把「桌宠Mini」拖进 Applications → 完成

**用 zip**：解压后把 `桌宠Mini.app` 拖到 Applications，双击运行

**首次打开会被拦截**（因为没签名）：
> 在 Applications 里 **右键点击桌宠Mini → 打开 → 点「打开」**
> 只此一次，之后双击即可。

**授权**（首次用到时弹窗）：
| 功能 | 权限 | 说明 |
|---|---|---|
| 语音输入 | 麦克风 | 弹窗点「好」 |
| 看屏幕 | 屏幕录制 | 系统设置 → 隐私与安全性 → 屏幕录制 → 勾选桌宠Mini |

---

## 常见问题

**Q：推送时提示 `fatal: Authentication failed`**
用户名或 PAT 填错了。密码处必须填 PAT（`ghp_` 开头），不是登录密码。

**Q：推送时提示仓库不为空 / `rejected`**
说明建仓库时勾了 README 或 .gitignore。删掉这个仓库，重新建一个**完全空的**。

**Q：推送很慢或超时**
119MB 里主要是 42MB 语音模型和 20MB UI 图。晚上网速差时可以重试，git 支持断点续传的部分重来。

**Q：Actions 里找不到 Build macOS**
- 确认 `.github/workflows/build-mac.yml` 已推送上去（仓库里能看到这个路径）
- 刷新页面，或点 Actions 页面的 "I understand my workflows, go ahead and enable them"

**Q：构建失败**
点进任务看红色日志，把报错发给我。常见原因：
- 仓库缺 `assets/vosk-models/*.zip`（42MB 语音模型，必须推上去）
- 架构参数与依赖冲突

**Q：想让 Mac 用户也能更新**
改完代码重新推送 → 再 Run workflow 一次 → 下载新产物即可。

**Q：本机连不上 GitHub 怎么办**
当前实测已通。若之后又不通：
- 开代理 / VPN 后重试
- 或换一台能连 GitHub 的电脑执行第 4 步
- 或借台 Mac，改用 `mac/build-mac.sh` 本地构建（见《在Mac上构建-操作手册》）

---

## 额度说明

| 仓库类型 | Actions 免费额度 | macOS 扣费倍率 | 大约能构建 |
|---|---|---|---|
| Public | 不限量 | — | 无限次 |
| Private | 2000 分钟 / 月 | 3x | 约 60 次 |

单次构建约 8～12 分钟，私有仓库扣 25～35 分钟额度，日常完全够用。
