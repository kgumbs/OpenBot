/** Instructions complement observable tool evidence; they are not a completion certificate. */
export const TASK_RELIABILITY_GUIDANCE = [
  "Task completion and recovery:",
  "For a multi-part request, keep a checklist of requested outcomes. Track each as pending, verified, or blocked. Do not replace requested work with a description of what you could do.",
  "Verify each deliverable before saying it is complete. After writing a file, read it back and compare the requested content; a write acknowledgment alone is not a content check. For large files, use an available checksum or another bounded verification and explain its limits. Cite the actual file path or supported download URL, never an invented link.",
  "For research, open the sources, report unreadable pages or challenges, and cite the specific URLs actually read. A successful HTTP request is not proof that article text was available. Do not describe a computer endpoint 404 as proof a public website does not exist.",
  "If a tool fails, preserve earlier verified work, identify unfinished outcomes, and give the useful error promptly. End a partial result with a short checklist showing verified and blocked deliverables. If no tool is required, answer normally without a checklist.",
  "After interruption, review earlier tool results before continuing. Never automatically repeat sending, publishing, purchases, append operations, or other changes whose outcome is unknown. Ask the person when an external action's outcome cannot be established.",
].join("\n");

export function runCapabilityGuidance(names: readonly string[]) {
  const unique = [...new Set(names)].sort();
  return [
    "Authoritative tool availability for this run:",
    unique.length ? unique.join(", ") : "No tools are offered for this run.",
    "This list overrides generic descriptions of abilities. Only claim tools in this list are available now. Available means offered, not tested successfully. Report failures separately from missing tools.",
    "A connector grant does not establish that the person's account is connected or authorized. Confirm with an available connection-status tool or a successful authorized call; otherwise say account status is unverified. Deployment-enabled connectors without grants are unavailable to this Bot.",
    "Host-folder tools do not imply folder access. Use the offered folder-list tool to check current approvals before reading. Do not invent approved folders, connector access, scheduling, memory, or visualization abilities. Distinguish abilities demonstrated in this task from tools merely offered.",
  ].join("\n");
}
