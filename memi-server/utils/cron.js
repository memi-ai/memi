// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Cron — 定时任务调度                                 ║
// ╚══════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");
const CRON_FILE = path.join(CONFIG_DIR, "cron.json");

let jobs = [];
let timers = [];

// ─── 简易 cron 解析 (minute hour day month weekday) ────
function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("cron 表达式需 5 段: 分 时 日 月 周");
  return parts.map(p => (p === "*" ? null : p.split(",").map(Number)));
}

function cronMatches(parsed, now) {
  const checks = [
    parsed[0] ? parsed[0].includes(now.getMinutes()) : true,
    parsed[1] ? parsed[1].includes(now.getHours()) : true,
    parsed[2] ? parsed[2].includes(now.getDate()) : true,
    parsed[3] ? parsed[3].includes(now.getMonth() + 1) : true,
    parsed[4] ? parsed[4].includes(now.getDay() || 7) : true,
  ];
  return checks.every(Boolean);
}

function getDelayMs(expr) {
  // 最简实现：每分钟检查一次
  return 60000;
}

// ─── 加载任务 ────────────────────────────────────────────
function loadJobs() {
  if (!fs.existsSync(CRON_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(CRON_FILE, "utf8")); } catch { return []; }
}

function saveJobs(j) {
  fs.mkdirSync(path.dirname(CRON_FILE), { recursive: true });
  fs.writeFileSync(CRON_FILE, JSON.stringify(j, null, 2));
}

// ─── 启动调度器 ─────────────────────────────────────────
function startScheduler(callback) {
  // 每分钟检查一次
  const timer = setInterval(() => {
    const now = new Date();
    const allJobs = loadJobs();
    for (const job of allJobs) {
      if (!job.enabled) continue;
      try {
        const parsed = parseCron(job.cron);
        if (cronMatches(parsed, now)) {
          console.log(`[Cron] 触发: ${job.name} (${job.cron})`);
          callback(job).catch(e => console.error(`[Cron] ${job.name} 失败:`, e.message));
        }
      } catch {}
    }
  }, 60000);
  timers.push(timer);
  return timer;
}

function stopScheduler() {
  timers.forEach(clearInterval);
  timers = [];
}

// ─── CRUD ────────────────────────────────────────────────
function addJob(name, cronExpr, prompt) {
  const jobs = loadJobs();
  jobs.push({ name, cron: cronExpr, prompt, enabled: true, created: new Date().toISOString() });
  saveJobs(jobs);
}

function removeJob(name) {
  let jobs = loadJobs();
  jobs = jobs.filter(j => j.name !== name);
  saveJobs(jobs);
}

function listJobs() {
  return loadJobs();
}

function runJobNow(name, callback) {
  const jobs = loadJobs();
  const job = jobs.find(j => j.name === name);
  if (!job) throw new Error(`任务 "${name}" 不存在`);
  return callback(job);
}

module.exports = { startScheduler, stopScheduler, addJob, removeJob, listJobs, runJobNow };
