import { expect, test } from "bun:test";
import { containerMemory, ownedResourceContainer } from "../src/resources";
import {
  BOT_LABEL,
  OWNER_LABEL,
  NAMESPACE_LABEL,
  NAMESPACE,
} from "../src/names";
test("container readings subtract reclaimable cache and distinguish uncapped memory", () => {
  expect(
    containerMemory(
      { memory_stats: { usage: 95, limit: 100, stats: { inactive_file: 40 } } },
      100,
    ),
  ).toMatchObject({ state: "ok", percent: 55 });
  expect(
    containerMemory({ memory_stats: { usage: 96, limit: 100 } }, 100).state,
  ).toBe("critical");
  expect(
    containerMemory({ memory_stats: { usage: 50, limit: 100 } }, 0).message,
  ).toContain("no individual cap");
  expect(containerMemory({}, 100).state).toBe("unknown");
});
test("resource inspection cannot include a container from another Bot or deployment", () => {
  const labels = {
    [OWNER_LABEL]: "true",
    [BOT_LABEL]: "mine",
    [NAMESPACE_LABEL]: NAMESPACE,
  };
  expect(ownedResourceContainer(labels, "mine")).toBe(true);
  expect(ownedResourceContainer(labels, "other")).toBe(false);
  expect(
    ownedResourceContainer(
      { ...labels, [NAMESPACE_LABEL]: "other-deployment" },
      "mine",
    ),
  ).toBe(false);
  expect(ownedResourceContainer({ [BOT_LABEL]: "mine" }, "mine")).toBe(false);
});
