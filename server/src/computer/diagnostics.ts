import type { ActionActor, ComputerGateway } from "./gateway";

export type ToolCheck = {
  id: string;
  status: "pass" | "fail";
  message: string;
};

/** Explicit, policy-governed smoke test. Never run from a passive health GET. */
export async function checkComputerTools(
  gateway: Pick<
    ComputerGateway,
    "runCommand" | "writeFile" | "readFile" | "navigate"
  >,
  botId: string,
  actor: ActionActor,
) {
  const checks: ToolCheck[] = [];
  const path = `.openbot-health-${crypto.randomUUID()}.txt`;
  const marker = "OpenBot tool check";
  const check = async (id: string, work: () => Promise<void>) => {
    try {
      await work();
      checks.push({
        id,
        status: "pass",
        message: "Verified through the Bot tool gateway.",
      });
    } catch {
      // Raw errors can include private page text, paths, or credentials.
      checks.push({
        id,
        status: "fail",
        message:
          "Could not verify this tool. Check policy, approvals, and computer connectivity; do not automatically repeat the task.",
      });
    }
  };
  await check("shell", async () => {
    const result = await gateway.runCommand(botId, actor, {
      command: "printf 'OpenBot tool check'",
      timeoutMs: 5000,
    });
    if (result.exitCode !== 0 || result.stdout !== marker || result.timedOut)
      throw new Error("shell");
  });
  try {
    await check("workspace", async () => {
      await gateway.writeFile(botId, actor, { path, contents: marker });
      const result = await gateway.readFile(botId, actor, { path });
      if (result.truncated || result.text !== marker)
        throw new Error("workspace");
    });
  } finally {
    await check("cleanup", async () => {
      const result = await gateway.runCommand(botId, actor, {
        command: `rm -f -- '${path}'`,
        timeoutMs: 5000,
      });
      if (result.exitCode !== 0 || result.timedOut) throw new Error("cleanup");
    });
  }
  await check("browser", async () => {
    const result = await gateway.navigate(botId, actor, "https://example.com");
    if (
      !result.title?.includes("Example Domain") ||
      !result.text?.trim()
    )
      throw new Error("browser");
  });
  return {
    state: checks.every((check) => check.status === "pass")
      ? "verified"
      : "needs_attention",
    checkedAt: new Date().toISOString(),
    checks,
  };
}
