import { expect, test } from "bun:test";
import { helperArgs, repair, validateTarget } from "./repair-browser-storage";
import type { Dependencies } from "./doctor";
const id = "a".repeat(64);
function info() { return { Id: id, Image: `sha256:${"b".repeat(64)}`, Config: { User: "1000:1000", Labels: { "openbot.supervisor": "true", "openbot.namespace": "openbot" } }, State: { Running: false }, Mounts: ["/profiles", "/workspace"].map((Destination, i) => ({ Destination, Name: `test-volume-${i}`, Type: "volume", RW: true })) }; }
function fixture(running = false, consumers = "") {
  const calls: string[][] = [];
  const deps: Dependencies = { bunVersion: "1.3.14", which: () => true, executable: async () => true, read: async () => "", http: async () => ({ status: 0 }), command: async args => {
    calls.push(args);
    let out = "";
    if (args[1] === "inspect") { const value = info(); value.State.Running = running; out = JSON.stringify([value]); }
    if (args[1] === "volume") out = JSON.stringify([{ Name: args[3], Driver: "local", Options: null }]);
    if (args[1] === "ps") out = consumers;
    return { code: 0, out };
  } };
  return { deps, calls };
}
test("preview never runs repair or stops containers", async () => {
  const f = fixture(true); expect((await repair("/clone", id, false, f.deps)).running).toBe(true);
  expect(f.calls.some(a => a[1] === "run" || a[1] === "stop")).toBe(false);
});
test("apply refuses running browser", async () => {
  const f = fixture(true); await expect(repair("/clone", id, true, f.deps)).rejects.toThrow("Stop the browser");
  expect(f.calls.some(a => a[1] === "run")).toBe(false);
});
test("apply refuses any active consumer", async () => {
  const f = fixture(false, "other-container"); await expect(repair("/clone", id, true, f.deps)).rejects.toThrow("running container");
  expect(f.calls.some(a => a[1] === "run")).toBe(false);
});
test("apply uses isolated helper against exactly two volumes", async () => {
  const f = fixture(); await repair("/clone", id, true, f.deps);
  const args = f.calls.find(a => a[1] === "run")!;
  expect(args).toContain("--network=none"); expect(args).toContain("--pull=never"); expect(args).toContain("--read-only");
  expect(args).toContain("-hRP"); expect(args.filter(a => a === "--mount")).toHaveLength(2);
  expect(args.some(a => a.includes("docker.sock"))).toBe(false);
});
test("unrelated namespace and root image are rejected", () => {
  expect(() => validateTarget(info(), "other", [])).toThrow("belong");
  const value = info(); value.Config.User = "root";
  expect(() => validateTarget(value, "openbot", [])).toThrow("non-root");
});
test("bind mounts and duplicate volumes are rejected", () => {
  const value = info(); value.Mounts[0]!.Type = "bind";
  expect(() => validateTarget(value, "openbot", [])).toThrow("bind mounts");
  const duplicate = info(); duplicate.Mounts[1]!.Name = duplicate.Mounts[0]!.Name;
  expect(() => validateTarget(duplicate, "openbot", [])).toThrow("separate volumes");
});
test("volume driver options cannot redirect repair to host storage", async () => {
  const f = fixture(); const original = f.deps.command;
  f.deps.command = async (args, timeout) => args[1] === "volume" ? { code: 0, out: JSON.stringify([{ Name: args[3], Driver: "local", Options: { type: "none", device: "/host" } }]) } : original(args, timeout);
  await expect(repair("/clone", id, true, f.deps)).rejects.toThrow("driver options");
});
test("helper failure cleans up only the helper with its generated name", async () => {
  const f = fixture(); const original = f.deps.command;
  f.deps.command = async (args, timeout) => {
    if (args[1] === "run") { f.calls.push(args); return { code: -1, out: "", timedOut: true }; }
    return original(args, timeout);
  };
  await expect(repair("/clone", id, true, f.deps)).rejects.toThrow("timed out");
  const run = f.calls.find(a => a[1] === "run")!;
  const name = run[run.indexOf("--name") + 1]!;
  expect(name).toStartWith("openbot-volume-repair-");
  expect(f.calls.at(-1)).toEqual(["docker", "rm", "--force", name]);
});
