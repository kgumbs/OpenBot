import { z } from "zod";
import { createResourceMonitor } from "../../../shared/resource-monitor";
import {
  resourceGuidance,
  resourceState,
  type ResourceReport,
  type ResourceScope,
} from "../../../shared/resources";
import type { GrantedTool } from "../plugins/tools";
const checkSchema = z.object({
  id: z.string().max(80),
  state: z.enum(["ok", "warning", "critical", "unknown"]),
  message: z.string().max(500),
  percent: z.number().finite().min(0).max(100).optional(),
  availableBytes: z.number().finite().nonnegative().optional(),
  totalBytes: z.number().finite().nonnegative().optional(),
});
const scopeSchema = z.object({
  scope: z.enum(["docker_runtime", "bot_container"]),
  label: z.string().max(160),
  checkedAt: z.string().datetime(),
  state: z.enum(["ok", "warning", "critical", "unknown"]),
  checks: z.array(checkSchema).max(10),
});
export function createResourceService(
  options: {
    supervisor?: { baseUrl: string; token?: string };
    fetchImpl?: typeof fetch;
    monitor?: Pick<ReturnType<typeof createResourceMonitor>, "snapshot">;
  } = {},
) {
  const monitor = options.monitor ?? createResourceMonitor();
  const cache = new Map<string, { at: number; scopes: ResourceScope[] }>();
  const flights = new Map<string, Promise<ResourceScope[]>>();
  async function remote(botId?: string): Promise<ResourceScope[]> {
    if (!options.supervisor) return [];
    const key = botId ?? "";
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 15_000) return cached.scopes;
    let pending = flights.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const response = await (options.fetchImpl ?? fetch)(
            `${options.supervisor?.baseUrl.replace(/\/$/, "")}/resources${botId ? `/${encodeURIComponent(botId)}` : ""}`,
            {
              headers: options.supervisor?.token
                ? { authorization: `Bearer ${options.supervisor.token}` }
                : {},
              signal: AbortSignal.timeout(4000),
            },
          );
          if (!response.ok) throw new Error("unavailable");
          const parsed = z
            .object({ scopes: z.array(scopeSchema).max(2) })
            .parse(await response.json());
          const scopes = parsed.scopes.map((scope) => ({
            ...scope,
            state: resourceState(scope.checks),
          }));
          if (
            !scopes.some((scope) => scope.scope === "docker_runtime") ||
            (botId && !scopes.some((scope) => scope.scope === "bot_container"))
          )
            throw new Error("incomplete");
          if (
            scopes.some(
              (scope) =>
                Date.now() - Date.parse(scope.checkedAt) > 60_000 ||
                Date.parse(scope.checkedAt) > Date.now() + 5000,
            )
          )
            throw new Error("stale");
          return scopes;
        } catch {
          return [
            {
              scope: "docker_runtime" as const,
              label: "Docker runtime / VM",
              checkedAt: new Date().toISOString(),
              state: "unknown" as const,
              checks: [
                {
                  id: "supervisor",
                  state: "unknown" as const,
                  message: "Resource readings unavailable from the supervisor.",
                },
              ],
            },
          ];
        }
      })()
        .then((scopes) => {
          // Bound the cache: callers cannot grow it forever by selecting Bots.
          if (cache.size >= 100) cache.delete(cache.keys().next().value ?? "");
          cache.set(key, { at: Date.now(), scopes });
          return scopes;
        })
        .finally(() => {
          flights.delete(key);
        });
      flights.set(key, pending);
    }
    return pending;
  }
  return {
    async snapshot(botId?: string): Promise<ResourceReport> {
      const [local, docker] = await Promise.all([
        monitor.snapshot(),
        remote(botId),
      ]);
      const scopes = [local, ...docker];
      return {
        checkedAt: new Date().toISOString(),
        state: resourceState(scopes),
        scopes,
      };
    },
  };
}
export type ResourceService = ReturnType<typeof createResourceService>;
export function resourceTools(
  service: ResourceService,
  botId: string,
): GrantedTool[] {
  return [
    {
      name: "system_resource_status",
      ref: "system/system_resource_status",
      description:
        "Read current system resource pressure: host or API runtime, Docker runtime / VM and this Bot's container when available. Reports memory, sustained CPU, disk capacity, container memory and last-exit OOM evidence, with timestamps and unknown readings. Use when work is slow or tools fail; do not infer low resources from a timeout alone. This tool does not start, stop or alter anything.",
      parameters: z.object({}).strict(),
      execute: async () => JSON.stringify(await service.snapshot(botId)),
    },
  ];
}
export { resourceGuidance };
