/** Synthetic, human-review-only example. No acceptance decisions are prefilled. */
export function riskReviewExample() {
  const source =
    "Policy P1: USD payments above 100000 minor units require two authorized approvers. Effective 2026-01-01. Applies to T1.\nPayment T1: USD 150000 minor units on 2026-10-01; policy P1.\nRecord A1: authoritative and complete for T1. Approver person-A is authorized.";
  const facts = [
    {
      id: "P1",
      kind: "policy",
      currency: "USD",
      thresholdMinorUnits: 100000,
      operator: "above",
      requiredApprovers: 2,
      effectiveDate: "2026-01-01",
      appliesToPayment: true,
    },
    {
      id: "T1",
      kind: "payment",
      currency: "USD",
      amountMinorUnits: 150000,
      policyId: "P1",
      date: "2026-10-01",
    },
    {
      id: "A1",
      kind: "approval",
      paymentId: "T1",
      authoritative: true,
      complete: true,
      approvers: [{ id: "person-A", authorized: true }],
    },
  ];
  const lines = source.split("\n");
  return {
    title: "Synthetic approval evidence example",
    sources: [{ id: "S1", name: "synthetic-evidence.txt", text: source }],
    facts: facts.map((fact, index) => {
      const citations: Record<
        string,
        { sourceId: string; line: number; quote: string }
      > = {};
      function walk(value: unknown, path: string) {
        if (Array.isArray(value))
          value.forEach((v, i) => walk(v, `${path}.${i}`));
        else if (value !== null && typeof value === "object")
          Object.entries(value).forEach(([k, v]) =>
            walk(v, path ? `${path}.${k}` : k),
          );
        else
          citations[path] = {
            sourceId: "S1",
            line: index + 1,
            quote: lines[index]!,
          };
      }
      walk(fact, "");
      return { ...fact, citations };
    }),
  };
}
