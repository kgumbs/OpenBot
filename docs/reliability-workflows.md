# Model progress, local knowledge and reviewed risk evidence

These are priorities 4–6 of the local reliability plan. Composio remains deferred. The full app test suite remains on hold; focused checks cover these changes.

## Model performance visibility

A working channel shows Connecting, Waiting for model, Generating, or Waiting for tool with the tool name and total elapsed time. The indicator spans frontend tool handoffs and disappears after the task ends. Waiting for model may include loading a local model; the UI does not claim to observe Ollama loading or token throughput. After 60 seconds the indicator suggests checking System health or stopping before retrying. Timeout errors include model/browser recovery directions; the UI does not automatically resend a failed request.

## Knowledge search

Approve a folder for the chosen Bot in Admin > Computers using the native desktop. The Bot calls `host_list_folders`, then `host_search_files` with a grant ID and a literal query. All query words must occur on the same line. It can supply up to 16 relative paths, including subfolders, or search up to 16 supported files directly inside the approved folder. Supported extensions are txt, md, csv, json, yaml/yml and log. Native read/output limits still apply; oversized and non-UTF-8 sources are reported as skipped. Search never executes arbitrary shell commands.

Each hit includes the exact passage, relative filename, line number, SHA-256 of the returned source text and observation time. A date declared in the first 30 lines as Date/Updated/Last Updated is returned separately; missing dates are null. This is a document claim, not filesystem modification time or proof that it is the applicable policy date. Cite the passage and filename/line; say date unavailable when absent. Results are bounded to 12 passages, with at most three per file, and the response discloses limits. PDF/Office extraction, recursive indexing and semantic ranking are not part of this version.

Reads use the existing broker, bound to the authenticated actor, selected Bot and grant. Every file read reuses native path/symlink checks, and revocation is checked before returning results. Source text is untrusted data and cannot grant permissions or prove completeness. No new folder approvals are installed by this feature. No live folder search was run during verification because this installation has no approved folders; scope and revocation were tested with fixtures.

## Risk evidence review

Open Admin > Risk evidence review. This local subscription-profile workflow is administrator-only and cases belong to the authenticated creator. It is a single API-process local workflow, not a distributed case-management service. It does not read arbitrary file paths, approve payments or certify compliance. Imported evidence must be supplied by a person with authority to use it; the initial UI supports pasted structured sources, not automatic extraction or cloud-source adapters.

Load the synthetic example to see the JSON shape. Start a new case with a title, named source text and facts. Each required leaf field needs a citation: source ID, one-based line and an exact contiguous quote from that line. The source/fact snapshot is hashed by the server. Proposed policy/payment fields can be null when unknown; an unknown value cannot be accepted until a revised draft supplies it. Unsupported policy operators and malformed evidence are refused.

Review each field individually beside its quote. Accept means the human verified the value, scope and provenance. Unknown and Reject leave the case in needs_evidence. There is no bulk acceptance control or agent approval tool. Reviewer identity and timestamps are derived from the server session; client/model-supplied acceptance state and reviewer fields are rejected. Source claims that a record is authoritative, complete or authorized remain claims for the human to verify.

Only after every required field is explicitly accepted can the server compare one supplied above-threshold policy with one payment and its reviewed approval records. It validates safe integer minor units, currency agreement, policy scope/effective date, references and distinct approver identities. Missing facts, unresolved authority and conflicting records cannot be converted into a false shortfall. Results are supported, contradicted or unknown for this narrow supplied rule, with fact IDs and a reason. Risk Bot commentary remains a draft; Local Risk Analyst retains its evaluation-only label.

Every request carries the expected revision. Stale requests fail instead of approving changed evidence. Revising a draft clears all decisions and moves an earlier finding and its evidence snapshot into historical records marked stale for the new draft. Reviewed snapshots cannot be edited through field-decision requests. The creator can reopen cases after restart. Review events record actor, case, operation and version without logging raw sources.

Private case files are saved atomically under `.env.tools/risk-reviews/` with restrictive permissions and remain ignored by Git. Back up that directory separately if cases must be retained; the source-update database dump does not include these local files. One case retains up to 50 historical findings. No automatic account connection, external transmission, regulatory applicability decision or payment approval is performed.

## Validation

Focused regressions cover elapsed progress and tool transitions, existing chat history behavior, exact search citations, grant isolation and revocation, evidence acceptance gates, unknown values, invalid provenance, policy mismatch, revision conflicts, snapshot persistence and forged reviewer identity. The focused run passed 119 tests across 12 files (417 assertions); app and server typechecks pass. An additional tenant-package integration test could not start because TEST_DATABASE_URL was not configured; it was excluded from the successful focused run rather than pointed at the live database. The full suite remains on hold. Live local-model validation showed elapsed progress and cleared it after the requested reply. A synthetic risk case required 21 individual field decisions and produced the expected contradicted result (one approver where two were required). Real source ingestion and policy correctness remain the human reviewer's responsibility.
