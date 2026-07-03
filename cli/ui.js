// ─── Memi UI Component Library ─────────────────────
// Inspired by OpenClaw's design: consistent, readable, beautiful.

const readline = require("readline");

// ─── Style ──────────────────────────────────────────
const S = {
  r:  "\x1b[0m",
  b:  "\x1b[1m",
  d:  "\x1b[2m",
  i:  "\x1b[3m",
  u:  "\x1b[4m",

  // Foreground
  g:  "\x1b[90m",   // gray
  rk: "\x1b[31m",   // red
  gk: "\x1b[32m",   // green
  yk: "\x1b[33m",   // yellow
  bk: "\x1b[34m",   // blue
  mk: "\x1b[35m",   // magenta
  ck: "\x1b[36m",   // cyan
  wk: "\x1b[37m",   // white

  // Bold foreground
  rkb: "\x1b[1m\x1b[31m",
  gkb: "\x1b[1m\x1b[32m",
  ykb: "\x1b[1m\x1b[33m",
  bkb: "\x1b[1m\x1b[34m",
  mkb: "\x1b[1m\x1b[35m",
  ckb: "\x1b[1m\x1b[36m",
  wkb: "\x1b[1m\x1b[37m",
  gb:  "\x1b[1m\x1b[90m",

  // Background
  bg_red:    "\x1b[41m",
  bg_green:  "\x1b[42m",
  bg_yellow: "\x1b[43m",
  bg_blue:   "\x1b[44m",
  bg_gray:   "\x1b[100m",

  // 256-color grays for subtle UI
  gray1: "\x1b[38;5;236m",
  gray2: "\x1b[38;5;240m",
  gray3: "\x1b[38;5;244m",
  gray4: "\x1b[38;5;248m",
};

const s = (...parts) => parts.filter(Boolean).join("") + S.r;

// ─── Output helpers ─────────────────────────────────
function out(...a) { process.stdout.write(a.join("")); }
function log(...a) { console.log(a.join("") + S.r); }

// ─── Components ─────────────────────────────────────

function inline(icon, title, desc) {
  log(`  ${icon}  ${S.wk}${title}${S.r}${desc ? `  ${S.g}${desc}${S.r}` : ""}`);
}

function block(icon, title, output) {
  log(``);
  log(`  ${S.b}${S.wk}${icon}  ${title}${S.r}`);
  if (output) {
    const lines = String(output).split("\n");
    for (const line of lines) log(`  ${S.gray3}│${S.r}  ${line}`);
    log(`  ${S.gray3}│${S.r}`);
  }
}

function section(title) {
  log(``);
  log(`  ${S.gray2}┌─ ${S.b}${S.ck}${title}${S.r}${S.gray2}${"─".repeat(Math.max(2, 50 - title.length))}${S.r}`);
}

function divider(label) {
  const left = label ? ` ${S.g}${label}${S.r} ` : " ";
  log(`  ${S.gray2}${"─".repeat(50)}${S.r}`);
}

function box(title, content) {
  const lines = String(content).split("\n");
  const w = Math.min(76, Math.max(...lines.map(l => l.replace(/\x1b\[\d+(;\d+)?m/g, "").length), title.length + 4));
  const top = `${S.gray2}┌─ ${S.b}${S.wk}${title}${S.r}${S.gray2} ${"─".repeat(w - title.length - 4)}┐${S.r}`;
  log(top);
  for (const line of lines) log(`  ${S.gray2}│${S.r}  ${line}${" ".repeat(Math.max(0, w - line.replace(/\x1b\[\d+(;\d+)?m/g, "").length - 2))}${S.gray2}│${S.r}`);
  log(`  ${S.gray2}${"─".repeat(w)}┘${S.r}`);
}

function code(content, lang) {
  log(`  ${S.gray2}┌─ ${S.g}[${lang || "code"}]${S.r}${S.gray2}${"─".repeat(40)}┐${S.r}`);
  const lines = String(content).split("\n");
  for (const line of lines) log(`  ${S.gray2}│${S.r}  ${S.gray4}${line}${S.r}`);
  log(`  ${S.gray2}└${"─".repeat(50)}┘${S.r}`);
}

function diff(content) {
  const lines = String(content).split("\n");
  for (const line of lines) {
    if (line.startsWith("+")) log(`  ${S.gkb}+${S.r} ${S.gk}${line.slice(1)}${S.r}`);
    else if (line.startsWith("-")) log(`  ${S.rkb}-${S.r} ${S.rk}${line.slice(1)}${S.r}`);
    else if (line.startsWith("@@")) log(`  ${S.ckb}${line}${S.r}`);
    else log(`  ${S.gray3} ${line}${S.r}`);
  }
}

function json(obj) {
  log(`  ${S.gray4}${JSON.stringify(obj, null, 2).split("\n").join(`\n  `)}${S.r}`);
}

function table(headers, rows) {
  if (rows.length === 0) { log(`  ${S.g}无数据${S.r}`); return; }
  // Calculate column widths
  const colW = headers.map((h, i) => Math.max(
    h.replace(/\x1b\[\d+m/g, "").length,
    ...rows.map(r => (r[i] || "").replace(/\x1b\[\d+m/g, "").length)
  ));
  const sep = (left, mid, right, fill) => `  ${S.gray2}${left}${colW.map(w => fill.repeat(w + 2)).join(mid)}${right}${S.r}`;
  const fmtRow = (row, isHeader) => {
    const cells = row.map((c, i) => {
      const text = c || "";
      const pad = colW[i] - text.replace(/\x1b\[\d+m/g, "").length;
      return ` ${isHeader ? S.b + S.wk + text + S.r : S.wk + text + S.r}${" ".repeat(pad)} `;
    });
    return `  ${S.gray2}│${S.r}${cells.join(`${S.gray2}│${S.r}`)}${S.gray2}│${S.r}`;
  };
  log(sep("┌", "┬", "┐", "─"));
  log(fmtRow(headers, true));
  log(sep("├", "┼", "┤", "─"));
  for (const row of rows) log(fmtRow(row, false));
  log(sep("└", "┴", "┘", "─"));
}

// ─── Spinner ────────────────────────────────────────
class Spinner {
  constructor(text) {
    this.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.i = 0;
    this.text = text;
    this.timer = null;
  }
  start() {
    this.i = 0;
    if (!process.stdout.isTTY) { out(S.g + "  " + this.text + "... " + S.r); return; }
    const spin = () => {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      out(`  ${S.ck}${this.frames[this.i]}${S.r} ${S.g}${this.text}${S.r}`);
      this.i = (this.i + 1) % this.frames.length;
    };
    spin();
    this.timer = setInterval(spin, 80);
  }
  stop(result) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    if (result === true) out(`  ${S.gkb}✔${S.r} ${S.g}${this.text}${S.r}\n`);
    else if (result === false) out(`  ${S.rkb}✘${S.r} ${S.g}${this.text}${S.r}\n`);
    else if (result) out(`  ${result}${S.r}\n`);
    else out(`  ${S.gkb}✔${S.r} ${S.g}${this.text}${S.r}\n`);
    return this;
  }
}

// ─── Progress bar ───────────────────────────────────
class Progress {
  constructor(total, label) {
    this.total = total;
    this.current = 0;
    this.label = label || "进度";
    this.w = 20;
  }
  tick(n) {
    this.current = Math.min(this.current + (n || 1), this.total);
    this.draw();
  }
  draw() {
    const p = Math.round((this.current / this.total) * this.w);
    const bar = S.gkb + "█".repeat(p) + S.r + S.gray2 + "░".repeat(this.w - p) + S.r;
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    out(`  ${S.g}${this.label}: ${bar} ${S.wk}${this.current}/${this.total}${S.r}`);
    if (this.current >= this.total) out("\n");
  }
}

// ─── Logo ───────────────────────────────────────────
function logo() {
  const L = [
    S.mk + S.b + "  |\\  /|   __   |  \\/  | |_   _|" + S.r,
    S.mk + S.b + "  | \\/ |  / _ \\  | \\  / |   | |  " + S.r,
    S.rk + S.b + "  | |\\/| | |_| | | |\\/| |   | |  " + S.r,
    S.yk + S.b + "  | |  | |  _  | | |  | |   | |  " + S.r,
    S.gk + S.b + "  | |  | | | | | | |  | |  _| |_ " + S.r,
    S.ck + S.b + "  |_|  |_|_| |_| |_|  |_| |_____|" + S.r,
  ];
  log("");
  L.forEach(l => log(l));
  log("");
}

// ─── Export ─────────────────────────────────────────
module.exports = {
  S, s, out, log,
  inline, block, section, divider, box, code, diff, json, table,
  Spinner, Progress, logo,
};
