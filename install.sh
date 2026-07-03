#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════╗
# ║  Memi Agent — 一键安装脚本 (macOS/Linux)                 ║
# ║  curl -fsSL https://memi.ai/install.sh | bash            ║
# ╚══════════════════════════════════════════════════════════╝
set -e

# ─── 镜像自动检测 ───────────────────────────────────────
detect_mirror() {
  # 检测 npmjs.org 是否可达 (超时 3s)
  if timeout 3 curl -sI https://registry.npmjs.org >/dev/null 2>&1; then
    echo "direct"
  else
    echo "mirror"
  fi
}

MIRROR_MODE="${MEMI_NPM_MIRROR:-$(detect_mirror)}"

if [ "$MIRROR_MODE" = "mirror" ]; then
  NPM_REGISTRY="https://registry.npmmirror.com"
  NODE_MIRROR="https://npmmirror.com/mirrors/node"
  echo ""
  echo "  🌐 检测到 npmjs.org 不可达，自动切换镜像源"
  echo "  📡 npm:  ${NPM_REGISTRY}"
  echo "  📡 node: ${NODE_MIRROR}"
  echo "  💡 可设置 MEMI_NPM_MIRROR=direct 强制直连"
  echo ""
else
  NPM_REGISTRY="https://registry.npmjs.org"
  NODE_MIRROR=""
fi

# ─── Banner ─────────────────────────────────────────────
echo ""
echo "  🦞 Memi Agent Installer"
echo "  ───────────────────────"
echo ""

# ─── Node.js 检测与安装 ─────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  ⚠ Node.js 未安装。正在安装..."

  if command -v brew &>/dev/null; then
    brew install node@22
  elif command -v apt-get &>/dev/null; then
    if [ -n "$NODE_MIRROR" ]; then
      # 使用镜像安装 Node.js
      NODE_VERSION="22.14.0"
      ARCH=$(uname -m)
      case "$ARCH" in
        x86_64)  NODE_ARCH="x64" ;;
        aarch64|arm64) NODE_ARCH="arm64" ;;
        *)       NODE_ARCH="x64" ;;
      esac
      NODE_URL="${NODE_MIRROR}/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.gz"
      echo "  📥 下载 Node.js ${NODE_VERSION} (${NODE_ARCH}) ..."
      curl -fsSL "$NODE_URL" -o /tmp/node.tar.gz
      sudo tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1
      rm /tmp/node.tar.gz
    else
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y nodejs
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm nodejs npm
  else
    echo "  ✗ 请先安装 Node.js 18+: https://nodejs.org"
    echo "    或使用包管理器: brew install node / apt install nodejs"
    exit 1
  fi
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "  ✗ Node.js >= 18 需要, 当前: $(node -v)"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

# ─── npm 镜像配置（临时） ──────────────────────────────
if [ "$MIRROR_MODE" = "mirror" ]; then
  npm config set registry "$NPM_REGISTRY" --location=project 2>/dev/null || true
fi

# ─── 安装 Memi ─────────────────────────────────────────
echo "  📦 安装 memi-agent..."
NPM_OPTS=""
if [ "$MIRROR_MODE" = "mirror" ]; then
  NPM_OPTS="--registry=$NPM_REGISTRY"
fi

if npm install -g memi-agent@latest $NPM_OPTS 2>&1 | tail -5; then
  echo ""
  echo "  ✓ 安装完成！"
  echo ""
  echo "  运行引导程序:"
  echo "    memi onboard"
  echo ""
else
  echo ""
  echo "  ✗ 安装失败。常见原因:"
  echo "    1. 网络问题 → 尝试: MEMI_NPM_MIRROR=mirror bash install.sh"
  echo "    2. 权限问题 → 尝试: sudo npm install -g memi-agent"
  echo "    3. 直接安装: npm install -g memi-agent --registry=https://registry.npmmirror.com"
  echo ""
  exit 1
fi

# ─── 恢复 npm 配置 ─────────────────────────────────────
if [ "$MIRROR_MODE" = "mirror" ]; then
  npm config delete registry --location=project 2>/dev/null || true
fi
