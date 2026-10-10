import { expect, test } from "bun:test";
import { hostConfig } from "../src/docker";
import { environmentFor } from "../src/environment";
import { namesFor } from "../src/names";

test("sandboxed computers keep privilege restrictions and use a default-deny seccomp policy", () => {
  const parsed = namesFor("sandbox-check");
  if (!parsed.ok) throw new Error(parsed.reason);
  const config = hostConfig(parsed.names, {
    image: "computer:sandbox", environment: [], chromiumSandbox: true,
  });
  expect(config.CapDrop).toEqual(["ALL"]);
  expect(config.SecurityOpt).toContain("no-new-privileges:true");
  const policy = JSON.parse(config.SecurityOpt.find((s) => s.startsWith("seccomp="))!.slice(8));
  expect(policy.defaultAction).toBe("SCMP_ACT_ERRNO");
  const namespaceRule = policy.syscalls.find((s: { names: string[] }) =>
    ["clone", "unshare", "setns", "chroot"].every((name) => s.names.includes(name)));
  expect(namespaceRule.action).toBe("SCMP_ACT_ALLOW");
  expect(environmentFor("sandbox-check", { COMPUTER_SANDBOX: "on" }))
    .toContain("COMPUTER_SANDBOX=on");
});

test("ordinary deployments retain Docker's default policy", () => {
  const parsed = namesFor("sandbox-check");
  if (!parsed.ok) throw new Error(parsed.reason);
  expect(hostConfig(parsed.names, { image: "computer", environment: [] }).SecurityOpt)
    .toEqual(["no-new-privileges:true"]);
});
