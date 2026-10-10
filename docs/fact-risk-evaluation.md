# Fact-ID approval experiment

This experimental comparator checks one narrow rule against explicitly curated
synthetic facts: payments **above** a threshold require a supplied number of
distinct authorized approvers. It does not parse documents or establish whether
real evidence is truthful, complete, authoritative, or legally applicable.

```sh
.env.tools/bun/bin/bun test scripts/risk-facts.test.ts
.env.tools/bun/bin/bun scripts/evaluate-risk-facts.ts
```

The evaluation runner uses installed Qwen and Llama models by default. Model
summaries are saved separately as **unverified commentary**. They cannot change
the comparator's conclusion, reason, or referenced fact IDs. There is no live Bot
integration or automatic promotion. All examples are synthetic; live credentials
and company documents are not sent to a model by this runner.

## Inputs and guarantees

Fact IDs identify one policy, one payment, and approval records. The curator must
explicitly provide authorization, completeness, and authority. All money values
must share one unit/currency; the experiment does not perform currency conversion
or production financial arithmetic. Natural-language notes are not policy facts.

- Missing/ambiguous policy or payment: unknown.
- Missing authoritative approval record: unknown.
- Conflicting authoritative records or incomplete authoritative records: unknown.
- Invalid numbers, duplicate fact IDs, or repeated approver IDs: unknown.
- Payment at/below the threshold: unknown, because the supplied above-threshold
  rule makes no claim about that range.
- Complete consistent authoritative logs: count distinct authorized approvers
  and compare against the supplied requirement.

`Supported` means only that the supplied approval-count rule is satisfied by the
curated facts. It does not certify the payment or organization as compliant.
`Contradicted` means that supplied rule is not satisfied by those facts.

The inputs are developer-curated typed fixtures, not a public API. This module is
not an input-validation or policy-enforcement boundary for untrusted JSON.
Human or separately validated extraction would be required before real documents
could become authoritative facts.

## Tests and experiment

Twelve deterministic tests pass: the five scenario fixtures plus authoritative
conflicts, duplicate IDs/approvers, unauthorized approvers, invalid/boundary values,
incomplete logs, instruction notes, extra approvers, and equivalent reordered logs. All five scenario findings match the
fixture expectations without using an LLM.

Commentary reference validation only checks that cited IDs belong to the finding;
it does not prove the summary is true or that citations support its claims.
Reports record raw commentary and provenance under ignored
`.env.tools/evaluations/risk-facts-*.json`, with private file permissions.

## Final comparison

The final run is
`.env.tools/evaluations/risk-facts-2026-10-10T18-14-49-845Z.json`.
All five deterministic findings match the expected fixture outcomes. Qwen and
Llama each completed five summaries without execution errors or truncation, and
all ten summary responses passed format/reference checks.

This does not establish semantic accuracy. Qwen described the required minimum
of two approvers as "exactly two," which could incorrectly exclude a third
approver. Llama sometimes repeated the generic missing-input reason without
explaining which input was missing. Commentary remains unverified. An added test
confirms that three authorized approvers satisfy a requirement of two.

The earlier exploratory run lacked available payment provenance on missing-policy
findings; that was corrected and the final comparison rerun. The live risk Bot's
role, model, evaluation label, and permissions remain unchanged.

Next: expand the curated cases and design a review step for evidence extraction
before integrating deterministic findings into a Risk Analyst draft workflow.
