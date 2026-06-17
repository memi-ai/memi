#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════╗
# ║  Memi Agent — 一键安装脚本 (macOS/Linux)                 ║
# ║  curl -fsSL https://memi.ai/install.sh | bash            ║
# ╚══════════════════════════════════════════════════════════╝
set -e

echo ""
echo "  🦞 Memi Agent Installer"
echo "  ───────────────────────"
echo ""

# 检测 Node.js
if ! command -v node &>/dev/null; then
  echo "  ⚠ Node.js 未安装。正在安装..."
  if command -v brew &>/dev/null; then
    brew install node@22
  elif command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y nodejs
  else
    echo "  ✗ 请先安装 Node.js 18+: https://nodejs.org"
    exit 1
  fi
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "  ✗ Node.js >= 18 需要, 当前: $(node -v)"
  exit 1
fi

echo "  ✓ Node.js $(node -v)"

# 安装 Memi
echo "  📦 安装 memi-agent..."
npm install -g memi-agent@latest

echo ""
echo "  ✓ 安装完成！"
echo ""
echo "  运行引导程序:"
echo "    memi onboard"
echo ""
