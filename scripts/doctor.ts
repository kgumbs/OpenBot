import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export type Check = { id: string; status: "pass" | "info" | "warn" | "fail"; message: string; action?: string };
export type CommandResult = { code: number; out: string; timedOut?: boolean };
export type Probe = { status: number; body?: any };
export type Dependencies = {
  read(path: string): Promise<string | undefined>;
  executable(path: string): Promise<boolean>;
  which(name: string): boolean;
  command(args: string[], timeout: number): Promise<CommandResult>;
  http(url: string, timeout: number): Promise<Probe>;
  bunVersion: string;
};
export const dependencies: Dependencies = {
  read: (path) => readFile(path, "utf8").catch(() => undefined),
  executable: (path) => access(path, constants.X_OK).then(() => true, () => false),
  which: (name) => !!Bun.which(name),
  bunVersion: Bun.version,
  async command(args, timeout) {
    let child: Bun.Subprocess<"ignore", "pipe", "ignore"> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      child = Bun.spawn(args, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
      timer = setTimeout(() => { timedOut = true; child?.kill("SIGKILL"); }, timeout);
      const [code, out] = await Promise.all([child.exited, new Response(child.stdout).text()]);
      return { code, out, timedOut };
    } catch { return { code: -1, out: "" }; }
    finally { clearTimeout(timer); }
  },
  async http(url, timeout) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: "error" });
      // Never retain raw HTML, model replies, keys, or arbitrary server errors in a report.
      const body = await response.json().catch(() => undefined);
      return { status: response.status, body };
    } catch { return { status: 0 }; }
  },
};

export function report(checks: Check[], profile: string) {
  const state = checks.some(c => c.status === "fail") ? "failed" : checks.some(c => c.status === "warn") ? "degraded" : "ready";
  return { schemaVersion: 1, profile, state, exitCode: state === "failed" ? 1 : state === "degraded" ? 2 : 0, checks };
}

export function intelligenceCheck(probe: Probe): Check {
  const base = { id: "intelligence" };
  const value = probe.body;
  if (probe.status === 503 || value?.runtimeEntitlements?.status === "unavailable")
    return { ...base, status: "warn", message: "Intelligence is unavailable; model runs may be blocked.", action: "Retry after the Intelligence service recovers. Do not rotate credentials for an outage." };
  if (probe.status === 401 || probe.status === 403)
    return { ...base, status: "fail", message: "The local diagnostic endpoint requires sign-in.", action: "Sign in to OpenBot; this response does not establish whether the Intelligence key is invalid." };
  if (value?.licenseStatus === "invalid" || value?.licenseStatus === "expired")
    return { ...base, status: "fail", message: "Intelligence reports an invalid or expired licence.", action: "Check the configured project and its licence in Intelligence administration." };
  if (probe.status === 200 && value?.licenseStatus === "valid" && value?.runtimeEntitlements?.status === "ready")
    return { ...base, status: "pass", message: "Intelligence licence valid; entitlements ready." };
  return { ...base, status: "warn", message: "Intelligence readiness could not be established.", action: "Check Intelligence availability and runtime entitlement status in OpenBot." };
}

export function desktopCheck(probe: Probe, processRunning: boolean | undefined): Check {
  if (probe.status !== 200 || typeof probe.body?.connected !== "boolean")
    return { id: "desktop", status: "warn", message: "Native folder broker status is unavailable.", action: "Check API health and sign-in before diagnosing folder permissions." };
  if (probe.body.connected && processRunning === true)
    return { id: "desktop", status: "pass", message: "Desktop process is running and the API reports an unexpired broker lease." };
  if (probe.body.connected && processRunning === false)
    return { id: "desktop", status: "warn", message: "Broker status is stale: connected is true but this clone's desktop process is absent.", action: "Restart through start-openbot.command after the old broker lease expires." };
  return { id: "desktop", status: "warn", message: processRunning === undefined ? "Desktop process state could not be checked." : "Native folder broker is disconnected.", action: "Quit any disconnected desktop instance and run start-openbot.command." };
}

export async function doctor(options: { root: string; timeout?: number; profile?: "subscriptions" | "standard" }, deps: Dependencies = dependencies) {
  const root = resolve(options.root), timeout = options.timeout ?? 5000;
  const checks: Check[] = [];
  const add = (id: string, status: Check["status"], message: string, action?: string) => checks.push({ id, status, message, ...(action ? { action } : {}) });
  const envText = await deps.read(resolve(root, ".env"));
  let env: Record<string, string> = {};
  try { env = parseEnv(envText ?? ""); } catch { add("configuration", "fail", "The .env file cannot be parsed.", "Repair its syntax without sharing its values."); }
  const profile = options.profile ?? (env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ? "subscriptions" : "standard");
  if (envText === undefined) add("configuration", "fail", ".env is missing.", "Follow the setup guide; retain any existing credentials securely.");
  else if (!checks.some(c => c.id === "configuration")) add("configuration", "pass", "Local environment file is readable; values are excluded from this report.");
  let pinned = "1.3.14";
  try { pinned = JSON.parse(await deps.read(resolve(root, "package.json")) ?? "{}").packageManager?.replace(/^bun@/, "") ?? pinned; } catch {}
  add("bun", deps.bunVersion === pinned ? "pass" : "fail", deps.bunVersion === pinned ? "Bun matches the repository pin." : "Bun differs from the repository pin.", deps.bunVersion === pinned ? undefined : "Run doctor-openbot.command to use the saved pinned runtime.");
  for (const tool of ["docker", "curl", "openssl", "lsof", "node", "npx"])
    add(`utility.${tool}`, deps.which(tool) ? "pass" : "fail", deps.which(tool) ? `${tool} is available.` : `${tool} is missing.`, deps.which(tool) ? undefined : `Install ${tool} before using the corresponding setup/startup workflow.`);
  add("intelligence.configuration", env.INTELLIGENCE_API_KEY?.trim() && env.INTELLIGENCE_API_URL?.trim() && env.INTELLIGENCE_GATEWAY_WS_URL?.trim() ? "pass" : "fail", "Intelligence requires a project key, API URL, and gateway URL; credential validity is checked separately.");
  const port = (name: string, fallback: number) => {
    const value = env[name]?.trim();
    const parsed = value ? Number(value) : fallback;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) { add(`port.${name}`, "fail", `${name} is not a valid port.`); return undefined; }
    return parsed;
  };
  const appPort = port("APP_PORT", 3010), serverPort = port("SERVER_PORT", 3001);
  const computerPort = port("COMPUTER_PORT", 4100), supervisorPort = port("SUPERVISOR_PORT", 4500);
  const oneEach = env.OPENBOT_ONE_COMPUTER_EACH !== "false";
  const chatgpt = !!(await deps.read(resolve(root, ".env.chatgpt/chatgpt-auth.json")))?.trim();
  if (profile === "subscriptions") {
    add("claude.credentials", env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ? "pass" : "fail", env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ? "Claude credential is saved; expiry is not tested by a health probe." : "Claude credential is missing.", env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ? undefined : "Run claude setup-token yourself and save its token in .env.");
    add("chatgpt.credentials", chatgpt ? "pass" : "info", chatgpt ? "ChatGPT sign-in store exists; expiry is not tested by a health probe." : "ChatGPT is not configured; the subscription launcher will run Claude only.");
    add("desktop.asset", await deps.executable(resolve(root, "desktop/src-tauri/target/debug/openbot-desktop")) ? "pass" : "fail", "Native folder access requires the source-built desktop executable.", "See docs/local-subscriptions.md for the build workflow.");
  } else {
    const provider = env.BOT_PROVIDER?.trim() || "openai";
    const key = provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "google" ? "GOOGLE_API_KEY" : "OPENAI_API_KEY";
    add("model.configuration", env[key]?.trim() || (provider === "openai" && env.OPENAI_BASE_URL?.trim()) ? "pass" : "fail", "Model access must be configured; health probes do not test model inference.");
  }
  const endpoint = async (id: string, endpointPort: number | undefined, path: string, json = true) => {
    if (endpointPort === undefined) return { status: 0 };
    const probe = await deps.http(`http://127.0.0.1:${endpointPort}${path}`, timeout);
    const valid = probe.status === 200 && (!json || (["claude", "chatgpt", "langgraph"].includes(id) ? probe.body?.ok === true && probe.body?.harness === (id === "claude" ? "claude-agent-sdk" : "langgraph") : probe.body?.status === "ok"));
    add(id, valid ? "pass" : "fail", valid ? `${id} endpoint responds as expected.` : `${id} endpoint is unavailable or is not the expected service.`, valid ? undefined : "Check the corresponding service and configured port; Doctor does not restart anything.");
    return probe;
  };
  await Promise.all([
    endpoint("web", appPort, "/", false),
    endpoint("computer", computerPort, "/health"),
    ...(oneEach ? [endpoint("supervisor", supervisorPort, "/health")] : []),
    ...(profile === "subscriptions" ? [endpoint("claude", 4212, "/health"), ...(chatgpt ? [endpoint("chatgpt", 4206, "/health")] : [])] : [endpoint("langgraph", port("LANGGRAPH_PORT", 4201), "/health")]),
  ]);
  if (serverPort !== undefined) {
    const info = await deps.http(`http://127.0.0.1:${serverPort}/api/copilotkit/info`, timeout);
    const identified = info.status === 200 && info.body?.mode === "intelligence" && typeof info.body?.agents === "object";
    add("api", identified ? "pass" : "fail", identified ? "OpenBot API responds with runtime metadata." : "OpenBot API is unavailable, requires sign-in, or returns unexpected metadata.");
    checks.push(intelligenceCheck(info));
    if (identified) add("bots", Object.keys(info.body.agents ?? {}).length ? "pass" : "fail", Object.keys(info.body.agents ?? {}).length ? "Bots are registered." : "No Bots are registered.");
    if (profile === "subscriptions") {
      const [host, processes] = await Promise.all([
        deps.http(`http://127.0.0.1:${serverPort}/api/host-access`, timeout),
        deps.command(["ps", "-axo", "comm="], timeout),
      ]);
      const binary = resolve(root, "desktop/src-tauri/target/debug/openbot-desktop");
      const running = processes.code === 0 ? processes.out.split("\n").some(line => line.trim() === binary) : undefined;
      checks.push(desktopCheck(host, running));
      if (host.status === 200 && Array.isArray(host.body?.grants)) {
        const count = host.body.grants.filter((g: any) => g.revoked === false).length;
        add("folders", "info", count ? `${count} active folder grants; permissions remain per Bot.` : "No active folder grants. Select folders per Bot in Admin > Computers when needed.");
      }
    }
  }
  if (deps.which("docker")) {
    const engine = await deps.command(["docker", "info", "--format", "{{json .ServerVersion}}"], timeout);
    add("docker.engine", engine.code === 0 && !!engine.out.trim() ? "pass" : "fail", engine.timedOut ? "Docker engine check timed out." : engine.code === 0 ? "Docker engine is reachable." : "Docker engine is unavailable.", engine.code === 0 ? undefined : "Open Docker Desktop and check its engine; Doctor will not restart it.");
    const compose = await deps.command(["docker", "compose", "version", "--short"], timeout);
    add("docker.compose", compose.code === 0 ? "pass" : "fail", compose.code === 0 ? "Docker Compose is available." : "Docker Compose is unavailable.");
    if (engine.code === 0) {
      // Query this Compose deployment only. Never inspect unrelated workloads or container Env.
      const args = ["docker", "compose", "--project-directory", root, "-f", resolve(root, "docker-compose.yml"), ...(profile === "subscriptions" ? ["-f", resolve(root, "docker-compose.subscriptions.yml")] : [])];
      const database = await deps.command([...args, "exec", "-T", "postgres", "psql", "-U", "openbot", "-d", "openbot", "-tAc", "select case when to_regclass('public.agent_profiles') is not null and to_regclass('public.agent_preferences') is not null then 'schema-ready' else 'schema-missing' end"], timeout);
      add("database", database.code === 0 && database.out.trim() === "schema-ready" ? "pass" : "fail", database.code === 0 && database.out.trim() === "schema-ready" ? "PostgreSQL is reachable and required coworker tables exist." : "PostgreSQL or the required coworker schema is unavailable.", database.code === 0 && database.out.trim() === "schema-ready" ? undefined : "Check PostgreSQL health and apply migrations through the supported launcher.");
      const shared = await deps.command([...args, "ps", "--all", "--format", "json", "agent-computer"], timeout);
      let container: any;
      try { const rows = shared.out.trim().startsWith("[") ? JSON.parse(shared.out) : shared.out.trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); container = rows[0]; } catch {}
      const namespace = env.COMPUTER_NAMESPACE?.trim() || "openbot";
      const owned = await deps.command(["docker", "ps", "-a", "--filter", "label=openbot.supervisor=true", "--filter", `label=openbot.namespace=${namespace}`, "--format", "{{.ID}}"], timeout);
      const ids = [...new Set([...(container?.ID ? [container.ID] : []), ...owned.out.trim().split("\n").filter(Boolean)])].filter(id => typeof id === "string" && /^[a-f0-9]{12,64}$/.test(id));
      if (shared.code !== 0 || owned.code !== 0) add("browser.storage", "warn", "Browser container discovery is unavailable.");
      else if (!ids.length) add("browser.storage", "warn", "No computer containers are available for a storage/sandbox check.");
      else {
        for (const id of ids.slice(0, 32)) {
          const result = await deps.command(["docker", "exec", id, "sh", "-c", 'test -w /profiles && test -w /workspace && printf "writable\\n"; id -u; if [ "$COMPUTER_SANDBOX" = on ]; then printf "sandbox-on\\n"; fi'], timeout);
          const lines = result.out.trim().split("\n");
          add(`browser.${id}.storage`, result.code === 0 && lines.includes("writable") ? "pass" : "fail", result.code === 0 && lines.includes("writable") ? "Browser storage is writable by its runtime user." : "Browser storage is not writable or its container is stopped.", result.code === 0 && lines.includes("writable") ? undefined : "Inspect this computer's /profiles and /workspace volume ownership. Use a scoped ownership migration; do not delete its data or disable sandboxing.");
          add(`browser.${id}.sandbox`, lines.includes("sandbox-on") && lines.some(line => /^[1-9][0-9]*$/.test(line)) ? "pass" : "warn", lines.includes("sandbox-on") && lines.some(line => /^[1-9][0-9]*$/.test(line)) ? "Browser is non-root with sandboxing configured; no browser was launched by Doctor." : "Browser sandbox configuration could not be verified as non-root and enabled.");
        }
        if (ids.length > 32) add("browser.limit", "warn", "Only the first 32 computer containers were inspected.");
      }
    }
  }
  return report(checks.sort((a, b) => a.id.localeCompare(b.id)), profile);
}

export async function main(args: string[]) {
  let json = false, timeout = 5000, profile: "standard" | "subscriptions" | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") { console.log("Usage: bash doctor-openbot.command [--json] [--profile subscriptions|standard] [--timeout-ms 100..30000]\nRead-only local diagnostics. Exit 0 ready, 2 degraded, 1 failed, 64 invalid arguments. No model calls or folder approvals."); return 0; }
    if (arg === "--json") json = true;
    else if (arg === "--timeout-ms") timeout = Number(args[++i]);
    else if (arg === "--profile" && ["standard", "subscriptions"].includes(args[i + 1] ?? "")) profile = args[++i] as typeof profile;
    else { console.error("Invalid arguments. Use --help."); return 64; }
  }
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) { console.error("Invalid timeout. Use 100..30000 milliseconds."); return 64; }
  try {
    const result = await doctor({ root: resolve(import.meta.dir, ".."), timeout, profile });
    if (json) console.log(JSON.stringify(result, null, 2));
    else { console.log(`OpenBot Doctor: ${result.state} (${result.profile})`); for (const c of result.checks) console.log(`[${c.status.toUpperCase()}] ${c.id}: ${c.message}${c.action ? `\n  ${c.action}` : ""}`); }
    return result.exitCode;
  } catch {
    const result = report([{ id: "doctor", status: "fail", message: "Diagnostics could not complete. Check local permissions and retry; raw errors are suppressed to protect credentials." }], profile ?? "auto");
    console.log(json ? JSON.stringify(result) : result.checks[0]!.message);
    return 1;
  }
}
if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
