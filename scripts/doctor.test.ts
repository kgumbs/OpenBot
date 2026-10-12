import { describe, expect, test } from "bun:test";
import { doctor, desktopCheck, intelligenceCheck, report, dependencies, browserImageCheck, browserEndpointCheck, type Dependencies } from "./doctor";

const root = "/moved/OpenBot";
function fixture(overrides: Partial<Dependencies> = {}) {
  const commands: string[][] = [];
  const deps: Dependencies = {
    bunVersion: "1.3.14", which: () => true, executable: async () => true,
    read: async path => path.endsWith("/.env") ? "CLAUDE_CODE_OAUTH_TOKEN=secret-test-token\nINTELLIGENCE_API_KEY=secret-project\nINTELLIGENCE_API_URL=https://example.invalid\nINTELLIGENCE_GATEWAY_WS_URL=wss://example.invalid" : path.endsWith("package.json") ? '{"packageManager":"bun@1.3.14"}' : undefined,
    http: async url => ({ status: 200, body: url.endsWith("/info") ? { mode: "intelligence", agents: { bot: {} }, licenseStatus: "valid", runtimeEntitlements: { status: "ready" } } : url.endsWith("/host-access") ? { connected: true, grants: [] } : url.includes(":54000/") ? { status: "ok", browser: false, profile: {} } : url.includes(":4212/") ? { ok: true, harness: "claude-agent-sdk" } : { status: "ok" } }),
    command: async args => {
      commands.push(args);
      return { code: 0, out: args.includes("{{json .NetworkSettings.Ports}}") ? '{"4100/tcp":[{"HostIp":"127.0.0.1","HostPort":"54000"}]}' : args.includes("inspect") ? `sha256:${"a".repeat(64)}` : args[0] === "ps" ? `${root}/desktop/src-tauri/target/debug/openbot-desktop\n` : args.includes("psql") ? "schema-ready\n" : args.includes("exec") ? "writable\n1000\nsandbox-on\n" : args.includes("agent-computer") ? '[{"ID":"abcdef123456"}]' : args.includes("-a") ? "" : '"29.0.1"' };
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
  test("enabled local model must have a healthy LangGraph endpoint", async () => {
    const f = fixture(); const read = f.deps.read; const http = f.deps.http;
    f.deps.read = async path => path.endsWith("/.env") ? `${await read(path)}\nOPENBOT_LOCAL_MODEL=true` : read(path);
    f.deps.http = async url => url.includes(":4207/") ? { status: 200, body: { ok: true, harness: "langgraph" } } : http(url, 100);
    expect(check(await doctor({ root }, f.deps), "local-model")?.status).toBe("pass");
    f.deps.http = async url => url.includes(":4207/") ? { status: 503 } : http(url, 100);
    expect(check(await doctor({ root }, f.deps), "local-model")?.status).toBe("fail");
  });
  test("local model diagnostics distinguish missing runtime and missing model", async () => {
    const f = fixture(); const read = f.deps.read; const http = f.deps.http;
    f.deps.read = async path => path.endsWith("/.env") ? `${await read(path)}\nOPENBOT_LOCAL_MODEL=true\nLOCAL_BOT_MODEL=qwen3.5` : read(path);
    let reply: any = { status: 200, body: { models: [{ name: "qwen3.5:latest" }] } };
    f.deps.http = async url => url.includes(":11434/") ? reply : http(url, 100);
    expect(check(await doctor({ root }, f.deps), "local-model.installed")?.status).toBe("pass");
    reply = { status: 200, body: { models: [{ name: "other:latest" }, null, { name: 123 }] } };
    expect(check(await doctor({ root }, f.deps), "local-model.installed")?.status).toBe("fail");
    reply = { status: 503, body: { error: "secret-runtime-error" } };
    const report = await doctor({ root }, f.deps);
    expect(check(report, "local-model.runtime")?.status).toBe("fail");
    expect(check(report, "local-model.installed")).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain("secret-runtime-error");
  });
  test("disabled local model does not contact Ollama", async () => {
    const f = fixture(); const http = f.deps.http; const urls: string[] = [];
    f.deps.http = async url => { urls.push(url); return http(url, 100); };
    await doctor({ root }, f.deps);
    expect(urls.some(url => url.includes(":11434/"))).toBe(false);
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


test("stale browser image degrades readiness without printing metadata", () => {
  const r = browserImageCheck("abcdef123456", `sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`);
  expect(r.status).toBe("warn");
  expect(r.action).toContain("preserving its named volumes");
  expect(report([r], "subscriptions").exitCode).toBe(2);
});
test("matching browser image passes", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  expect(browserImageCheck("abcdef123456", digest, digest).status).toBe("pass");
});
test("malformed or missing digest is unknown, never fresh", () => {
  for (const value of ["", "sha256:bad", "private-error-body"]) {
    const r = browserImageCheck("abcdef123456", value, value);
    expect(r.status).toBe("warn");
    expect(JSON.stringify(r)).not.toContain("private-error-body");
  }
});
test("Doctor reads narrow digest fields and warns when a computer needs recreation", async () => {
  const f = fixture(); const original = f.deps.command;
  f.deps.command = async (args, timeout) => args[1] === "container" ? { code: 0, out: `sha256:${"b".repeat(64)}` } : original(args, timeout);
  const r = await doctor({ root }, f.deps);
  expect(check(r, "browser.abcdef123456.image")?.status).toBe("warn");
  expect(r.state).toBe("degraded");
  expect(f.commands.find(a => a[1] === "image")).toContain("{{.Id}}");
});

test("published browser ports must return computer metadata, not empty HTTP 200", () => {
  expect(browserEndpointCheck("id", { status: 200 }).status).toBe("fail");
  expect(browserEndpointCheck("id", { status: 200, body: { status: "ok" } }).status).toBe("fail");
  expect(browserEndpointCheck("id", { status: 404, body: { error: "private-error" } }).status).toBe("fail");
  expect(JSON.stringify(browserEndpointCheck("id", { status: 404, body: { error: "private-error" } }))).not.toContain("private-error");
  expect(browserEndpointCheck("id", { status: 200, body: { status: "ok", browser: false, profile: {} } }).status).toBe("pass");
});
