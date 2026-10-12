import { useState } from "react";
import { client } from "@/lib/client";
import { Button } from "@/components/ui/button";

type Result = {
  state: string;
  checkedAt: string;
  checks: { id: string; status: string; message: string }[];
};

export function ComputerToolCheck({ botId }: { botId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setConfirm(false);
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const response = await client(
        `/api/computers/${encodeURIComponent(botId)}/diagnostics`,
        { method: "POST", fallback: "Tool check could not complete." },
      );
      setResult(await response.json());
    } catch {
      setError(
        "Tool check could not complete. Check System health before trying again.",
      );
    } finally {
      setRunning(false);
    }
  }
  return (
    <div className="mt-2 text-sm">
      <Button
        size="sm"
        variant="outline"
        disabled={running}
        onClick={() => setConfirm(true)}
      >
        {running ? "Checking tools…" : "Check Bot tools"}
      </Button>
      {confirm && (
        <div role="alert" className="mt-2 space-y-2">
          <p>
            Finish or stop this Bot's task first. This check runs a harmless
            shell command, writes and reads a temporary workspace file, attempts
            cleanup, and opens example.com in the Bot's browser. Existing tabs
            may change. Policy and approvals still apply.
          </p>
          <Button size="sm" onClick={() => void run()}>
            Run tool check
          </Button>{" "}
          <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status" className="mt-2">
          <p>
            Tools: {result.state === "verified" ? "verified" : "need attention"}{" "}
            · Checked {new Date(result.checkedAt).toLocaleTimeString()}
          </p>
          {result.checks.map((check) => (
            <p key={check.id}>
              {check.status.toUpperCase()} · {check.id}: {check.message}
            </p>
          ))}
          <p>
            This checks the computer tools, not model inference, connector
            accounts, or task completion.
          </p>
        </div>
      )}
    </div>
  );
}
