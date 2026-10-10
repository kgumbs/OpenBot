import { expect, test } from "bun:test";
import {
  runPhase,
  runFailureMessage,
} from "../src/components/channels/run-progress";
import type { Message } from "@ag-ui/core";
const user: Message = { id: "u", role: "user", content: "hello" };
test("progress excludes tools from previous turns", () =>
  expect(
    runPhase([
      {
        id: "old",
        role: "assistant",
        toolCalls: [
          {
            id: "t",
            type: "function",
            function: { name: "read", arguments: "{}" },
          },
        ],
      },
      user,
    ]),
  ).toBe("Waiting for model"));
test("pending tool is shown until its matching result arrives", () => {
  const messages: Message[] = [
    user,
    {
      id: "a",
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "t",
          type: "function",
          function: { name: "read_file", arguments: "{}" },
        },
      ],
    },
  ];
  expect(runPhase(messages)).toBe("Waiting for tool: read_file");
  expect(
    runPhase([
      ...messages,
      { id: "r", role: "tool", toolCallId: "t", content: "done" },
    ]),
  ).toBe("Waiting for model");
});
test("connecting and streaming are distinct", () => {
  expect(runPhase([user], true)).toBe("Connecting");
  expect(
    runPhase([user, { id: "a", role: "assistant", content: "answer" }]),
  ).toBe("Generating");
});
test("timeouts explain health and recovery without changing ordinary errors", () => {
  expect(runFailureMessage("Run timed out")).toContain("System health");
  expect(runFailureMessage("No permission")).toBe("No permission");
});
