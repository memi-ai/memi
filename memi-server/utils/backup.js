const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const CONFIG_DIR = path.join(ROOT, "memi-config");
const BACKUP_DIR = path.join(CONFIG_DIR, "backups");
const GIT_DIR = path.join(ROOT, ".git");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function isGitRepo() {
  return fs.existsSync(GIT_DIR);
}

// ─── Git-based backup ──────────────────────────────
function gitCreateBackup(label) {
  if (!isGitRepo()) return null;
  const tag = `backup-${timestamp()}-${(label || "manual").replace(/[^a-z0-9_-]/gi, "_")}`;
  try {
    execSync("git add -A", { cwd: ROOT, stdio: "pipe" });
    execSync(`git commit --allow-empty -m "backup: ${tag}"`, { cwd: ROOT, stdio: "pipe" });
    execSync(`git tag ${tag}`, { cwd: ROOT, stdio: "pipe" });
    return tag;
  } catch (e) {
    return `git_failed: ${e.message.slice(0, 80)}`;
  }
}

function gitListBackups() {
  if (!isGitRepo()) return [];
  try {
    const out = execSync("git tag -l 'backup-*' --sort=-creatordate", { cwd: ROOT, encoding: "utf8" });
    return out.trim().split("\n").filter(Boolean).map((tag) => {
      const dateStr = tag.replace(/^backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}).*$/, "$1");
      const label = tag.replace(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, "").replace(/_/g, " ");
      return { tag, date: dateStr, label };
    });
  } catch { return []; }
}

function gitRestore(tag) {
  if (!isGitRepo()) throw new Error("Not a git repository");
  execSync(`git stash`, { cwd: ROOT, stdio: "pipe" });
  execSync(`git checkout ${tag} -- .`, { cwd: ROOT, stdio: "pipe" });
  return true;
}

// ─── Snapshot-based backup (always works) ──────────
const SNAPSHOT_DIR = path.join(BACKUP_DIR, "snapshots");

function snapshotCreate(label) {
  ensureBackupDir();
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const name = `${timestamp()}-${(label || "manual").replace(/[^a-z0-9_-]/gi, "_")}`;
  const dest = path.join(SNAPSHOT_DIR, name);
  fs.mkdirSync(dest, { recursive: true });

  const items = fs.readdirSync(CONFIG_DIR).filter((f) => f !== "backups" && f !== ".onboarded");
  for (const item of items) {
    const src = path.join(CONFIG_DIR, item);
    const dst = path.join(dest, item);
    if (fs.statSync(src).isDirectory()) {
      execSync(`xcopy "${src}" "${dst}\\" /E /I /Q /Y`, { stdio: "pipe" });
    } else {
      fs.copyFileSync(src, dst);
    }
  }

  const info = { name, createdAt: new Date().toISOString(), label: label || "manual" };
  fs.writeFileSync(path.join(dest, ".meta.json"), JSON.stringify(info, null, 2));
  return name;
}

function snapshotList() {
  ensureBackupDir();
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter((name) => {
      const metaPath = path.join(SNAPSHOT_DIR, name, ".meta.json");
      return fs.existsSync(metaPath);
    })
    .map((name) => {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, name, ".meta.json"), "utf8"));
        return { name: meta.name || name, date: meta.createdAt || name, label: meta.label || "" };
      } catch {
        return { name, date: name.slice(0, 19), label: "" };
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function snapshotRestore(name) {
  const src = path.join(SNAPSHOT_DIR, name);
  if (!fs.existsSync(src)) throw new Error(`Backup not found: ${name}`);

  // Backup current state first
  const preBackup = snapshotCreate("pre-restore");

  // Restore files
  const items = fs.readdirSync(src).filter((f) => f !== ".meta.json");
  for (const item of items) {
    const srcPath = path.join(src, item);
    const dstPath = path.join(CONFIG_DIR, item);
    if (fs.statSync(srcPath).isDirectory()) {
      if (fs.existsSync(dstPath)) fs.rmSync(dstPath, { recursive: true, force: true });
      execSync(`xcopy "${srcPath}" "${dstPath}\\" /E /I /Q /Y`, { stdio: "pipe" });
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  return { restored: name, preBackup };
}

// ─── Unified API ──────────────────────────────────
function createBackup(label) {
  const gitTag = gitCreateBackup(label);
  const snapName = snapshotCreate(label);
  return { git: gitTag, snapshot: snapName };
}

function listBackups() {
  return { git: gitListBackups(), snapshots: snapshotList() };
}

function restoreBackup(type, name) {
  if (type === "git") return gitRestore(name);
  return snapshotRestore(name);
}

module.exports = { createBackup, listBackups, restoreBackup, gitListBackups, snapshotList };
