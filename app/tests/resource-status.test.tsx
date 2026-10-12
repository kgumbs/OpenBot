import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceStatus } from "../src/components/computer/resource-status";
beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());
function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ResourceStatus detail />
    </QueryClientProvider>,
  );
  return { view, queryClient };
}
test("resource warning includes scope and timestamp and clears after recovery", async () => {
  const original = globalThis.fetch;
  let warning = true;
  globalThis.fetch = (async () =>
    Response.json({
      checkedAt: new Date().toISOString(),
      state: warning ? "warning" : "ok",
      scopes: [
        {
          scope: "host",
          label: "Host",
          checkedAt: new Date().toISOString(),
          state: warning ? "warning" : "ok",
          checks: [
            {
              id: "memory",
              state: warning ? "warning" : "ok",
              message: warning
                ? "Memory pressure warning."
                : "Memory pressure normal.",
            },
          ],
        },
      ],
    })) as unknown as typeof fetch;
  const { view, queryClient } = mount();
  try {
    await waitFor(() =>
      expect(view.getByRole("alert").textContent).toContain(
        "Host: Memory pressure warning",
      ),
    );
    expect(view.getByRole("alert").textContent).toContain("Checked");
    warning = false;
    await queryClient.invalidateQueries({ queryKey: ["resources"] });
    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
    expect(view.getByRole("status").textContent).toContain("normal");
  } finally {
    queryClient.clear();
    globalThis.fetch = original;
  }
});
test("missing readings display unknown instead of a healthy status", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      checkedAt: new Date().toISOString(),
      state: "unknown",
      scopes: [
        {
          scope: "docker_runtime",
          label: "Docker runtime / VM",
          checkedAt: new Date().toISOString(),
          state: "unknown",
          checks: [
            {
              id: "supervisor",
              state: "unknown",
              message: "Readings unavailable.",
            },
          ],
        },
      ],
    })) as unknown as typeof fetch;
  const { view, queryClient } = mount();
  try {
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toContain(
        "Resources: unknown",
      ),
    );
    expect(view.getByRole("status").textContent).toContain(
      "Docker runtime / VM",
    );
  } finally {
    queryClient.clear();
    globalThis.fetch = original;
  }
});
