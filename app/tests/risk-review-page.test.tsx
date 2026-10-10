import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { RiskReviewPage } from "../src/routes/_authed/admin/risk-review";
import {
  createRiskReviewStore,
  reviewFields,
} from "../../server/src/risk-review/store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const originalFetch = globalThis.fetch;
const NativeResponse = globalThis.Response;
let directory = "";
beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function page() {
  directory = mkdtempSync(join(tmpdir(), "openbot-risk-page-"));
  const store = createRiskReviewStore(directory);
  const view = (item: ReturnType<typeof store.get>) => ({
    ...item,
    fields: reviewFields(item.draft),
  });
  globalThis.fetch = Object.assign(async (input: any, init?: RequestInit) => {
    const path = String(input).replace("/api/admin/risk-reviews", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    try {
      if (!path && !body)
        return NativeResponse.json({ cases: store.list("human") });
      if (!path) return NativeResponse.json(view(store.create("human", body)));
      const id = path.split("/")[1]!;
      if (path.endsWith("/decisions"))
        return NativeResponse.json(
          view(
            store.decide("human", id, body.version, body.field, body.decision),
          ),
        );
      if (path.endsWith("/compare"))
        return NativeResponse.json(
          view(store.compare("human", id, body.version)),
        );
      if (init?.method === "PUT")
        return NativeResponse.json(
          view(store.replace("human", id, body.version, body.draft)),
        );
      return NativeResponse.json(view(store.get("human", id)));
    } catch (error) {
      return NativeResponse.json(
        { error: (error as Error).message },
        { status: 409 },
      );
    }
  }, originalFetch);
  const router = createRouter({
    routeTree: createRootRoute({ component: RiskReviewPage }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
async function create(view: ReturnType<typeof page>) {
  await waitFor(() => view.getByText("No saved cases."));
  fireEvent.click(view.getByRole("button", { name: "Load synthetic example" }));
  fireEvent.click(view.getByRole("button", { name: "Create review draft" }));
  await waitFor(() => view.getByText("P1.currency"));
}
test("unsaved edits block field decisions and revision clears acceptance", async () => {
  const view = page();
  await create(view);
  fireEvent.click(view.getAllByRole("button", { name: "Accept field" })[0]!);
  await waitFor(() => expect(view.getByText(/Revision 2 ·/)).toBeDefined());
  const textarea = view.getByLabelText("Evidence JSON") as HTMLTextAreaElement;
  const draft = JSON.parse(textarea.value);
  draft.title = "Edited draft";
  const user = userEvent.setup({ document: globalThis.document });
  await user.clear(textarea);
  await user.click(textarea);
  await user.paste(JSON.stringify(draft));
  await waitFor(() =>
    view.getByText(
      "Evidence JSON has unsaved changes. Revise evidence before reviewing more fields.",
    ),
  );
  expect(
    view
      .getAllByRole("button", { name: "Accept field" })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
  fireEvent.click(
    view.getByRole("button", { name: "Revise evidence and clear decisions" }),
  );
  await waitFor(() => view.getByText(/Revision 3 · proposed/));
  expect(
    (
      view.getByRole("button", {
        name: "Compare reviewed evidence",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
test("comparison becomes ready only after individual review and displays the narrow finding", async () => {
  const view = page();
  await create(view);
  expect(
    (
      view.getByRole("button", {
        name: "Compare reviewed evidence",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  const count = view.getAllByRole("button", { name: "Accept field" }).length;
  for (let i = 0; i < count; i++) {
    fireEvent.click(view.getAllByRole("button", { name: "Accept field" })[i]!);
    await waitFor(() => view.getByText(new RegExp(`Revision ${i + 2} ·`)));
    await waitFor(() =>
      expect(
        (
          view.getAllByRole("button", { name: "Accept field" })[
            i
          ] as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  }
  expect(
    view.getByText(
      "All required fields are accepted. Compare the reviewed evidence when ready.",
    ),
  ).toBeDefined();
  fireEvent.click(
    view.getByRole("button", { name: "Compare reviewed evidence" }),
  );
  await waitFor(() => view.getByText("Rule comparison for reviewed facts"));
  expect(view.getByRole("status").textContent).toContain("contradicted");
  expect(view.getByText(/This result is not payment approval/)).toBeDefined();
});
