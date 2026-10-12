import Docker from "dockerode";
import { createResourceMonitor } from "../../shared/resource-monitor";
import {
  capacityCheck,
  resourceState,
  type ResourceCheck,
  type ResourceScope,
} from "../../shared/resources";
import {
  BOT_LABEL,
  DEFAULT_NAMESPACE,
  NAMESPACE,
  NAMESPACE_LABEL,
  OWNER_LABEL,
  type ComputerNames,
} from "./names";
const docker = new Docker({
  ...(process.env.DOCKER_SOCKET
    ? { socketPath: process.env.DOCKER_SOCKET }
    : {}),
  timeout: 3000,
});
const monitor = createResourceMonitor("docker_runtime");
export function containerMemory(
  stats: {
    memory_stats?: {
      usage?: number;
      limit?: number;
      stats?: { inactive_file?: number; total_inactive_file?: number };
    };
  },
  configuredLimit: number,
): ResourceCheck {
  const memory = stats.memory_stats;
  if (
    !memory ||
    typeof memory.usage !== "number" ||
    typeof memory.limit !== "number"
  )
    return {
      id: "memory",
      state: "unknown",
      message: "Container memory: reading unavailable.",
    };
  // Match Docker's working-set accounting: reclaimable file cache is not memory pressure.
  const cache =
    memory.stats?.total_inactive_file ?? memory.stats?.inactive_file ?? 0;
  const used = Math.max(0, memory.usage - Math.min(memory.usage, cache));
  const check = capacityCheck(
    "memory",
    configuredLimit > 0
      ? "Container memory cap"
      : "Container share of Docker memory (no individual cap)",
    used,
    configuredLimit > 0 ? configuredLimit : memory.limit,
  );
  return check;
}
export function ownedResourceContainer(
  labels: Record<string, string> | undefined,
  botId: string,
) {
  return (
    labels?.[OWNER_LABEL] === "true" &&
    (labels[NAMESPACE_LABEL] ?? DEFAULT_NAMESPACE) === NAMESPACE &&
    labels[BOT_LABEL] === botId
  );
}
async function computer(names: ComputerNames): Promise<ResourceScope> {
  const checks: ResourceCheck[] = [];
  try {
    const container = docker.getContainer(names.container);
    const info = await container.inspect();
    if (!ownedResourceContainer(info.Config?.Labels, names.botId))
      throw new Error("not owned");
    if (info.State.Running)
      checks.push(
        containerMemory(
          await container.stats({ stream: false, "one-shot": true }),
          info.HostConfig.Memory ?? 0,
        ),
      );
    else
      checks.push({
        id: "memory",
        state: "unknown",
        message:
          "Bot container is stopped; current memory usage is unavailable.",
      });
    checks.push({
      id: "oom",
      state: info.State.OOMKilled ? "warning" : "ok",
      message: info.State.OOMKilled
        ? "Docker reports the last container exit was killed for lack of memory. This is historical evidence, not a current pressure reading."
        : "Docker reports no OOM kill for the last container exit.",
    });
  } catch {
    checks.push({
      id: "container",
      state: "unknown",
      message: "Bot container resource readings unavailable.",
    });
  }
  return {
    scope: "bot_container",
    label: "This Bot's container",
    checkedAt: new Date().toISOString(),
    state: resourceState(checks),
    checks,
  };
}
const cache = new Map<string, { at: number; value: ResourceScope }>();
const flights = new Map<string, Promise<ResourceScope>>();
async function cachedComputer(names: ComputerNames) {
  const cached = cache.get(names.botId);
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  let pending = flights.get(names.botId);
  if (!pending) {
    pending = computer(names)
      .then((value) => {
        if (cache.size >= 100) cache.delete(cache.keys().next().value ?? "");
        cache.set(names.botId, { at: Date.now(), value });
        return value;
      })
      .finally(() => {
        flights.delete(names.botId);
      });
    flights.set(names.botId, pending);
  }
  return pending;
}
export async function resourceSnapshot(names?: ComputerNames) {
  const scopes = [await monitor.snapshot()];
  if (names) scopes.push(await cachedComputer(names));
  return { scopes };
}
