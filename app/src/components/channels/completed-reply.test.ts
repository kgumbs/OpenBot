import { expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { reconcileCompletedReply } from "./completed-reply";

test("restores a completed partial answer while preserving live tool metadata", () => {
  const tools = [
    {
      id: "call",
      type: "function" as const,
      function: { name: "computer_navigate", arguments: "{}" },
    },
  ];
  const local: Message[] = [
    { id: "reply", role: "assistant", content: "is", toolCalls: tools },
  ];
  const result = reconcileCompletedReply(
    local,
    [
      {
        id: "reply",
        role: "assistant",
        content: 'The page title is "Example Domain".',
      },
    ],
    new Set(),
  );
  expect(result[0]?.content).toBe('The page title is "Example Domain".');
  expect(local[0]?.content).toBe("is");
  expect(result[0]?.role === "assistant" && result[0].toolCalls).toBe(tools);
});

test("does not change older turns, user text, or shorten a current reply from a lagging store", () => {
  const local: Message[] = [
    { id: "old", role: "assistant", content: "old" },
    { id: "user", role: "user", content: "hi" },
    { id: "reply", role: "assistant", content: "Complete answer" },
  ];
  const stored: Message[] = [
    { id: "old", role: "assistant", content: "different older answer" },
    { id: "user", role: "user", content: "different user text" },
    { id: "reply", role: "assistant", content: "Complete" },
  ];
  expect(reconcileCompletedReply(local, stored, new Set(["old"]))).toBe(local);
  expect(reconcileCompletedReply(local, [], new Set())).toBe(local);
});
