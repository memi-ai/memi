const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const backup = require(path.resolve(__dirname, "..", "memi-server", "utils", "backup"));

describe("Backup System", () => {

  it("createBackup returns snapshot name and git result", () => {
    const result = backup.createBackup("test-snapshot");
    assert.ok(result.snapshot);
    assert.ok(result.git);
    assert.ok(result.snapshot.includes("test-snapshot"));
  });

  it("listBackups returns snapshots and git tags", () => {
    const result = backup.listBackups();
    assert.ok(Array.isArray(result.snapshots));
    assert.ok(Array.isArray(result.git));
  });

  it("restoreBackup restores from snapshot", () => {
    const b = backup.listBackups();
    if (b.snapshots.length > 0) {
      const snap = b.snapshots[0];
      const result = backup.restoreBackup("snapshot", snap.name);
      assert.ok(result);
    }
  });
});
