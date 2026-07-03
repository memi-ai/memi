const { A, log, out, ok, fail } = require("..");

module.exports = {
  name: "platform",
  aliases: ["telegram", "feishu", "wecom", "qq", "discord", "slack", "dingtalk"],
  description: "Configure messaging platforms",
  usage: "memi telegram|feishu|wecom|qq|discord|slack|dingtalk <token>",
  category: "platform",
  run: async (args) => {
    const chName = process.argv[2]; // 通过原始 argv 获取
    const chNamesAll = { telegram: "Telegram", feishu: "飞书", wecom: "企业微信", qq: "QQ", discord: "Discord", slack: "Slack", dingtalk: "钉钉" };
    const token = args[0];
    if (!token) {
      log(A.g + `  用法: memi ${chName} <token/key>`);
      if (chName === "telegram") log(A.g + "  1. @BotFather 创建机器人 → 获取 token");
      if (chName === "feishu") log(A.g + "  1. 飞书开放平台 → 创建应用 → 获取 App ID");
      if (chName === "wecom") log(A.g + "  1. 企业微信管理后台 → 创建机器人 → 获取 webhook key");
      if (chName === "qq") log(A.g + "  1. go-cqhttp 或官方 QQ Bot → 获取 token");
      log(A.g + `  2. 运行: memi ${chName} <token>`);
      return;
    }
    out(A.g + `  连接 ${chNamesAll[chName] || chName}... `);
    try {
      const ngrokUrl = "https://pyromania-strenuous-sinuous.ngrok-free.dev";
      if (chName === "telegram") {
        const r = await fetch(`http://localhost:3001/api/gateway/telegram/${token}/setup`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: ngrokUrl })
        });
        const d = await r.json();
        if (d.success) log(A.gk + `✓ Webhook: ${d.webhook}` + A.r);
        else fail("失败: " + (d.error || ""));
      } else if (chName === "feishu") {
        log(A.gk + "✓ Feishu 端点就绪" + A.r);
        log(A.g + "  Webhook URL: " + A.wk + `${ngrokUrl}/api/gateway/feishu` + A.r);
      } else if (chName === "wecom") {
        log(A.gk + "✓ 企业微信端点就绪" + A.r);
        log(A.g + "  Webhook URL: " + A.wk + `${ngrokUrl}/api/gateway/wecom/${token}` + A.r);
      } else if (chName === "qq") {
        log(A.gk + "✓ QQ 端点就绪" + A.r);
        log(A.g + "  Webhook URL: " + A.wk + `${ngrokUrl}/api/gateway/qq/${token}` + A.r);
      } else if (chName === "discord") {
        log(A.gk + "✓ Discord 端点就绪" + A.r);
        log(A.g + "  1. Discord Developer Portal → Bot"); log(A.g + "  2. Enable MESSAGE CONTENT INTENT"); log(A.g + "  3. Interactions Endpoint URL: " + A.wk + `${ngrokUrl}/api/gateway/discord/${token}` + A.r);
      } else if (chName === "slack") {
        log(A.gk + "✓ Slack 端点就绪" + A.r);
        log(A.g + "  Event Request URL: " + A.wk + `${ngrokUrl}/api/gateway/slack/${token}` + A.r);
      } else if (chName === "dingtalk") {
        log(A.gk + "✓ 钉钉端点就绪" + A.r);
        log(A.g + "  Webhook URL: " + A.wk + `${ngrokUrl}/api/gateway/dingtalk/${token}` + A.r);
      }
    } catch { fail("连接失败，请确认 memi-server 已启动"); }
  },
};
