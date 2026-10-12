import { execFile } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus, platform, totalmem } from "node:os";
import { promisify } from "node:util";
import {
  capacityCheck,
  createCpuPressure,
  resourceState,
  type ResourceCheck,
  type ResourceScope,
} from "./resources";
const exec = promisify(execFile);
export function linuxAvailableMemory(
  text: string,
): { available: number; total: number } | null {
  const value = (name: string) =>
    Number(text.match(new RegExp(`^${name}:\\s+(\\d+) kB`, "m"))?.[1]) * 1024;
  const total = value("MemTotal");
  const available = value("MemAvailable");
  return Number.isFinite(total) && Number.isFinite(available)
    ? { total, available }
    : null;
}
export function macMemoryPressure(raw: string): ResourceCheck {
  const level = raw.trim();
  return {
    id: "memory",
    state:
      level === "1"
        ? "ok"
        : level === "2"
          ? "warning"
          : level === "4"
            ? "critical"
            : "unknown",
    message: `Memory pressure: ${level === "1" ? "normal" : level === "2" ? "warning" : level === "4" ? "critical" : "reading unavailable"}.`,
  };
}
export function cgroupMemory(
  current: string,
  maximum: string,
  stats: string,
): ResourceCheck | null {
  if (maximum.trim() === "max") return null;
  const used = Number(current.trim());
  const total = Number(maximum.trim());
  const cache = Number(stats.match(/^inactive_file\s+(\d+)/m)?.[1] ?? 0);
  if (!current.trim() || !maximum.trim())
    return {
      id: "runtime_memory",
      state: "unknown",
      message: "Process cgroup memory: reading unavailable.",
    };
  return capacityCheck(
    "runtime_memory",
    "Process cgroup memory cap",
    Math.max(0, used - cache),
    total,
  );
}
function cpuTimes() {
  return cpus().reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 },
  );
}
/** Read-only, bounded sampling. Never interprets macOS cached RAM as a shortage. */
export function createResourceMonitor(scope?: ResourceScope["scope"]) {
  const kind =
    scope ??
    (existsSync("/.dockerenv") || existsSync("/run/.containerenv")
      ? "api_runtime"
      : "host");
  const label =
    kind === "host"
      ? "Host"
      : kind === "docker_runtime"
        ? "Docker runtime / VM"
        : "API runtime (host pressure may be unavailable)";
  const cpuPressure = createCpuPressure();
  let previous = cpuTimes();
  let sampled = false;
  let current: ResourceScope | undefined;
  let inFlight: Promise<ResourceScope> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  async function sample(): Promise<ResourceScope> {
    const times = cpuTimes();
    const elapsed = times.total - previous.total;
    const cpu = cpuPressure(
      sampled && elapsed > 0
        ? Math.max(
            0,
            Math.min(100, (1 - (times.idle - previous.idle) / elapsed) * 100),
          )
        : null,
    );
    previous = times;
    sampled = true;
    const checks: ResourceCheck[] = [cpu];
    try {
      if (platform() === "darwin") {
        const { stdout } = await exec(
          "/usr/sbin/sysctl",
          ["-n", "kern.memorystatus_vm_pressure_level"],
          { timeout: 1500, maxBuffer: 1024 },
        );
        checks.push({ ...macMemoryPressure(stdout), totalBytes: totalmem() });
      } else if (platform() === "linux") {
        const memory = linuxAvailableMemory(
          await readFile("/proc/meminfo", "utf8"),
        );
        checks.push(
          memory
            ? capacityCheck(
                "memory",
                "Available-memory pressure",
                memory.total - memory.available,
                memory.total,
              )
            : {
                id: "memory",
                state: "unknown",
                message: "Memory: reading unavailable.",
              },
        );
      } else
        checks.push({
          id: "memory",
          state: "unknown",
          message: "Memory pressure is unavailable on this platform.",
        });
    } catch {
      checks.push({
        id: "memory",
        state: "unknown",
        message: "Memory pressure: reading unavailable.",
      });
    }
    if (platform() === "linux") {
      try {
        const [usage, limit, stats] = await Promise.all([
          readFile("/sys/fs/cgroup/memory.current", "utf8"),
          readFile("/sys/fs/cgroup/memory.max", "utf8"),
          readFile("/sys/fs/cgroup/memory.stat", "utf8"),
        ]);
        const cap = cgroupMemory(usage, limit, stats);
        if (cap) checks.push(cap);
      } catch {
        if (kind === "api_runtime")
          checks.push({
            id: "runtime_memory",
            state: "unknown",
            message:
              "Process cgroup memory cap unavailable (requires cgroup v2).",
          });
      }
    }
    try {
      const disk = await statfs(process.cwd());
      const check = capacityCheck(
        "disk",
        "Runtime filesystem",
        (disk.blocks - disk.bavail) * disk.bsize,
        disk.blocks * disk.bsize,
      );
      if (
        check.availableBytes !== undefined &&
        check.availableBytes < 1_073_741_824
      ) {
        check.state = "critical";
        check.message += " Less than 1 GiB available.";
      }
      checks.push(check);
    } catch {
      checks.push({
        id: "disk",
        state: "unknown",
        message: "Runtime filesystem: reading unavailable.",
      });
    }
    current = {
      scope: kind,
      label,
      checkedAt: new Date().toISOString(),
      state: resourceState(checks),
      checks,
    };
    return current;
  }
  function refresh() {
    inFlight ??= sample().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }
  return {
    async snapshot() {
      if (!timer) {
        timer = setInterval(() => {
          void refresh();
        }, 15_000);
        timer.unref();
      }
      return current && Date.now() - Date.parse(current.checkedAt) < 20_000
        ? current
        : refresh();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
