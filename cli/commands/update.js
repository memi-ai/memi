const { S, log, out, Spinner } = require("../ui");

module.exports = {
  name: "update",
  aliases: ["up"],
  description: "Check for updates",
  usage: "memi update",
  category: "system",
  run: async () => {
    const spin = new Spinner("检查更新").start();
    try {
      const r = await fetch("https://api.github.com/repos/memi-ai/memi/releases/latest", { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const latest = (d.tag_name || "").replace(/^v/, "");
      if (latest && latest !== "1.0.0") {
        spin.stop(`${S.ykb}⚡${S.r} ${S.yk}新版本可用: v${latest}${S.r}`);
        log(`  ${S.g}当前: v1.0.0 → 最新: v${latest}${S.r}`);
        log(`  ${S.g}下载: ${d.html_url || ""}${S.r}`);
      } else {
        spin.stop(`${S.gkb}✔${S.r} ${S.g}已是最新版本 (v1.0.0)${S.r}`);
      }
    } catch {
      spin.stop(`${S.g}v1.0.0${S.r}`);
      log(`  ${S.gray3}检查更新失败，请稍后重试${S.r}`);
    }
  },
};
