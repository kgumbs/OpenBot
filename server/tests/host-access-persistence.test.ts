import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostAccessBroker } from "../src/host-access/broker";
import { fileGrantStore } from "../src/host-access/grant-store";
const grant = {
  id: "native-approved",
  botId: "bot-a",
  actorId: "user-a",
  displayName: "BotFiles",
  revoked: false,
};
function fixture(run: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "openbot-grants-"));
  try {
    run(join(dir, "server.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("saved grants require native restoration after server restart", () =>
  fixture((path) => {
    const store = fileGrantStore(path);
    const first = createHostAccessBroker(Date.now, { grantStore: store });
    expect(first.restoreGrants([grant])).toEqual([grant.id]);
    const restarted = createHostAccessBroker(Date.now, { grantStore: store });
    expect(restarted.statusFor("user-a").grants[0]?.revoked).toBe(true);
    expect(restarted.restoreGrants([grant])).toEqual([grant.id]);
    restarted.nextDesktopOperation();
    expect(restarted.statusFor("user-a").grants[0]?.revoked).toBe(false);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  }));
test("revocation survives a restart and rejects stale native approval", () =>
  fixture((path) => {
    const store = fileGrantStore(path);
    const first = createHostAccessBroker(Date.now, { grantStore: store });
    first.restoreGrants([grant]);
    first.revokeGrant(grant.id, grant.actorId);
    const restarted = createHostAccessBroker(Date.now, { grantStore: store });
    expect(restarted.restoreGrants([grant])).toEqual([]);
  }));
test("Stop persists revocation and actor bindings cannot change", () =>
  fixture((path) => {
    const store = fileGrantStore(path);
    const first = createHostAccessBroker(Date.now, { grantStore: store });
    first.restoreGrants([grant]);
    expect(first.restoreGrants([{ ...grant, actorId: "other" }])).toEqual([]);
    first.stop(grant.actorId);
    expect(
      createHostAccessBroker(Date.now, { grantStore: store }).restoreGrants([
        grant,
      ]),
    ).toEqual([]);
  }));
test("corrupt state fails closed", () =>
  fixture((path) => {
    writeFileSync(path, '{"version":999,"grants":[]}');
    expect(() =>
      createHostAccessBroker(Date.now, { grantStore: fileGrantStore(path) }),
    ).toThrow("restoration is disabled");
  }));
test("lease expiry suspends access without permanently revoking approval", () =>
  fixture((path) => {
    let now = 0;
    const store = fileGrantStore(path);
    const broker = createHostAccessBroker(() => now, {
      grantStore: store,
      desktopLeaseMs: 10,
    });
    broker.restoreGrants([grant]);
    broker.nextDesktopOperation();
    now = 11;
    expect(broker.statusFor(grant.actorId).grants[0]?.revoked).toBe(true);
    expect(broker.restoreGrants([grant])).toEqual([grant.id]);
  }));
