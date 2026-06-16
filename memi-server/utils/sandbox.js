// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Sandbox — Docker 沙箱隔离执行                       ║
// ║  Agent 工具调用可选的容器沙箱，保护宿主机安全              ║
// ╚══════════════════════════════════════════════════════════╝

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");
const SANDBOX_IMAGE = "node:22-alpine";
const SANDBOX_TIMEOUT = 30000; // 30s
const SANDBOX_MEMORY = "256m";

let sandboxEnabled = false;

// ─── 检查 Docker 是否可用 ──────────────────────────────
function checkDocker() {
  try {
    execSync("docker info", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ─── 启用/禁用沙箱 ─────────────────────────────────────
function setEnabled(enabled) {
  sandboxEnabled = enabled;
  const config = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "config.json"), "utf8"));
  config.sandbox = { enabled };
  fs.writeFileSync(path.join(CONFIG_DIR, "config.json"), JSON.stringify(config, null, 2));
}

function isEnabled() {
  return sandboxEnabled;
}

// ─── 沙箱中执行命令 ─────────────────────────────────────
async function runInSandbox(command, workdir = "/app") {
  if (!isEnabled()) throw new Error("沙箱未启用。运行 memi sandbox enable");

  const dockerArgs = [
    "run", "--rm",
    "--network", "none",           // 无网络
    "--memory", SANDBOX_MEMORY,    // 内存限制
    "--cpus", "1",                 // CPU 限制
    "--pids-limit", "50",         // 进程数限制
    "-w", workdir,
    SANDBOX_IMAGE,
    "sh", "-c", command,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: SANDBOX_TIMEOUT,
    });

    let stdout = "", stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code === 0 || code === null) resolve(stdout.slice(0, 5000) || "(空)");
      else resolve(`沙箱命令退出 (${code}): ${(stderr || stdout).slice(0, 2000)}`);
    });

    proc.on("error", (e) => reject(e));

    const timer = setTimeout(() => { proc.kill(); reject(new Error("沙箱超时")); }, SANDBOX_TIMEOUT);
    proc.on("close", () => clearTimeout(timer));
  });
}

// ─── 沙箱中读写文件 ─────────────────────────────────────
async function sandboxWriteFile(containerPath, content) {
  const tmpFile = path.join(CONFIG_DIR, "sandbox_tmp", Date.now() + ".tmp");
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, content);

  const dockerArgs = [
    "run", "--rm",
    "-v", `${tmpFile}:${containerPath}:ro`,
    SANDBOX_IMAGE,
    "cat", containerPath,
  ];

  try {
    const result = execSync(`docker ${dockerArgs.join(" ")}`, { timeout: 10000, encoding: "utf8" });
    return result.slice(0, 5000);
  } catch (e) {
    return "沙箱读文件失败: " + e.message;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ─── 拉取沙箱镜像 ──────────────────────────────────────
async function pullImage() {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["pull", SANDBOX_IMAGE], { stdio: "pipe" });
    proc.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`镜像拉取失败 (${code})`));
    });
    proc.on("error", (e) => reject(e));
  });
}

// ─── 状态 ──────────────────────────────────────────────
function status() {
  return {
    enabled: isEnabled(),
    docker: checkDocker(),
    image: SANDBOX_IMAGE,
    timeout: SANDBOX_TIMEOUT,
  };
}

module.exports = { runInSandbox, sandboxWriteFile, setEnabled, isEnabled, checkDocker, pullImage, status };
