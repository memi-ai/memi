const { setLang, _lang } = require("..");
const { S, log } = require("../ui");

module.exports = {
  name: "lang",
  description: "Switch language (zh/en)",
  usage: "memi lang zh|en",
  category: "config",
  run: async (args) => {
    const la = args[0];
    if (la === "zh" || la === "en") {
      setLang(la);
      log(`  ${S.gkb}✔${S.r} Language → ${la === "zh" ? "中文" : "English"}${S.r}`);
    } else {
      log(`  ${S.g}memi lang zh|en${S.r}  (${_lang === "zh" ? "当前: 中文" : "Current: English"})${S.r}`);
    }
  },
};
