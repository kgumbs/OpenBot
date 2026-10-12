import { useEffect, useState } from "react";
import type { Message } from "@ag-ui/core";

export function runPhase(messages: Message[], connecting = false) {
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const current = messages.slice(lastUser + 1);
  const answered = new Set(
    current
      .filter((message) => message.role === "tool")
      .map((message) => message.toolCallId),
  );
  const pending = current
    .flatMap((message) =>
      message.role === "assistant" ? (message.toolCalls ?? []) : [],
    )
    .filter((call) => !answered.has(call.id));
  if (pending.length)
    return `Waiting for tool: ${pending.map((call) => call.function.name).join(", ")}`;
  if (connecting) return "Connecting";
  const lastResult = current.findLastIndex(
    (message) => message.role === "tool",
  );
  return current
    .slice(lastResult + 1)
    .some(
      (message) =>
        message.role === "assistant" &&
        typeof message.content === "string" &&
        message.content.length > 0,
    )
    ? "Generating"
    : "Waiting for model";
}

export function runFailureMessage(message: string) {
  if (
    /socket|connection.*(?:closed|lost|reset)|network|fetch failed|disconnect/i.test(
      message,
    )
  )
    return "The response connection was lost. The Bot may have completed some actions. Keep the partial reply, check System health, and review tool results before continuing. Do not resend actions that send, publish, purchase, or change data until their outcome is known.";
  if (
    /HTTP (?:404|502|503)|computer.*(?:unavailable|could not|not.*reach)/i.test(
      message,
    )
  )
    return `${message} The Bot computer or tool route may be unavailable. Check Bot tools in Admin > Computers. Finish or stop active work before restarting the browser; saved files and sign-ins are retained.`;
  return /timeout|timed out|stall/i.test(message)
    ? `${message} Check System health in Admin > Computers. A local model may still be loading; retry after it is ready. Browser failures can be recovered with Restart browser. Stop the current task before retrying.`
    : message;
}

export function RunProgress({
  running,
  connecting,
  messages,
}: {
  running: boolean;
  connecting: boolean;
  messages: Message[];
}) {
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) {
      setStarted(null);
      return;
    }
    setStarted(Date.now());
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!running) return null;
  const elapsed = started === null ? 0 : Math.floor((now - started) / 1000);
  const phase = runPhase(messages, connecting);
  return (
    <p role="status" className="pb-2 text-sm text-muted-foreground">
      {phase} · {elapsed}s elapsed
      {elapsed >= 60
        ? " · Taking longer than usual. Check System health, or stop this task before retrying."
        : ""}
      {phase === "Waiting for model"
        ? " · The first response may include model loading."
        : ""}
    </p>
  );
}
