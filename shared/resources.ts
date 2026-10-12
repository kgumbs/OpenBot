export type ResourceState = "ok" | "warning" | "critical" | "unknown";
export type ResourceCheck = {
  id: string;
  state: ResourceState;
  message: string;
  percent?: number;
  availableBytes?: number;
  totalBytes?: number;
};
export type ResourceScope = {
  scope: "host" | "api_runtime" | "docker_runtime" | "bot_container";
  label: string;
  checkedAt: string;
  state: ResourceState;
  checks: ResourceCheck[];
};
export type ResourceReport = {
  checkedAt: string;
  state: ResourceState;
  scopes: ResourceScope[];
};
export function resourceState(
  checks: { state: ResourceState }[],
): ResourceState {
  if (checks.some((check) => check.state === "critical")) return "critical";
  if (checks.some((check) => check.state === "warning")) return "warning";
  if (!checks.length || checks.some((check) => check.state === "unknown"))
    return "unknown";
  return "ok";
}
export function capacityCheck(
  id: string,
  label: string,
  used: number,
  total: number,
): ResourceCheck {
  if (
    !Number.isFinite(used) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    used < 0 ||
    used > total
  )
    return { id, state: "unknown", message: `${label}: reading unavailable.` };
  const percent = Math.round((1000 * used) / total) / 10;
  return {
    id,
    state: percent >= 95 ? "critical" : percent >= 90 ? "warning" : "ok",
    message: `${label}: ${percent}% used.`,
    percent,
    availableBytes: total - used,
    totalBytes: total,
  };
}
/** A CPU spike is normal. Warn after three high samples; clear after two lower samples. */
export function createCpuPressure() {
  let high = 0;
  let low = 0;
  let warning = false;
  return (percent: number | null): ResourceCheck => {
    if (percent === null || !Number.isFinite(percent))
      return {
        id: "cpu",
        state: "unknown",
        message: "CPU: waiting for a second sample.",
      };
    high = percent >= 90 ? high + 1 : 0;
    low = percent < 80 ? low + 1 : 0;
    if (high >= 3) warning = true;
    if (low >= 2) warning = false;
    return {
      id: "cpu",
      state: warning ? "warning" : "ok",
      percent: Math.round(percent * 10) / 10,
      message: `CPU: ${Math.round(percent)}% busy${warning ? "; sustained high load. Reduce concurrent work." : "."}`,
    };
  };
}
export function resourceGuidance(report: ResourceReport) {
  const issues = report.scopes.flatMap((scope) =>
    scope.checks
      .filter(
        (check) => check.state === "warning" || check.state === "critical",
      )
      .map((check) => `${scope.label}: ${check.message}`),
  );
  return issues.length
    ? `System resource warning (checked ${report.checkedAt}): ${issues.join(" ")} Tell the person if this affects work. Prefer fewer concurrent operations. Do not kill processes, delete files or replay failed actions automatically. Use system_resource_status for a fresh report; missing readings do not establish that resources are healthy.`
    : "";
}
