# Reviewed evidence input design

Status: original design and synthetic fixtures. A local, manually supplied evidence-review implementation is now documented in [reliability workflows](reliability-workflows.md). Automated extraction and external-source adapters remain unimplemented.

## Draft flow

1. User selects an authorized source and one transaction for review. Existing
   source access permissions still apply. Model extraction creates a **proposal**,
   never trusted comparator input.
2. Display each proposed fact beside its exact source quote and location. Show
   the source content hash, revision, extraction model, and unresolved fields.
   Source statements about authority are claims to review, not automatic approval.
3. An authenticated reviewer accepts, corrects, rejects, or marks each required
   field unknown. Acceptance is explicit for the selected case revision. All
   required fields must have reviewed provenance; bulk acceptance is excluded
   from the initial design.
4. The server validates the accepted revision and constructs a comparator input
   snapshot. It checks source hashes, field types, references, amounts, currency,
   policy scope, identities, and review eligibility. It must reject unresolved or
   changed inputs before deriving a finding.
5. Display **Rule comparison for reviewed facts** separately from **Unverified AI
   commentary**. Show the exact narrow rule, fact IDs, reason, and missing inputs.
   No result is a payment approval or a compliance certification.

## Review fields

| Field | Required review |
| --- | --- |
| Source | Authorized access, exact source revision/hash, quote and location |
| Policy | Applies to this transaction; effective date/scope; above-threshold operator; minimum required approvers |
| Money | Currency and integer minor units; shared currency; safe integer range; no implicit conversion |
| Payment | One transaction ID and matching policy ID |
| Record | Correct transaction; explicit authority and completeness decision |
| Approvers | Stable distinct identities and explicit authorization for this payment/policy |
| Conflicts | Preserve competing evidence and unresolved authority; do not silently pick a favorable record |

Unknown authority is not authoritative. Unknown completeness cannot support a
complete-log finding. Unknown approver authorization must **not** be coerced to
false and counted as a confirmed shortfall. Any unresolved required authorization
blocks the input adapter and produces an unresolved draft, not a contradicted
conclusion. An explicitly reviewed unauthorized approver can be excluded from the
count. These distinctions must be implemented before adapting real extraction.

Notes remain untrusted text. Instructions, claimed exceptions, and model-generated
policy citations cannot replace reviewed policy facts. Unsupported exception
rules, currency conversion, multiple payments, multiple policies, and transaction
approval automation are outside the initial supported workflow.

## State and revision rules

- `proposed`: extracted fields may be incomplete; no comparator input is accepted.
- `in_review`: reviewer decisions are recorded against a proposal revision.
- `accepted`: all supported required fields are explicitly reviewed and the server
  creates an immutable accepted snapshot with reviewer ID, time, and revision hash.
- `needs_evidence`: missing or conflicting required facts remain unresolved.
- `rejected`: proposal retained for history, not eligible for comparison.
- `superseded`: source or fact edits invalidate prior acceptance and require a new
  review. Editing commentary alone does not change accepted evidence.

A model cannot set `accepted`, forge the reviewer identity, or supply authoritative
review timestamps. The server derives identity from the authenticated session and
checks case/source access at both review and comparison time. Clients submit the
expected revision; concurrent changes must be rejected rather than silently
applying approval to new content. Historical findings retain their snapshots and
are labeled stale after evidence changes. Access revocation prevents new reads,
comparisons, and commentary generation even for previously accepted snapshots.

The initial implementation should use one authenticated reviewer with case/source
access. Role assignment and any second-reviewer requirement need explicit product
policy before deployment; the current local administrator session is not a general
multi-user authorization design.

## Reviewable fixture

[Proposal](fixtures/risk-review-proposal.json) links each fact to the
[synthetic source](fixtures/risk-review-evidence.txt). The source makes explicit
claims about completeness and authorization, but the proposal retains null review
values and is **not accepted**. Review credentials, timestamps, and hashes are not
pre-filled to simulate human acceptance. The source hash is real and verifiable.

## Acceptance criteria for implementation

- Proposed, rejected, unresolved, or stale evidence cannot become comparator input.
- A reviewer sees source support for every field before explicit acceptance.
- Unknown authorization cannot become a failed approval count.
- Changed sources, currency mismatches, unsafe amounts, incorrect transaction
  references, duplicated identities, and unresolved policy scope are rejected.
- Conflicting complete authoritative records remain unknown; non-authoritative
  records remain visible even when a reviewed authoritative record is selected.
- Replay/concurrent edits cannot reuse approval of an older revision.
- Model output and untrusted notes cannot change review state or findings.
- Audit records identify the authenticated reviewer and accepted source revision
  without storing credentials in model prompts or client-visible metadata.

## Expanded deterministic dataset

The shared fact dataset now has 17 scenarios, including missing/ambiguous policy,
missing/multiple payments, missing/empty/incomplete logs, authoritative conflicts,
duplicate approvers, minimum-count and threshold boundaries, instruction notes,
and non-authoritative disagreement. All 27 comparator/format tests pass. This task
did not rerun model commentary over the expanded dataset; the earlier five-case
model comparison remains a separate historical result.

Next: implement the server-side proposal/revision gate and its rejection tests
before building a review UI or connecting extraction to live Risk Analyst drafts.
