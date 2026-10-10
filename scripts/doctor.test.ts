import { describe, expect, test } from "bun:test";
import { doctor, desktopCheck, intelligenceCheck, report, dependencies, type Dependencies } from "./doctor";

const root = "/moved/OpenBot";
function fixture(overrides: Partial<Dependencies> = {}) {
  const commands: string[][] = [];
  const deps: Dependencies = {
    bunVersion: "1.3.14", which: () => true, executable: async () => true,
    read: async path => path.endsWith("/.env") ? "CLAUDE_CODE_OAUTH_TOKEN=secret-test-token\nINTELLIGENCE_API_KEY=secret-project\nINTELLIGENCE_API_URL=https://example.invalid\nINTELLIGENCE_GATEWAY_WS_URL=wss://example.invalid" : path.endsWith("package.json") ? '{"packageManager":"bun@1.3.14"}' : undefined,
    http: async url => ({ status: 200, body: url.endsWith("/info") ? { mode: "intelligence", agents: { bot: {} }, licenseStatus: "valid", runtimeEntitlements: { status: "ready" } } : url.endsWith("/host-access") ? { connected: true, grants: [] } : url.includes(":4212/") ? { ok: true, harness: "claude-agent-sdk" } : { status: "ok" } }),
    command: async args => {
      commands.push(args);
      return { code: 0, out: args[0] === "ps" ? `${root}/desktop/src-tauri/target/debug/openbot-desktop\n` : args.includes("psql") ? "schema-ready\n" : args.includes("exec") ? "writable\n1000\nsandbox-on\n" : args.includes("agent-computer") ? '[{"ID":"abcdef123456"}]' : args.includes("-a") ? "" : '"29.0.1"' };
    }, ...overrides,
  };
  return { deps, commands };
}
const check = (r: Awaited<ReturnType<typeof doctor>>, id: string) => r.checks.find(c => c.id === id);

describe("Doctor readiness and privacy", () => {
  test("healthy relocated subscription deployment is ready, without folder grants", async () => {
    const { deps, commands } = fixture();
    const r = await doctor({ root }, deps);
    expect(r.state).toBe("ready");
    expect(check(r, "folders")?.status).toBe("info");
    expect(JSON.stringify(r)).not.toContain("secret-");
    expect(commands.find(a => a.includes("-a"))).toContain("label=openbot.namespace=openbot");
    expect(commands.find(a => a.includes("-a"))).toContain("label=openbot.supervisor=true");
    expect(commands.some(a => a.some(x => /^(restart|stop|up|down|rm|chown)$/.test(x)))).toBe(false);
    expect(commands.find(a => a.includes("psql"))?.at(-1)).toStartWith("select ");
  });
  test("missing configuration fails without leaking response bodies", async () => {
    const { deps } = fixture({ read: async () => undefined, http: async () => ({ status: 500, body: { error: "secret-error" } }) });
    const r = await doctor({ root }, deps);
    expect(r.exitCode).toBe(1);
    expect(check(r, "configuration")?.status).toBe("fail");
    expect(JSON.stringify(r)).not.toContain("secret-error");
  });
  test("Docker timeout is actionable", async () => {
    const { deps } = fixture({ command: async () => ({ code: -1, out: "", timedOut: true }) });
    const r = await doctor({ root }, deps);
    expect(check(r, "docker.engine")?.message).toContain("timed out");
  });
  test("unwritable root browser storage fails", async () => {
    const f = fixture(); const original = f.deps.command;
    f.deps.command = async args => args.includes("sh") ? { code: 0, out: "0\nsandbox-on\n" } : original(args, 100);
    const r = await doctor({ root }, f.deps);
    expect(check(r, "browser.abcdef123456.storage")?.status).toBe("fail");
    expect(check(r, "browser.abcdef123456.sandbox")?.status).toBe("warn");
  });
  test("rejects a wrong harness on the expected port", async () => {
    const f = fixture(); const original = f.deps.http;
    f.deps.http = async url => url.includes(":4212/") ? { status: 200, body: { ok: true, harness: "other" } } : original(url, 100);
    expect(check(await doctor({ root }, f.deps), "claude")?.status).toBe("fail");
  });
  test("invalid configured port fails", async () => {
    const f = fixture(); const original = f.deps.read;
    f.deps.read = async path => path.endsWith("/.env") ? `${await original(path)}\nAPP_PORT=not-a-port` : original(path);
    expect(check(await doctor({ root }, f.deps), "port.APP_PORT")?.status).toBe("fail");
  });
  test("real command timeout terminates a stalled child", async () => {
    const r = await dependencies.command([process.execPath, "-e", "setInterval(()=>{},1000)"], 100);
    expect(r.timedOut).toBe(true);
  });
});

test("outage does not recommend credential rotation", () => {
  const r = intelligenceCheck({ status: 503 });
  expect(r.status).toBe("warn"); expect(r.action).toContain("Do not rotate");
});
test("invalid licence differs from local sign-in failure", () => {
  expect(intelligenceCheck({ status: 200, body: { licenseStatus: "invalid" } }).status).toBe("fail");
  expect(intelligenceCheck({ status: 401 }).message).toContain("sign-in");
});
test("stale broker lease does not establish desktop readiness", () => {
  expect(desktopCheck({ status: 200, body: { connected: true } }, false).status).toBe("warn");
});
test("exit codes distinguish degraded and failed", () => {
  expect(report([{ id: "x", status: "warn", message: "x" }], "standard").exitCode).toBe(2);
  expect(report([{ id: "x", status: "fail", message: "x" }], "standard").exitCode).toBe(1);
});
