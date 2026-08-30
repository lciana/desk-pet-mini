#!/bin/bash
# 在 macOS 本机一键构建桌宠 Mini（dmg + zip）
#
# 用法（在 Mac 的终端里）：
#   cd 桌宠Mini源码目录
#   chmod +x mac/build-mac.sh
#   ./mac/build-mac.sh              # 默认：构建本机架构
#   ./mac/build-mac.sh arm64        # Apple 芯片 (M1/M2/M3)
#   ./mac/build-mac.sh x64          # Intel 芯片
#   ./mac/build-mac.sh universal    # 通用包（两种芯片都能跑，体积约 2 倍）
#
# 产物在 dist/ 下：桌宠Mini-1.0.0-mac-<arch>.dmg 与 .zip

set -e

ARCH="${1:-}"

# 未指定架构时，用本机架构（Apple 芯片为 arm64，Intel 为 x64）
if [ -z "$ARCH" ]; then
  if [ "$(uname -m)" = "arm64" ]; then ARCH="arm64"; else ARCH="x64"; fi
fi

echo "==> 目标架构: $ARCH"

cd "$(dirname "$0")/.."

# 0) 平台检查：electron-builder 只能在 macOS 上构建 macOS 包
if [ "$(uname -s)" != "Darwin" ]; then
  echo "错误：必须在 macOS 上运行本脚本（当前为 $(uname -s)）。"
  echo "     没有 Mac 的话，改用 GitHub Actions：推送后运行 .github/workflows/build-mac.yml"
  exit 1
fi

# 1) 依赖
if [ ! -d node_modules ]; then
  echo "==> 安装依赖（首次较慢）"
  npm install
fi

# 2) 语音模型：仓库里是 3 个分片（43.9MB 超过 GitHub 单文件上限），需先合并
#    直接拷贝源码过来的话 zip 已完整，此步自动跳过
MODEL="assets/vosk-models/vosk-model-small-cn-0.22.zip"
if [ ! -f "$MODEL" ] && ls "$MODEL".part* >/dev/null 2>&1; then
  echo "==> 合并语音模型分片"
  cat "$MODEL".part* > "$MODEL"
  echo "    完成（$(du -h "$MODEL" | cut -f1)）"
fi

# 3) 图标：缺 icon.icns 时用 Pillow 从 build/icon.ico 生成
if [ ! -f mac/icon.icns ]; then
  echo "==> 生成 mac/icon.icns"
  python3 -m pip install --quiet Pillow 2>/dev/null || true
  python3 mac/make-icns.py
fi

# 4) 构建
echo "==> 构建中：electron-builder --mac --$ARCH"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac "--$ARCH"

echo ""
echo "==> 完成！产物："
ls -lh dist/*.dmg dist/*.zip 2>/dev/null || true
