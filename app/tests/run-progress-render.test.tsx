import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { render, cleanup, act } from "@testing-library/react";
import { RunProgress } from "../src/components/channels/run-progress";
beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());
test("elapsed progress survives tool transitions and disappears when the run finishes", async () => {
  const original = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const view = render(
      <RunProgress
        running
        connecting={false}
        messages={[{ id: "u", role: "user", content: "go" }]}
      />,
    );
    expect(view.getByRole("status").textContent).toContain(
      "Waiting for model · 0s",
    );
    now = 62_000;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(view.getByRole("status").textContent).toContain("61s elapsed");
    expect(view.getByRole("status").textContent).toContain("Taking longer");
    view.rerender(
      <RunProgress
        running
        connecting
        messages={[
          { id: "u", role: "user", content: "go" },
          {
            id: "a",
            role: "assistant",
            toolCalls: [
              {
                id: "t",
                type: "function",
                function: { name: "search", arguments: "{}" },
              },
            ],
          },
        ]}
      />,
    );
    expect(view.getByRole("status").textContent).toContain(
      "Waiting for tool: search · 61s",
    );
    view.rerender(
      <RunProgress running={false} connecting={false} messages={[]} />,
    );
    expect(view.queryByRole("status")).toBeNull();
  } finally {
    Date.now = original;
  }
});
