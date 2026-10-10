/**
 * What a computer is told about itself.
 *
 * Kept separate from the HTTP server so the exact environment boundary is testable without
 * starting a listener or connecting to Docker. Nothing here is caller-supplied: a request says
 * which Bot, never what to run or what to set.
 */
export function environmentFor(
  botId: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const passthrough = Object.entries(env).filter(([key]) =>
    key.startsWith("EGRESS_PROXY"),
  );
  const computerToken = env.COMPUTER_TOKEN?.trim() || undefined;
  const spireSocketVolume = env.SPIRE_AGENT_SOCKET_VOLUME;
  // Fail fast here rather than forwarding an invalid mode that crashes the child at
  // `browserModeFromEnv`: whitespace-only is falsy after trim, anything else must be headless
  // or headed.
  const rawBrowserMode = env.COMPUTER_BROWSER_MODE?.trim() || undefined;
  if (
    rawBrowserMode !== undefined &&
    rawBrowserMode !== "headless" &&
    rawBrowserMode !== "headed"
  ) {
    throw new Error(
      `COMPUTER_BROWSER_MODE must be headless or headed, not ${JSON.stringify(env.COMPUTER_BROWSER_MODE)}.`,
    );
  }
  let overrides: Record<string, unknown> = {};
  if (env.COMPUTER_BROWSER_MODES?.trim()) {
    const parsed: unknown = JSON.parse(env.COMPUTER_BROWSER_MODES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(
        "COMPUTER_BROWSER_MODES must be a JSON object of Bot IDs to browser modes.",
      );
    }
    overrides = parsed as Record<string, unknown>;
    for (const [id, mode] of Object.entries(overrides)) {
      if (!id.trim() || (mode !== "headless" && mode !== "headed")) {
        throw new Error(
          "COMPUTER_BROWSER_MODES entries must map nonempty Bot IDs to headless or headed.",
        );
      }
    }
  }
  const browserMode = Object.hasOwn(overrides, botId)
    ? overrides[botId]
    : rawBrowserMode;
  return [
    `COMPUTER_BOT_ID=${botId}`,
    ...(computerToken ? [`COMPUTER_TOKEN=${computerToken}`] : []),
    ...(spireSocketVolume
      ? ["SPIFFE_ENDPOINT_SOCKET=/tmp/spire-agent/public/api.sock"]
      : []),
    ...(browserMode ? [`COMPUTER_BROWSER_MODE=${browserMode}`] : []),
    ...(env.COMPUTER_SANDBOX === "on" ? ["COMPUTER_SANDBOX=on"] : []),
    ...passthrough.map(([key, value]) => `${key}=${value ?? ""}`),
  ];
}
