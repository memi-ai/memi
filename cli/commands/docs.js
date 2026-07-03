const { S, log, section, box } = require("../ui");

module.exports = {
  name: "docs",
  description: "View API documentation",
  usage: "memi docs",
  category: "system",
  run: async () => {
    section("API Documentation");
    log(`  ${S.ck}POST /api/v1/chat/completions${S.r}`);
    log(`  ${S.g}  Body: { model, messages, stream, thinking, systemPrompt }${S.r}`);
    log(`  ${S.g}  返回 OpenAI 兼容格式${S.r}\n`);
    log(`  ${S.ck}POST /api/gateway/telegram|wecom|qq/:token/setup${S.r}`);
    log(`  ${S.g}  注册消息渠道 webhook${S.r}\n`);
    log(`  ${S.ck}POST /api/gateway/feishu${S.r}`);
    log(`  ${S.g}  飞书事件回调${S.r}\n`);
    log(`  ${S.ck}GET /api/config  /api/balance  /api/sessions${S.r}`);
    log(`  ${S.g}  管理接口${S.r}\n`);
    log(`  ${S.ck}WebSocket: ws://localhost:3001/api/gateway/ws${S.r}`);
    log(`  ${S.g}  发送 { "message": "..." } → 返回响应${S.r}`);
    log("");
  },
};
