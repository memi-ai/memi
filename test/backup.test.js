const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const backup = require(path.resolve(__dirname, "..", "memi-server", "utils", "backup"));

describe("Backup System", () => {
  const testDir = path.join(os.tmpdir(), "memi-test-" + Date.now());
  const snapshotsDir = path.join(testDir, "backups", "snapshots");
  const workspaceDir = path.join(testDir, "workspace");

  before(() => {
    fs.mkdirSync(snapshotsDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, "SOUL.md"), "# Test Soul");
    fs.writeFileSync(path.join(workspaceDir, "MEMORY.md"), "# Test Memory");
    // Mock global DIR
    global.__memi_test_dir = testDir;
  });

  after(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

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
      const name = b.snapshots[0].name;
      const result = backup.restoreBackup(name);
      assert.ok(result);
    }
  });
});
