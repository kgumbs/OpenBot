import { expect, test } from "bun:test";
import {
  runCapabilityGuidance,
  TASK_RELIABILITY_GUIDANCE,
} from "../../shared/task-reliability";
test("capabilities distinguish offered tools from proven connectivity", () => {
  const text = runCapabilityGuidance([
    "host_list_folders",
    "computer_navigate",
    "host_list_folders",
  ]);
  expect(text).toContain("computer_navigate, host_list_folders");
  expect(text).toContain("account status is unverified");
  expect(text).toContain("current approvals");
  expect(runCapabilityGuidance([])).toContain("No tools are offered");
});
test("completion and recovery instructions require evidence and prohibit blind replay", () => {
  expect(TASK_RELIABILITY_GUIDANCE).toContain("read it back");
  expect(TASK_RELIABILITY_GUIDANCE).toContain("pending, verified, or blocked");
  expect(TASK_RELIABILITY_GUIDANCE).toContain("Never automatically repeat");
});
