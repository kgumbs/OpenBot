import { resolve } from "node:path";
import { dependencies, doctor, type Check } from "./doctor";

export function startupDecision(checks: Check[]) {
  const desktop = checks.find(c => c.id === "desktop");
  if (desktop?.status === "pass") return checks.some(c => c.status === "fail") ? "repair-services" : "reuse";
  return "attach-desktop";
}

export async function desktopPids(root: string) {
  const result = await dependencies.command(["ps", "-axo", "pid=,comm="], 3000);
  if (result.code !== 0) throw new Error("Cannot verify desktop process ownership.");
  const binary = resolve(root, "desktop/src-tauri/target/debug/openbot-desktop");
  return result.out.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    return match && match[2] === binary ? [Number(match[1])] : [];
  });
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  try {
    const mode = process.argv[2];
    if (mode === "desktop-state") {
      const pids = await desktopPids(root);
      const result = await doctor({ root, profile: "subscriptions", timeout: 1500 });
      console.log(pids.length ? startupDecision(result.checks) === "attach-desktop" ? "disconnected" : startupDecision(result.checks) : "absent");
    } else if (mode === "stop-desktop") {
      // Re-read ownership immediately before each signal; never match another clone by name.
      for (const pid of await desktopPids(root)) {
        if ((await desktopPids(root)).includes(pid)) process.kill(pid, "SIGTERM");
      }
      for (let i = 0; i < 50 && (await desktopPids(root)).length; i++) await Bun.sleep(100);
      if ((await desktopPids(root)).length) throw new Error("Desktop did not exit.");
    } else if (mode === "wait") {
      let result;
      for (let i = 0; i < 10; i++) {
        result = await doctor({ root, profile: "subscriptions", timeout: 1500 });
        if (!result.checks.some(c => c.status === "fail" || (c.id === "desktop" && c.status !== "pass"))) break;
        if (i < 9) await Bun.sleep(1000);
      }
      console.log(`OpenBot readiness: ${result!.state}`);
      for (const c of result!.checks.filter(c => c.status === "warn" || c.status === "fail")) console.log(`[${c.status}] ${c.id}: ${c.message}${c.action ? `\n  ${c.action}` : ""}`);
      process.exitCode = result!.exitCode;
    } else throw new Error("Invalid startup health operation.");
  } catch {
    console.error("Startup verification failed. Run bash doctor-openbot.command; no raw errors are printed.");
    process.exitCode = 1;
  }
}
