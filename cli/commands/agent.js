const { loadCfg } = require("..");
const { S, log, section } = require("../ui");

module.exports = {
  name: "agent",
  description: "Show agent info",
  usage: "memi agent",
  category: "core",
  run: async () => {
    section("Agent Info");
    const ac = loadCfg();
    log(`  ${S.g}模型${S.r}    ${S.wk}${(ac.api1 && ac.api1.model) || "未配置"}${S.r}`);
    log(`  ${S.g}端点${S.r}    ${S.wk}${(ac.api1 && ac.api1.baseUrl) || "未配置"}${S.r}`);
    log(`  ${S.g}工具${S.r}    ${S.wk}12${S.r} ${S.g}(文件/搜索/命令/计算/时间/技能/生图)${S.r}`);
    log(`  ${S.g}迭代${S.r}    ${S.wk}8${S.r} ${S.g}轮上限${S.r}`);
    log("");
  },
};
