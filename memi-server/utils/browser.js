// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Browser — Playwright 浏览器自动化                    ║
// ║  Agent 可操控真实浏览器：导航、点击、输入、截图             ║
// ╚══════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");

let browser = null;
let page = null;
let playwright = null;

// ─── 懒加载 Playwright ───────────────────────────────────
async function ensurePlaywright() {
  if (playwright) return playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error(
      "Playwright 未安装。请运行: npm install playwright && npx playwright install chromium\n" +
      "或运行: memi browser install"
    );
  }
  return playwright;
}

// ─── 启动浏览器 ──────────────────────────────────────────
async function ensureBrowser(headless = true) {
  const pw = await ensurePlaywright();
  if (!browser || !browser.isConnected()) {
    browser = await pw.chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  return { browser, page };
}

// ─── 关闭浏览器 ──────────────────────────────────────────
async function closeBrowser() {
  try {
    if (page) { await page.close().catch(() => {}); page = null; }
    if (browser) { await browser.close().catch(() => {}); browser = null; }
  } catch {}
}

// ─── 导航 ────────────────────────────────────────────────
async function navigate(url, timeout = 30000) {
  const { page } = await ensureBrowser();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  return `**${title}**\n${text}`;
}

// ─── 点击 ────────────────────────────────────────────────
async function click(selector) {
  const { page } = await ensureBrowser();
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.click(selector);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  return `点击后页面: **${title}**\n${text}`;
}

// ─── 输入 ────────────────────────────────────────────────
async function typeText(selector, text) {
  const { page } = await ensureBrowser();
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.fill(selector, text);
  return `已在 ${selector} 中输入: ${text.slice(0, 200)}`;
}

// ─── 截图 ────────────────────────────────────────────────
async function screenshot(fullPage = true) {
  const { page } = await ensureBrowser();
  const buf = await page.screenshot({ fullPage, type: "png" });
  // 保存到 memi-config
  const dir = path.join(__dirname, "..", "..", "memi-config");
  const fname = `screenshot_${Date.now()}.png`;
  const fpath = path.join(dir, fname);
  fs.writeFileSync(fpath, buf);
  return `截图已保存: ${fpath} (${(buf.length / 1024).toFixed(1)} KB)`;
}

// ─── 获取页面内容 ────────────────────────────────────────
async function getContent() {
  const { page } = await ensureBrowser();
  const title = await page.title();
  const url = page.url();
  const text = await page.evaluate(() => document.body.innerText.slice(0, 8000));
  return `**${title}**\nURL: ${url}\n\n${text}`;
}

// ─── 执行 JS ─────────────────────────────────────────────
async function evaluate(script) {
  const { page } = await ensureBrowser();
  const result = await page.evaluate(script);
  return JSON.stringify(result).slice(0, 5000);
}

// ─── 安装 Playwright ─────────────────────────────────────
async function installBrowser() {
  const { execSync } = require("child_process");
  const cwd = path.join(__dirname, "..");
  try {
    console.log("安装 playwright...");
    execSync("npm install playwright", { cwd, stdio: "inherit" });
    console.log("安装 Chromium...");
    execSync("npx playwright install chromium", { cwd, stdio: "inherit" });
    return "Playwright + Chromium 安装完成！现在可以使用浏览器工具了。";
  } catch (e) {
    throw new Error("安装失败: " + e.message);
  }
}

module.exports = {
  navigate, click, typeText, screenshot, getContent, evaluate,
  closeBrowser, installBrowser, ensurePlaywright
};
