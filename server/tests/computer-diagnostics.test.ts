import { expect, test } from "bun:test";
import { checkComputerTools } from "../src/computer/diagnostics";
import type { ComputerGateway } from "../src/computer/gateway";

function fixture(fail?: string) {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const gateway = {
    async runCommand(
      _bot: string,
      _actor: unknown,
      input: { command: string },
    ) {
      calls.push(input.command.startsWith("rm") ? "cleanup" : "shell");
      if (fail === "shell" && !input.command.startsWith("rm"))
        throw new Error("secret-token");
      return {
        exitCode: 0,
        stdout: input.command.startsWith("printf") ? "OpenBot tool check" : "",
        timedOut: false,
      };
    },
    async writeFile(
      _bot: string,
      _actor: unknown,
      input: { path: string; contents: string },
    ) {
      calls.push("write");
      files.set(input.path, input.contents);
    },
    async readFile(_bot: string, _actor: unknown, input: { path: string }) {
      calls.push("read");
      return {
        text: fail === "read" ? "wrong content" : files.get(input.path),
        truncated: false,
      };
    },
    async navigate() {
      calls.push("navigate");
      return {
        title: fail === "browser" ? "Just a moment..." : "Example Domain",
        text: "This domain is for use in documentation examples.",
      };
    },
  } as unknown as Parameters<typeof checkComputerTools>[0];
  return { gateway, calls };
}
test("tool checks exercise gateway operations, verify content, and clean up", async () => {
  const { gateway, calls } = fixture();
  const result = await checkComputerTools(gateway, "bot", { id: "person" });
  expect(result.state).toBe("verified");
  expect(calls).toEqual(["shell", "write", "read", "cleanup", "navigate"]);
});
test("mismatched read-back fails and cleanup still runs", async () => {
  const { gateway, calls } = fixture("read");
  const result = await checkComputerTools(gateway, "bot", { id: "person" });
  expect(result.checks.find((check) => check.id === "workspace")?.status).toBe(
    "fail",
  );
  expect(calls).toContain("cleanup");
});
test("tool failures are sanitized and do not hide remaining checks", async () => {
  const { gateway } = fixture("shell");
  const result = await checkComputerTools(gateway, "bot", { id: "person" });
  expect(result.state).toBe("needs_attention");
  expect(JSON.stringify(result)).not.toContain("secret-token");
  expect(result.checks.find((check) => check.id === "browser")?.status).toBe(
    "pass",
  );
});
test("a browser challenge cannot pass as readable browsing", async () => {
  const { gateway } = fixture("browser");
  expect(
    (await checkComputerTools(gateway, "bot", { id: "person" })).state,
  ).toBe("needs_attention");
});
