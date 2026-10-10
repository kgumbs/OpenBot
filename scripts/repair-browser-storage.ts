import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { dependencies, type Dependencies } from "./doctor";

type Volume = { name: string; destination: string };
export type RepairPlan = { container: string; image: string; volumes: Volume[]; running: boolean };

export function validateTarget(info: any, namespace: string, sharedIds: string[]): RepairPlan {
  const labels = info?.Config?.Labels ?? {};
  if (!/^[a-f0-9]{64}$/.test(info?.Id ?? "")) throw new Error("Invalid container identity.");
  if (!sharedIds.includes(info.Id) && !(labels["openbot.supervisor"] === "true" && (labels["openbot.namespace"] ?? "openbot") === namespace))
    throw new Error("Container does not belong to this deployment.");
  if (info.Config?.User !== "1000:1000") throw new Error("Expected the non-root browser image with user 1000:1000.");
  if (!/^sha256:[a-f0-9]{64}$/.test(info.Image ?? "")) throw new Error("Invalid local image identity.");
  const volumes = ["/profiles", "/workspace"].map(destination => {
    const matches = (info.Mounts ?? []).filter((m: any) => m.Destination === destination);
    const m = matches[0];
    if (matches.length !== 1 || m.Type !== "volume" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(m.Name ?? "") || !m.RW)
      throw new Error("Expected writable named browser volumes; bind mounts are not repairable.");
    return { name: m.Name, destination };
  });
  if (volumes[0]!.name === volumes[1]!.name) throw new Error("Browser mounts must use separate volumes.");
  return { container: info.Id, image: info.Image, volumes, running: info.State?.Running === true };
}

export function helperArgs(plan: RepairPlan, name = `openbot-volume-repair-${crypto.randomUUID()}`) {
  return ["docker", "run", "--rm", "--name", name, "--pull=never", "--network=none", "--read-only", "--user=0:0", "--cap-drop=ALL", "--cap-add=CHOWN", "--cap-add=DAC_OVERRIDE", "--security-opt=no-new-privileges=true", "--pids-limit=32", "--memory=128m", "--cpus=1",
    ...plan.volumes.flatMap(v => ["--mount", `type=volume,src=${v.name},dst=/repair${v.destination},volume-nocopy`]),
    "--entrypoint=/bin/chown", plan.image, "-hRP", "1000:1000", "--", "/repair/profiles", "/repair/workspace"];
}

export async function repair(root: string, target: string, apply: boolean, deps: Dependencies = dependencies) {
  if (!/^[a-f0-9]{12,64}$/.test(target)) throw new Error("Use a Docker container ID (12–64 lowercase hexadecimal characters).");
  const env = parseEnv(await deps.read(resolve(root, ".env")) ?? "");
  const namespace = env.COMPUTER_NAMESPACE?.trim() || "openbot";
  async function command(args: string[], timeout = 5000) {
    const result = await deps.command(args, timeout);
    if (result.code !== 0 || result.timedOut) throw new Error("Docker operation failed or timed out. Check Docker and retry; raw errors are suppressed.");
    return result.out.trim();
  }
  const compose = ["docker", "compose", "--project-directory", root, "-f", resolve(root, "docker-compose.yml"), "-f", resolve(root, "docker-compose.subscriptions.yml")];
  const shared = (await command([...compose, "ps", "--all", "--quiet", "agent-computer"])).split("\n").filter(Boolean);
  async function inspect() {
    const rows = JSON.parse(await command(["docker", "inspect", "--type=container", target]));
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Expected exactly one browser container.");
    return validateTarget(rows[0], namespace, shared);
  }
  const plan = await inspect();
  for (const volume of plan.volumes) {
    const rows = JSON.parse(await command(["docker", "volume", "inspect", volume.name]));
    const v = rows?.[0];
    if (rows.length !== 1 || v?.Name !== volume.name || v.Driver !== "local" || Object.keys(v.Options ?? {}).length)
      throw new Error("Only ordinary local Docker volumes without driver options can be repaired.");
  }
  if (!apply) return plan;
  if (plan.running) throw new Error("Stop the browser container before applying repair.");
  // Check again before mutation. Stop OpenBot services first to prevent automatic recreation.
  if (JSON.stringify(await inspect()) !== JSON.stringify(plan)) throw new Error("Container configuration changed; preview again.");
  for (const volume of plan.volumes) {
    if (await command(["docker", "ps", "--quiet", "--filter", `volume=${volume.name}`]))
      throw new Error("A running container uses this volume. Stop all consumers before repairing.");
  }
  const helper = `openbot-volume-repair-${crypto.randomUUID()}`;
  try {
    await command(helperArgs(plan, helper), 120000);
  } catch (error) {
    // Killing the CLI alone does not stop a daemon-side helper. Clean up our exact name.
    await deps.command(["docker", "rm", "--force", helper], 5000);
    throw error;
  }
  return plan;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: bash repair-browser-storage.command CONTAINER_ID [--apply]\nDefault: preview only. Apply requires stopped browser and volume consumers. Never deletes data; changes ownership recursively to 1000:1000.");
  } else if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== "--apply")) {
    console.error("Invalid arguments. Use --help."); process.exitCode = 64;
  } else {
    try {
      const plan = await repair(resolve(import.meta.dir, ".."), args[0]!, args[1] === "--apply");
      console.log(JSON.stringify({ mode: args[1] === "--apply" ? "repaired" : "preview", ...plan, ownership: "1000:1000" }, null, 2));
      if (args[1] !== "--apply") console.log("Preview only. Back up these volumes and stop OpenBot services before applying. Re-run with --apply after reviewing the targets.");
    } catch (error) {
      // Only our static messages are public; JSON/OS exceptions may contain private data.
      const message = error instanceof Error && /^(Use a Docker|Container does|Invalid container|Expected |Invalid local|Browser mounts|Docker operation|Only ordinary|Stop the browser|Container configuration|A running)/.test(error.message) ? error.message : "Repair could not complete. Check local Docker metadata; raw errors are suppressed.";
      console.error(message); process.exitCode = 1;
    }
  }
}
