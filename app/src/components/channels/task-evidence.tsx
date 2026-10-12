import type { Message } from "@ag-ui/core";

export function taskEvidence(messages: Message[]) {
  const start = messages.findLastIndex((message) => message.role === "user");
  if (start < 0) return null;
  const turn = messages.slice(start + 1);
  const calls = new Map(
    turn.flatMap((message) =>
      message.role === "assistant"
        ? (message.toolCalls ?? []).map((call) => [call.id, call] as const)
        : [],
    ),
  );
  const answered = new Set<string>();
  const failures: string[] = [];
  const writes = new Map<string, string | null>();
  const verified = new Set<string>();
  let results = 0;
  for (const message of turn) {
    if (message.role !== "tool") continue;
    answered.add(message.toolCallId);
    results++;
    const call = calls.get(message.toolCallId);
    const content = typeof message.content === "string" ? message.content : "";
    let value: Record<string, unknown> = {};
    try {
      value = JSON.parse(content);
    } catch {}
    const failed =
      value?.isError === true ||
      value?.successful === false ||
      Boolean(value?.error) ||
      (typeof value?.exitCode === "number" && value.exitCode !== 0) ||
      /^(?:Error|Refused|Unavailable)\b|HTTP (?:4|5)\d\d|socket connection was closed|net::ERR_/i.test(
        content,
      );
    if (failed) {
      failures.push(call?.function.name ?? "tool");
      continue;
    }
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call?.function.arguments ?? "{}");
    } catch {}
    const path = typeof args?.path === "string" ? args.path : undefined;
    if (call?.function.name === "computer_write_file" && path) {
      writes.set(
        path,
        args.append === true || typeof args.contents !== "string"
          ? null
          : args.contents,
      );
      verified.delete(path);
    }
    if (
      call?.function.name === "computer_read_file" &&
      path &&
      writes.has(path) &&
      typeof value?.text === "string" &&
      value.truncated === false &&
      value.text === writes.get(path)
    )
      verified.add(path);
  }
  return {
    results,
    failures,
    pending: [...calls.keys()].filter((id) => !answered.has(id)).length,
    unverifiedFiles: [...writes.keys()].filter((path) => !verified.has(path))
      .length,
  };
}

export function TaskEvidence({
  messages,
  running,
}: {
  messages: Message[];
  running: boolean;
}) {
  const evidence = taskEvidence(messages);
  if (running || !evidence || (!evidence.results && !evidence.pending))
    return null;
  const incomplete =
    evidence.failures.length > 0 ||
    evidence.pending > 0 ||
    evidence.unverifiedFiles > 0;
  return (
    <div role="status" className="pb-2 text-sm text-muted-foreground">
      <p>
        {incomplete ? "Task needs review" : "Tool activity recorded"}:{" "}
        {evidence.results} tool results
        {evidence.failures.length
          ? ` · ${evidence.failures.length} reported failures (${[...new Set(evidence.failures)].join(", ")})`
          : ""}
        {evidence.pending ? ` · ${evidence.pending} calls without results` : ""}
        {evidence.unverifiedFiles
          ? ` · ${evidence.unverifiedFiles} file writes without a full read-back`
          : ""}
        .
      </p>
      <p>
        Tool results alone do not verify every requested outcome. Review the
        answer and its evidence before treating the task as complete.
      </p>
    </div>
  );
}
