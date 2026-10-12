import { useQuery } from "@tanstack/react-query";
import type { ResourceReport } from "../../../../shared/resources";
import { client } from "@/lib/client";
export function ResourceStatus({
  detail = false,
  botId,
}: {
  detail?: boolean;
  botId?: string;
}) {
  const query = useQuery({
    queryKey: ["resources", botId ?? "system"],
    queryFn: async () =>
      (
        await client(
          `/api/resources${botId ? `/${encodeURIComponent(botId)}` : ""}`,
          { fallback: "Resource readings unavailable." },
        )
      ).json() as Promise<ResourceReport>,
    refetchInterval: 15_000,
    retry: false,
  });
  const data = query.data;
  const stale =
    !!data &&
    (query.isError || Date.now() - Date.parse(data.checkedAt) > 45_000);
  const issues =
    data?.scopes.flatMap((scope) =>
      scope.checks
        .filter(
          (check) => check.state === "warning" || check.state === "critical",
        )
        .map((check) => `${scope.label}: ${check.message}`),
    ) ?? [];
  if (!detail && !issues.length && !query.isError && !stale) return null;
  return (
    <section
      aria-label="System resources"
      className="m-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
      role={issues.length ? "alert" : "status"}
    >
      <p className="font-medium">
        Resources:{" "}
        {stale
          ? "readings stale"
          : query.isError
            ? "unavailable"
            : (data?.state ?? "checking…")}
      </p>
      {data ? (
        <p className="text-muted-foreground">
          Checked {new Date(data.checkedAt).toLocaleTimeString()}. Refreshes
          every 15 seconds.
        </p>
      ) : null}
      {issues.map((message) => (
        <p key={message}>{message}</p>
      ))}
      {query.isError || stale ? (
        <p>Current resource pressure could not be confirmed.</p>
      ) : null}
      {detail && data
        ? data.scopes.map((scope) => (
            <div key={scope.scope} className="mt-2">
              <p className="font-medium">
                {scope.label} · {new Date(scope.checkedAt).toLocaleTimeString()}
              </p>
              {scope.checks.map((check) => (
                <p key={check.id}>
                  {check.state}: {check.message}
                </p>
              ))}
            </div>
          ))
        : null}
      {issues.length ? (
        <p>
          Reduce concurrent work or free resources before retrying. Review
          previous results before repeating an action.
        </p>
      ) : null}
    </section>
  );
}
