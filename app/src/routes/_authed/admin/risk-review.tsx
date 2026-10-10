import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/client";
import { riskReviewExample } from "../../../../../shared/risk-review-example";
export const Route = createFileRoute("/_authed/admin/risk-review")({
  component: RiskReviewPage,
});
type Review = {
  id: string;
  version: number;
  state: string;
  hash: string;
  draft: {
    title: string;
    sources: { id: string; name: string; text: string }[];
  };
  fields: {
    key: string;
    value: unknown;
    citation?: { sourceId: string; line: number; quote: string };
  }[];
  decisions: Record<
    string,
    { decision: string; reviewerId: string; at: string }
  >;
  finding?: { conclusion: string; reason: string; factIds: string[] };
  reviewedAt?: string;
  history: {
    hash: string;
    finding: { conclusion: string };
    reviewedAt: string;
  }[];
};
type Summary = { id: string; title: string; state: string; version: number };
export function RiskReviewPage() {
  const [draft, setDraft] = useState("");
  const [item, setItem] = useState<Review | null>(null);
  const [cases, setCases] = useState<Summary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const response = await client("/api/admin/risk-reviews", {
      fallback: "Could not load local risk reviews.",
    });
    const data = await response.json();
    setCases(data.cases);
  };
  useEffect(() => {
    void refresh().catch((err) => setError(err.message));
  }, []);
  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await client(`/api/admin/risk-reviews${path}`, {
        method,
        body,
        fallback: "Review failed. Reload the case before retrying.",
      });
      const next = (await response.json()) as Review;
      setItem(next);
      setDraft(JSON.stringify(next.draft, null, 2));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  const edited = item !== null && draft !== JSON.stringify(item.draft, null, 2);
  const canCompare =
    item &&
    item.fields.every(
      (field) => item.decisions[field.key]?.decision === "accept",
    );
  return (
    <PageShell
      title="Risk evidence review"
      description="Review supplied policy and transaction evidence before a deterministic rule comparison. Every required field needs an explicit decision. This workflow never approves payments or certifies compliance."
    >
      {error ? (
        <p role="alert" className="rounded-md border border-destructive p-3">
          {error}
        </p>
      ) : null}
      <PageSection title="Saved cases">
        <div className="flex flex-wrap gap-2">
          {cases.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              disabled={busy}
              onClick={() => void action(`/${c.id}`, "GET")}
            >
              {c.title} · {c.state}
            </Button>
          ))}
          {!cases.length ? <p>No saved cases.</p> : null}
        </div>
      </PageSection>
      <PageSection
        title="Supplied evidence draft"
        description="Paste structured evidence with exact source quotes. Revise values and source support together. Revising clears all review decisions and retains previous findings as historical snapshots."
      >
        <div className="mb-3 flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setItem(null);
              setDraft(JSON.stringify(riskReviewExample(), null, 2));
              setError("");
            }}
          >
            Load synthetic example
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setItem(null);
              setDraft("");
              setError("");
            }}
          >
            New case
          </Button>
        </div>
        <label className="block">
          Evidence JSON
          <textarea
            aria-label="Evidence JSON"
            className="mt-2 min-h-64 w-full rounded-md border bg-background p-3 font-mono text-xs"
            value={draft}
            onInput={(event) => setDraft(event.currentTarget.value)}
          />
        </label>
        <Button
          className="mt-3"
          disabled={busy || !draft.trim()}
          onClick={() => {
            try {
              const value = JSON.parse(draft);
              void action(
                item ? `/${item.id}` : "",
                item ? "PUT" : "POST",
                item ? { version: item.version, draft: value } : value,
              );
            } catch {
              setError("Evidence must be valid JSON.");
            }
          }}
        >
          {item ? "Revise evidence and clear decisions" : "Create review draft"}
        </Button>
      </PageSection>
      {item ? (
        <>
          {edited ? (
            <p role="status">
              Evidence JSON has unsaved changes. Revise evidence before
              reviewing more fields.
            </p>
          ) : null}
          <PageSection
            title="Source support"
            description={`Revision ${item.version} · ${item.state} · Source and fact hash ${item.hash}`}
          >
            {item.draft.sources.map((source) => (
              <details key={source.id} open>
                <summary>
                  {source.id} · {source.name}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border p-3 text-sm">
                  {source.text
                    .split(/\r?\n/)
                    .map((line, index) => `${index + 1}: ${line}`)
                    .join("\n")}
                </pre>
              </details>
            ))}
          </PageSection>
          <PageSection
            title="Review each required field"
            description="Acceptance means you verified the value against its quoted source, including scope, authority and completeness. Use Unknown or Reject when support is insufficient, then revise the draft. Source statements about authority are claims for you to verify."
          >
            <div className="space-y-3">
              {item.fields.map((field) => (
                <div key={field.key} className="rounded-md border p-3">
                  <strong>{field.key}</strong>
                  <p>
                    Proposed value: <code>{JSON.stringify(field.value)}</code>
                  </p>
                  <blockquote className="my-2 border-l-2 pl-3">
                    {field.citation?.quote}
                  </blockquote>
                  <p className="text-sm text-muted-foreground">
                    {field.citation?.sourceId}, line {field.citation?.line} ·{" "}
                    {item.decisions[field.key]?.decision ?? "Unreviewed"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {(["accept", "unknown", "reject"] as const).map(
                      (decision) => (
                        <Button
                          key={decision}
                          size="sm"
                          variant="outline"
                          disabled={
                            busy ||
                            edited ||
                            item.state === "reviewed" ||
                            (decision === "accept" && field.value === null)
                          }
                          onClick={() =>
                            void action(`/${item.id}/decisions`, "POST", {
                              version: item.version,
                              field: field.key,
                              decision,
                            })
                          }
                        >
                          {decision === "accept"
                            ? "Accept field"
                            : decision === "unknown"
                              ? "Unknown"
                              : "Reject"}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="mt-4"
              disabled={
                busy || edited || !canCompare || item.state === "reviewed"
              }
              onClick={() =>
                void action(`/${item.id}/compare`, "POST", {
                  version: item.version,
                })
              }
            >
              Compare reviewed evidence
            </Button>
          </PageSection>
          {item.finding ? (
            <PageSection
              title="Rule comparison for reviewed facts"
              description={item.draft.title}
            >
              <p role="status">
                <strong>{item.finding.conclusion}</strong>:{" "}
                {item.finding.reason}
              </p>
              <p>
                Fact IDs: {item.finding.factIds.join(", ")} · Reviewed{" "}
                {item.reviewedAt}
              </p>
              <p>
                Human-reviewed evidence snapshot. This result is not payment
                approval or compliance certification.
              </p>
            </PageSection>
          ) : (
            <p>
              {canCompare
                ? "All required fields are accepted. Compare the reviewed evidence when ready."
                : "Comparison blocked until every required field has been reviewed and accepted."}
            </p>
          )}
          {item.history.length ? (
            <PageSection
              title="Historical findings"
              description="These results apply to earlier evidence snapshots and are stale for the current draft."
            >
              {item.history.map((history, index) => (
                <p key={`${history.hash}-${index}`}>
                  {history.finding.conclusion} · {history.reviewedAt} ·{" "}
                  {history.hash}
                </p>
              ))}
            </PageSection>
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}
