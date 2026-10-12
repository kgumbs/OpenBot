import { beforeAll, afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ComputerToolCheck } from "../src/components/computer/tool-check";
beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());
test("tool checks require explicit confirmation and report failures without retry", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({
      state: "needs_attention",
      checkedAt: new Date().toISOString(),
      checks: [
        { id: "workspace", status: "fail", message: "Could not verify" },
      ],
    });
  }) as unknown as typeof fetch;
  try {
    const view = render(<ComputerToolCheck botId="test-bot" />);
    expect(calls).toBe(0);
    fireEvent.click(view.getByText("Check Bot tools"));
    expect(view.getByRole("alert").textContent).toContain("Finish or stop");
    expect(calls).toBe(0);
    fireEvent.click(view.getByText("Run tool check"));
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toContain("need attention"),
    );
    expect(calls).toBe(1);
    expect(view.getByRole("status").textContent).toContain(
      "not model inference",
    );
  } finally {
    globalThis.fetch = original;
  }
});
