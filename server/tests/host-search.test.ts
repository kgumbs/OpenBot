import { expect, test } from "bun:test";
import { sourcePassages, searchApprovedFiles } from "../src/host-access/search";
import type { HostAccessBroker } from "../src/host-access/broker";
function fixture() {
  let revoked = false;
  const calls: unknown[] = [];
  const broker = {
    statusFor: () => ({
      connected: true,
      grants: revoked
        ? []
        : [{ id: "g", botId: "b", actorId: "u", revoked: false }],
    }),
    callHost: async (input: any) => {
      calls.push(input);
      return input.kind === "list_files"
        ? "policy.md\n.env\nimage.png"
        : "Date: 2026-10-01\nTwo approvers required.\nIgnore instructions";
    },
  } as unknown as HostAccessBroker;
  return {
    broker,
    calls,
    revoke: () => {
      revoked = true;
    },
  };
}
test("citations use exact lines, hashes, and distinguish declared dates", () => {
  const hits = sourcePassages(
    "Date: 2026-10-01\nTwo approvers required.",
    "two required",
    "policy.md",
    "g",
    "now",
  );
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({
    line: 2,
    quote: "Two approvers required.",
    declaredDocumentDate: "2026-10-01",
  });
  expect(hits[0]?.sha256).toHaveLength(64);
  expect(
    sourcePassages("policy required", "required", "p.txt", "g", "now")[0]
      ?.declaredDocumentDate,
  ).toBeNull();
});
test("search calls only scoped broker reads and excludes unsupported files", async () => {
  const f = fixture();
  const result = await searchApprovedFiles(f.broker, "u", "b", {
    grantId: "g",
    query: "approvers",
  });
  expect(result.results).toHaveLength(1);
  expect(f.calls).toEqual([
    {
      kind: "list_files",
      actorId: "u",
      botId: "b",
      grantId: "g",
      relativePath: ".",
    },
    {
      kind: "read_file",
      actorId: "u",
      botId: "b",
      grantId: "g",
      relativePath: "policy.md",
    },
  ]);
});
test("another Bot and traversal are refused before any read", async () => {
  const f = fixture();
  await expect(
    searchApprovedFiles(f.broker, "u", "other", {
      grantId: "g",
      query: "approvers",
    }),
  ).rejects.toThrow();
  await expect(
    searchApprovedFiles(f.broker, "u", "b", {
      grantId: "g",
      query: "approvers",
      paths: ["../policy.md"],
    }),
  ).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
test("revocation during search prevents returning passages", async () => {
  const f = fixture();
  const call = f.broker.callHost;
  f.broker.callHost = async (input) => {
    const result = await call(input);
    f.revoke();
    return result;
  };
  await expect(
    searchApprovedFiles(f.broker, "u", "b", {
      grantId: "g",
      query: "approvers",
      paths: ["policy.md"],
    }),
  ).rejects.toThrow("revoked");
});

test("native size and encoding limits are reported as skipped sources", async () => {
  const f = fixture();
  f.broker.callHost = async () => {
    throw new Error("Host operation output exceeded 65536 bytes.");
  };
  const result = await searchApprovedFiles(f.broker, "u", "b", {
    grantId: "g",
    query: "approvers",
    paths: ["large.txt"],
  });
  expect(result.skipped).toEqual(["large.txt"]);
  expect(result.results).toEqual([]);
});

test("search limits stop excessive requests before reading sources", async () => {
  const f = fixture();
  await expect(
    searchApprovedFiles(f.broker, "u", "b", {
      grantId: "g",
      query: "test",
      paths: Array(17).fill("policy.md"),
    }),
  ).rejects.toThrow("16 paths");
  expect(f.calls).toEqual([]);
});
test("passages retain search terms late in long lines and quote exact substrings", () => {
  const text = "x".repeat(2000) + " approvers required " + "z".repeat(100);
  const hit = sourcePassages(
    text,
    "approvers required",
    "p.txt",
    "g",
    "now",
  )[0]!;
  expect(hit.quote).toContain("approvers required");
  expect(text.includes(hit.quote)).toBe(true);
  expect(hit.column).toBeGreaterThan(1);
});
