const { loadCfg } = require("..");
const { S, log, section, table } = require("../ui");

module.exports = {
  name: "team",
  description: "Multi-agent collaboration",
  usage: "memi team",
  category: "management",
  run: async () => {
    const cfg = loadCfg();
    section("Multi-Agent Collaboration");
    const agentList = cfg.agents || [{ name: "default", model: cfg.api1?.model || "?", systemPrompt: "" }];
    const rows = agentList.map(a => [a.name, a.model || "?"]);
    table(["Agent", "Model"], rows);
    log(`  ${S.gray3}💡 在对话中 @agent名 调用其他 Agent${S.r}`);
    log("");
  },
};
