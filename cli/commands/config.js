module.exports = {
  name: "config",
  aliases: ["cf"],
  description: "Edit configuration",
  usage: "memi config [edit]",
  category: "config",
  run: async (args) => {
    if (args[0] === "edit") {
      const onboardCmd = require("./onboard");
      await onboardCmd.run([]);
    } else {
      const statusCmd = require("./status");
      await statusCmd.run([]);
    }
  },
};
