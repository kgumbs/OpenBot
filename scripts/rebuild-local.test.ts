import { expect, test } from "bun:test";
import { buildPlan, rustEnvironment } from "./rebuild-local";
test("computer builds base before sandbox, then supervisor", () => {
  const plan = buildPlan("/moved/clone", "computer");
  expect(plan.map(s => s.name)).toEqual(["Base computer image", "Non-root sandbox computer image", "Supervisor image"]);
  expect(plan.every(s => s.cwd === "/moved/clone")).toBe(true);
});
test("Bots explicitly build both providers without starting them", () => {
  const args = buildPlan("/clone", "bots")[0]!.args;
  expect(args).toContain("agent-claude-sdk"); expect(args).toContain("agent-chatgpt"); expect(args).toContain("chatgpt");
  expect(args).not.toContain("up");
});
test("desktop builds frontend and native binary through Tauri", () => {
  const step = buildPlan("/moved/clone", "desktop")[0]!;
  expect(step.cwd).toBe("/moved/clone/desktop");
  expect(step.args).toEqual(["bun", "run", "tauri", "build", "--debug", "--no-bundle", "--", "--locked"]);
});
test("all plan never restarts, removes volumes, or grants folders", () => {
  const args = buildPlan("/clone", "all").flatMap(s => s.args);
  for (const mutation of ["up", "down", "restart", "rm", "chown"]) expect(args).not.toContain(mutation);
});
test("persistent Rust environment follows a moved clone", () => {
  const env = rustEnvironment("/moved/clone", { PATH: "/usr/bin", HOME: "/home/owner" });
  expect(env.CARGO_HOME).toBe("/moved/clone/.env.tools/rust/cargo");
  expect(env.RUSTUP_HOME).toBe("/moved/clone/.env.tools/rust/rustup");
  expect(env.HOME).toBe("/home/owner");
});

import { mkdtemp, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("failed base image build stops before sandbox and supervisor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "openbot-rebuild-test-"));
  try {
    const executable = join(dir, "docker");
    await writeFile(executable, '#!/bin/bash\nprintf "%s\\n" "$*" >> "$BUILD_LOG"\nexit 7\n'); await chmod(executable, 0o755);
    const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "rebuild-local.ts"), "computer", "--apply"], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, BUILD_LOG: join(dir, "calls") }, stdout: "pipe", stderr: "pipe" });
    const [code] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code).toBe(7);
    const calls = await readFile(join(dir, "calls"), "utf8");
    expect(calls).toContain("agent-computer/Dockerfile");
    expect(calls).not.toContain("Dockerfile.sandbox"); expect(calls).not.toContain("supervisor");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
