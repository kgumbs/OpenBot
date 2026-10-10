import { expect, test } from "bun:test";
import { dependencies } from "./doctor";
import { repair } from "./repair-browser-storage";

const image = process.env.OPENBOT_STORAGE_REPAIR_TEST_IMAGE;
test.skipIf(!image)("repairs disposable root-owned volumes without following a symlink", async () => {
  if (!/^sha256:[a-f0-9]{64}$/.test(image!)) throw new Error("Provide a local image digest.");
  const prefix = `openbot-repair-test-${crypto.randomUUID()}`;
  const volumes = [`${prefix}-profiles`, `${prefix}-workspace`];
  let container = "";
  async function docker(args: string[]) {
    const result = await dependencies.command(["docker", ...args], 30000);
    if (result.code !== 0) throw new Error("Disposable Docker fixture operation failed.");
    return result.out.trim();
  }
  try {
    for (const name of volumes) await docker(["volume", "create", name]);
    const mounts = volumes.flatMap((name, i) => ["--mount", `type=volume,src=${name},dst=${i === 0 ? "/profiles" : "/workspace"},volume-nocopy`]);
    await docker(["run", "--rm", "--pull=never", "--network=none", "--read-only", "--user=0:0", "--cap-drop=ALL", "--cap-add=CHOWN", "--cap-add=DAC_OVERRIDE", ...mounts, "--entrypoint=/bin/sh", image!, "-c", 'printf preserved > /profiles/sentinel; chmod 600 /profiles/sentinel; ln -s /etc/passwd /workspace/outside']);
    container = await docker(["create", "--pull=never", "--user=1000:1000", "--label=openbot.supervisor=true", "--label=openbot.namespace=openbot", ...mounts, "--entrypoint=/bin/true", image!]);
    // Use the real Docker operations with an isolated configuration, not the live .env.
    await repair(`${import.meta.dir}/..`, container, true, { ...dependencies, read: async () => "" });
    const content = await docker(["run", "--rm", "--pull=never", "--network=none", "--read-only", "--user=1000:1000", "--cap-drop=ALL", ...mounts, "--entrypoint=/bin/sh", image!, "-c", 'test -w /profiles && test -w /workspace && test -L /workspace/outside && cat /profiles/sentinel']);
    expect(content).toBe("preserved");
  } finally {
    if (container) await docker(["rm", "-f", container]);
    for (const name of volumes) await docker(["volume", "rm", name]);
  }
}, 120000);
