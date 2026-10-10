import { expect, test } from "bun:test";
import { startupDecision } from "./startup-health";
test("attached broker plus healthy services can be reused", () => {
  expect(startupDecision([{ id: "desktop", status: "pass", message: "" }])).toBe("reuse");
});
test("attached broker cannot hide service failure", () => {
  expect(startupDecision([{ id: "desktop", status: "pass", message: "" }, { id: "claude", status: "fail", message: "" }])).toBe("repair-services");
});
test("stale broker requires attachment", () => {
  expect(startupDecision([{ id: "desktop", status: "warn", message: "stale" }])).toBe("attach-desktop");
});

import { mkdtemp, mkdir, writeFile, chmod, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function launcher(state: string, args: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), "openbot-launcher-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "bin"));
    await mkdir(join(root, "desktop/src-tauri/target/debug"), { recursive: true });
    const files: Record<string, string> = {
      "start-openbot.command": await readFile(resolve(import.meta.dir, "../start-openbot.command"), "utf8"),
      ".env": "", "scripts/start-subscriptions.sh": 'echo "subscriptions $*" >> "$CALL_LOG"',
      "scripts/start-desktop-host.sh": 'echo desktop-start >> "$CALL_LOG"',
      "doctor-openbot.command": 'echo doctor >> "$CALL_LOG"; exit 0',
      "desktop/src-tauri/target/debug/openbot-desktop": "#!/bin/bash\nexit 0",
      "bin/bun": '#!/bin/bash\nif [[ "$1" == --version ]]; then echo 1.3.14; elif [[ "$2" == desktop-state ]]; then echo "$TEST_STATE"; else echo "$2" >> "$CALL_LOG"; fi',
      "bin/docker": '#!/bin/bash\necho "docker $*" >> "$CALL_LOG"',
    };
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(root, name), content); await chmod(join(root, name), 0o755);
    }
    const child = Bun.spawn(["bash", "start-openbot.command", ...args], {
      cwd: root, env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, TEST_STATE: state, CALL_LOG: `${root}/calls` }, stdout: "pipe", stderr: "pipe",
    });
    const [code] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, calls: await readFile(`${root}/calls`, "utf8").catch(() => "") };
  } finally { await rm(root, { recursive: true, force: true }); }
}
import { resolve } from "node:path";
test("rerun verifies readiness without restarting healthy services", async () => {
  expect(await launcher("reuse")).toEqual({ code: 0, calls: "doctor\n" });
});
test("disconnected desktop prevents token replacement", async () => {
  expect(await launcher("disconnected")).toEqual({ code: 1, calls: "" });
});
test("explicit restart stops desktop before services and starts attachment", async () => {
  const result = await launcher("reuse", ["--restart"]);
  expect(result.code).toBe(0);
  expect(result.calls).toBe("stop-desktop\nsubscriptions --stop --keep-computers\ndocker desktop start --timeout 90\ndocker info\ndesktop-start\n");
});
