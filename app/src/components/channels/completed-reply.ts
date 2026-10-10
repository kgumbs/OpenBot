import type { Message } from "@ag-ui/core";

/** Repair a completed turn's partial live text from its durable final answer. */
export function reconcileCompletedReply(
  local: Message[],
  stored: Message[],
  beforeRun: ReadonlySet<string>,
): Message[] {
  const durable = new Map(stored.map((message) => [message.id, message]));
  let changed = false;
  const result = local.map((message) => {
    const saved = durable.get(message.id);
    if (
      message.role !== "assistant" ||
      beforeRun.has(message.id) ||
      saved?.role !== "assistant" ||
      typeof saved.content !== "string" ||
      typeof message.content !== "string" ||
      saved.content.length <= message.content.length
    )
      return message;
    changed = true;
    return { ...message, content: saved.content };
  });
  return changed ? result : local;
}
