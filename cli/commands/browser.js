const path = require("path");
const { A, log, ok, fail, ROOT } = require("..");

module.exports = {
  name: "browser",
  description: "Browser automation tools",
  usage: "memi browser [install|test]",
  category: "system",
  run: async (args) => {
    const sub = args[0];
    if (sub === "install") {
      log(A.b + "  安装 Playwright + Chromium..." + A.r);
      try {
        const { installBrowser } = require(path.join(ROOT, "memi-server", "utils", "browser"));
        const result = await installBrowser();
        ok(result);
      } catch(e) { fail("安装失败: " + e.message); }
    } else if (sub === "test") {
      try {
        const { navigate, closeBrowser } = require(path.join(ROOT, "memi-server", "utils", "browser"));
        const result = await navigate("https://example.com");
        log(A.b + "\n  Browser Test\n" + A.r);
        log(result.slice(0, 500));
        await closeBrowser();
        ok("浏览器测试通过 ✓");
      } catch(e) { fail("测试失败: " + e.message); }
    } else {
      log(A.b + "  memi browser <子命令>\n" + A.r);
      log(`  ${A.ck}install${A.r}  安装 Playwright + Chromium`);
      log(`  ${A.ck}test${A.r}     测试浏览器是否可用`);
    }
  },
};
