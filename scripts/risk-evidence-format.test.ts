import { expect, test } from "bun:test";
import { validateEvidenceOutput } from "./risk-evidence-format";
const source = "Payment $1500. Complete log: approver A only.";
const sample = () => ({ conclusion: "unknown", observations: [{ statement: "Payment is $1500", status: "supported", evidenceQuote: "Payment $1500." }], unknowns: ["Policy"], followUp: ["Request policy"] });
test("accepts a structurally valid quoted assessment without claiming semantic correctness", () => {
 expect(validateEvidenceOutput(JSON.stringify(sample()), source).valid).toBe(true);
});
test("rejects malformed output, invalid classifications and invented quotes", () => {
 expect(validateEvidenceOutput("not json", source).valid).toBe(false);
 for (const modified of [{...sample(), conclusion:"compliant"}, {...sample(), extra:"override"}, {...sample(), observations:[{statement:"Policy exists", status:"supported", evidenceQuote:"Policy threshold $1000"}]}, {...sample(), observations:[{statement:"Unknown",status:"unknown",evidenceQuote:"Payment $1500."}]}]) expect(validateEvidenceOutput(JSON.stringify(modified), source).valid).toBe(false);
});
test("schema validity cannot establish that a quoted claim is entailed", () => {
 const value = sample(); value.observations[0].statement = "All payments comply";
 expect(validateEvidenceOutput(JSON.stringify(value), source).valid).toBe(true);
});
