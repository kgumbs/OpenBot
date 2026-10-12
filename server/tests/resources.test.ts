import { expect, test } from "bun:test";
import { z } from "zod";
import {
  capacityCheck,
  createCpuPressure,
  resourceGuidance,
  resourceState,
  type ResourceScope,
} from "../../shared/resources";
import {
  cgroupMemory,
  linuxAvailableMemory,
  macMemoryPressure,
} from "../../shared/resource-monitor";
import { createResourceService, resourceTools } from "../src/resources/service";
import { createResourceRoutes } from "../src/resources/routes";
const scope = (state: "ok" | "warning" = "ok"): ResourceScope => ({
  scope: "host",
  label: "Host",
  checkedAt: new Date().toISOString(),
  state,
  checks: [{ id: "memory", state, message: "Memory pressure warning." }],
});
test("capacity pressure handles thresholds and invalid readings", () => {
  expect(capacityCheck("disk", "Disk", 89, 100).state).toBe("ok");
  expect(capacityCheck("disk", "Disk", 90, 100).state).toBe("warning");
  expect(capacityCheck("disk", "Disk", 95, 100).state).toBe("critical");
  for (const total of [0, NaN, Infinity, -1])
    expect(capacityCheck("disk", "Disk", 10, total).state).toBe("unknown");
  expect(resourceState([{ state: "unknown" }, { state: "ok" }])).toBe(
    "unknown",
  );
  expect(resourceState([{ state: "critical" }, { state: "unknown" }])).toBe(
    "critical",
  );
});
test("CPU needs sustained high load and two recovery samples", () => {
  const read = createCpuPressure();
  expect(read(null).state).toBe("unknown");
  expect(read(99).state).toBe("ok");
  expect(read(99).state).toBe("ok");
  expect(read(99).state).toBe("warning");
  expect(read(50).state).toBe("warning");
  expect(read(50).state).toBe("ok");
});
test("Linux available memory and macOS pressure avoid treating caches as shortages", () => {
  expect(
    linuxAvailableMemory(
      "MemTotal: 100 kB\nMemFree: 1 kB\nMemAvailable: 60 kB\n",
    ),
  ).toEqual({ total: 102400, available: 61440 });
  expect(linuxAvailableMemory("MemFree: 100 kB")).toBeNull();
  expect(macMemoryPressure("1\n").state).toBe("ok");
  expect(macMemoryPressure("2").state).toBe("warning");
  expect(macMemoryPressure("4").state).toBe("critical");
  expect(macMemoryPressure("permission denied").state).toBe("unknown");
});
test("resource tool is read-only, per Bot, JSON-schema compatible and reports supervisor failure as unknown", async () => {
  let url = "";
  const service = createResourceService({
    monitor: { snapshot: async () => scope() },
    supervisor: { baseUrl: "http://supervisor", token: "secret" },
    fetchImpl: (async (input, init) => {
      url = String(input);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer secret",
      );
      return new Response("offline", { status: 503 });
    }) as typeof fetch,
  });
  const tool = resourceTools(service, "bot-a")[0]!;
  expect(() => z.toJSONSchema(tool.parameters)).not.toThrow();
  const result = JSON.parse(await tool.execute({}));
  expect(url).toBe("http://supervisor/resources/bot-a");
  expect(result.state).toBe("unknown");
  expect(JSON.stringify(result)).not.toContain("secret");
});
test("concurrent status requests coalesce and stale remote telemetry fails closed", async () => {
  let calls = 0;
  const service = createResourceService({
    monitor: { snapshot: async () => scope("warning") },
    supervisor: { baseUrl: "http://supervisor" },
    fetchImpl: (async () => {
      calls++;
      return Response.json({
        scopes: [
          {
            ...scope(),
            scope: "docker_runtime",
            checkedAt: "2000-01-01T00:00:00.000Z",
          },
        ],
      });
    }) as typeof fetch,
  });
  const results = await Promise.all([service.snapshot(), service.snapshot()]);
  expect(calls).toBe(1);
  expect(results[0]?.scopes[1]?.state).toBe("unknown");
  expect(resourceGuidance(results[0]!)).toContain("Do not kill processes");
});
test("resource endpoint requires sign-in and Bot access, and disables response caching", async () => {
  let reads = 0;
  const service = {
    snapshot: async () => {
      reads++;
      return {
        checkedAt: new Date().toISOString(),
        state: "ok" as const,
        scopes: [scope()],
      };
    },
  };
  const routes = createResourceRoutes(
    service,
    async (context, next) => {
      if (!context.req.header("x-test-user"))
        return context.json({ error: "Unauthorized" }, 401);
      context.set("actor", {
        id: "owner",
        email: "owner@example.test",
        role: "user",
      });
      await next();
    },
    async (_actor, botId) => botId === "mine",
  );
  expect((await routes.request("/")).status).toBe(401);
  expect(
    (await routes.request("/other", { headers: { "x-test-user": "owner" } }))
      .status,
  ).toBe(404);
  expect(reads).toBe(0);
  const response = await routes.request("/mine", {
    headers: { "x-test-user": "owner" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(reads).toBe(1);
});

test("process memory caps are checked independently from OS memory", () => {
  expect(cgroupMemory("96", "100", "inactive_file 0")).toMatchObject({
    state: "critical",
    percent: 96,
  });
  expect(cgroupMemory("96", "100", "inactive_file 30")).toMatchObject({
    state: "ok",
    percent: 66,
  });
  expect(cgroupMemory("96", "max", "")).toBeNull();
  expect(cgroupMemory("bad", "100", "")?.state).toBe("unknown");
});
