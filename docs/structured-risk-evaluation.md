# Constrained evidence experiment

Run the evaluation against installed models:

```sh
.env.tools/bun/bin/bun scripts/evaluate-local-risk.ts --structured
```

Freeform mode remains available without the flag. No runtime Bot prompt or model
routing is changed by this experiment.

Structured mode adds a fifth case where a supplied policy is satisfied. It requests
JSON with a conclusion (`supported`, `contradicted`, or `unknown`), observations,
unknowns, and follow-up evidence requests. A conclusion refers only to the supplied
approval policy and transaction; it is not a general compliance certification.

Each observation must quote contiguous source text verbatim, except that an
unknown observation must have an empty quote. The validator checks fields, types,
count limits, classification vocabulary, and quote presence. It does not establish
that a quote logically supports a claim. The tests explicitly demonstrate this
limitation. The full responses still require expert review.

Reports separately record format validation, expected conclusion, conclusion
matching, raw output, and completion status. A matching conclusion with fabricated
quotes or unsupported follow-up claims is not a passing assessment. Timeouts and
truncated output are not promoted as valid results. Reports remain ignored local
files under `.env.tools/evaluations/`.

## Results: October 10, 2026

The final aligned run is
`.env.tools/evaluations/risk-structured-2026-10-10T18-11-13-232Z.json`.
An earlier exploratory run exposed a mismatch between the prompt's observation
count and the validator; the prompt was corrected before this final comparison.

| Check across five cases | Qwen 3.5 | Llama 3.2 |
| --- | --- | --- |
| Completed responses | 5/5 | 4/5 |
| Format and quote validation | 4/5 | 0/5 |
| Expected top-level conclusion | 5/5 | 3/5 |

Llama's conflicting-records request returned HTTP 500; it was recorded as a failed
execution, not silently retried or counted as a valid response. The cause of that
runtime error was not established. None of the completed final responses reported
token truncation.

Qwen's top-level classifications improved, but its follow-up text still questioned
an explicitly complete approval log and introduced unsupported override/exception
possibilities. Its transaction-note case omitted a required source quote. Llama
continued to omit or invent quotes and misclassified the transaction-note case.

These are small synthetic development results, not statistically established
model quality scores. The four cases shared with the freeform baseline and the new
positive case are identified in the saved reports; the five-case totals are not a
like-for-like numerical comparison with the four-case freeform run.

Three validator tests pass, covering valid output, malformed structures,
unsupported classifications, fabricated/misused quotes, and the limitation that
quote matching does not establish logical support.

Neither model is promoted. The risk Bot's production-facing prompt, evaluation
label, model routing, and access grants remain unchanged.

Next: test a fact-ID format with deterministic policy comparisons. Keep generated
commentary separate from verified findings, and expand the synthetic cases before
considering deployment.

The next [fact-ID experiment](fact-risk-evaluation.md) separates deterministic
findings from model commentary and records its input-trust limitations.
