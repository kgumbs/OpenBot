import { expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { taskEvidence } from "../src/components/channels/task-evidence";
const user: Message = { id: "u", role: "user", content: "save" };
function call(id: string, name: string, args: object): Message {
  return {
    id,
    role: "assistant",
    toolCalls: [
      {
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}
function result(id: string, value: unknown): Message {
  return {
    id: `result-${id}`,
    role: "tool",
    toolCallId: id,
    content: JSON.stringify(value),
  };
}
const write = call("w", "computer_write_file", {
  path: "a.md",
  contents: "expected",
});
test("a write acknowledgment alone does not verify a deliverable", () => {
  expect(
    taskEvidence([user, write, result("w", { bytes: 8 })])?.unverifiedFiles,
  ).toBe(1);
});
test("read-back must match content and must not be truncated", () => {
  const read = call("r", "computer_read_file", { path: "a.md" });
  const prefix = [user, write, result("w", { bytes: 8 }), read];
  expect(
    taskEvidence([...prefix, result("r", { text: "wrong", truncated: false })])
      ?.unverifiedFiles,
  ).toBe(1);
  expect(
    taskEvidence([
      ...prefix,
      result("r", { text: "expected", truncated: true }),
    ])?.unverifiedFiles,
  ).toBe(1);
  expect(
    taskEvidence([
      ...prefix,
      result("r", { text: "expected", truncated: false }),
    ])?.unverifiedFiles,
  ).toBe(0);
});
test("a later overwrite invalidates earlier verification", () => {
  expect(
    taskEvidence([
      user,
      write,
      result("w", {}),
      call("r", "computer_read_file", { path: "a.md" }),
      result("r", { text: "expected", truncated: false }),
      call("w2", "computer_write_file", { path: "a.md", contents: "new" }),
      result("w2", {}),
    ])?.unverifiedFiles,
  ).toBe(1);
});
test("failures and unfinished tool calls are visible, scoped to latest user request", () => {
  const messages = [
    user,
    call("f", "computer_navigate", {}),
    result("f", { error: "HTTP 404" }),
    call("p", "computer_run_command", {}),
  ];
  expect(taskEvidence(messages)).toMatchObject({
    failures: ["computer_navigate"],
    pending: 1,
  });
  expect(
    taskEvidence([...messages, { id: "u2", role: "user", content: "hello" }]),
  ).toMatchObject({ failures: [], pending: 0, results: 0 });
});
