#!/usr/bin/env node
// ─── Memi 依赖安装脚本 ─────────────────────────────────
// 处理 npmjs.org 不可达时的镜像切换，确保跨国/防火墙环境可用
// 同时支持 postinstall (npm install 后自动触发) 和独立运行

const { execSync } = require("child_process");
const https = require("https");
const path = require("path");
const fs = require("fs");

const SERVER_DIR = path.resolve(__dirname, "..", "memi-server");

function detectMirror() {
  return new Promise((resolve) => {
    const req = https.get("https://registry.npmjs.org/", { timeout: 4000 }, (res) => {
      res.resume();
      resolve(false); // 可达，不使用镜像
    });
    req.on("error", () => resolve(true)); // 不可达，使用镜像
    req.on("timeout", () => { req.destroy(); resolve(true); });
  });
}

function registryFlag(registry) {
  return `--registry="${registry}"`;
}

async function install() {
  const useMirror = process.env.MEMI_NPM_MIRROR === "mirror" ? true :
                    process.env.MEMI_NPM_MIRROR === "direct" ? false :
                    await detectMirror();

  const registry = useMirror ? "https://registry.npmmirror.com" : "https://registry.npmjs.org";
  const flag = registryFlag(registry);

  if (useMirror) {
    console.log(`  🌐 检测到 npmjs.org 不可达，使用镜像: ${registry}`);
  }

  if (!fs.existsSync(path.join(SERVER_DIR, "package.json"))) {
    console.log("  ✗ memi-server/package.json 未找到，跳过依赖安装");
    return;
  }

  console.log("  📦 安装 memi-server 依赖...");
  try {
    execSync(`npm install --omit=dev ${flag}`, {
      cwd: SERVER_DIR,
      stdio: "inherit",
      env: { ...process.env, npm_config_registry: useMirror ? registry : undefined },
      timeout: 300000,
    });
    console.log("  ✓ 依赖安装完成");
  } catch (e) {
    console.error(`  ✗ 依赖安装失败: ${e.message}`);
    console.log("");
    console.log("  💡 可以手动安装:");
    console.log(`     cd memi-server && npm install --registry=${registry}`);
    process.exitCode = 1;
  }
}

install();
