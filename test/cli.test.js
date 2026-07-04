const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");

describe("CLI Framework", () => {
  it("loadCommands discovers all command files", () => {
    const cli = require(path.resolve(__dirname, "..", "cli", "index"));
    const cmds = cli.getCommands();
    assert.ok(cmds.length > 0);

    const names = cmds.map(c => c.name);
    assert.ok(names.includes("chat"));
    assert.ok(names.includes("help"));
    assert.ok(names.includes("status"));
    assert.ok(names.includes("provider"));
    assert.ok(names.includes("completion"));
    assert.ok(names.includes("backup"));
    assert.ok(names.includes("restore"));
  });

  it("each command has required fields", () => {
    const cli = require(path.resolve(__dirname, "..", "cli", "index"));
    const cmds = cli.getCommands();
    for (const cmd of cmds) {
      assert.ok(typeof cmd.name === "string", `${cmd.name}: missing name`);
      assert.ok(typeof cmd.description === "string", `${cmd.name}: missing description`);
      assert.ok(typeof cmd.run === "function", `${cmd.name}: missing run()`);
    }
  });
});
