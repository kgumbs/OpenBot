import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  compareApprovalFacts,
  type Fact,
  type Finding,
} from "../../../shared/approval-facts";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
const nullableBool = z.boolean().nullable();
const citation = z
  .object({
    sourceId: id,
    line: z.number().int().min(1),
    quote: z.string().min(1).max(1200),
  })
  .strict();
const base = { id, citations: z.record(z.string(), citation) };
export const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    sources: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(200),
            text: z.string().min(1).max(60_000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    facts: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              ...base,
              kind: z.literal("policy"),
              currency: z
                .string()
                .regex(/^[A-Z]{3}$/)
                .nullable(),
              thresholdMinorUnits: money.nullable(),
              operator: z.literal("above"),
              requiredApprovers: z.number().int().min(1).max(100).nullable(),
              effectiveDate: date.nullable(),
              appliesToPayment: nullableBool,
            })
            .strict(),
          z
            .object({
              ...base,
              kind: z.literal("payment"),
              currency: z
                .string()
                .regex(/^[A-Z]{3}$/)
                .nullable(),
              amountMinorUnits: money.nullable(),
              policyId: id.nullable(),
              date: date.nullable(),
            })
            .strict(),
          z
            .object({
              ...base,
              kind: z.literal("approval"),
              paymentId: id.nullable(),
              authoritative: nullableBool,
              complete: nullableBool,
              approvers: z
                .array(z.object({ id, authorized: nullableBool }).strict())
                .max(100),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(12),
  })
  .strict();
export type RiskDraft = z.infer<typeof draftSchema>;
export type Decision = "accept" | "unknown" | "reject";
type Field = {
  key: string;
  value: unknown;
  citation: z.infer<typeof citation> | undefined;
};
export function reviewFields(draft: RiskDraft): Field[] {
  const rows: Field[] = [];
  function walk(
    value: unknown,
    path: string,
    citations: Record<string, z.infer<typeof citation>>,
    prefix: string,
  ) {
    if (Array.isArray(value)) {
      if (!value.length)
        rows.push({
          key: `${prefix}.${path}`,
          value: [],
          citation: citations[path],
        });
      else value.forEach((v, i) => walk(v, `${path}.${i}`, citations, prefix));
    } else if (value !== null && typeof value === "object")
      for (const [k, v] of Object.entries(value))
        walk(v, path ? `${path}.${k}` : k, citations, prefix);
    else
      rows.push({ key: `${prefix}.${path}`, value, citation: citations[path] });
  }
  for (const fact of draft.facts) {
    const { citations, ...values } = fact;
    walk(values, "", citations, fact.id);
  }
  return rows;
}
export function validateDraft(value: unknown) {
  const draft = draftSchema.parse(value);
  for (const group of [draft.sources, draft.facts])
    if (new Set(group.map((x) => x.id)).size !== group.length)
      throw new Error("Duplicate source or fact identities.");
  for (const field of reviewFields(draft)) {
    const ref = field.citation;
    const source = draft.sources.find((s) => s.id === ref?.sourceId);
    if (
      !ref ||
      !source ||
      !source.text.split(/\r?\n/)[ref.line - 1]?.includes(ref.quote)
    )
      throw new Error(`Missing or changed source support for ${field.key}.`);
  }
  return draft;
}
const hash = (draft: RiskDraft) =>
  createHash("sha256").update(JSON.stringify(draft)).digest("hex");
type Snapshot = {
  draft: RiskDraft;
  hash: string;
  finding: Finding;
  reviewerId: string;
  reviewedAt: string;
  version: number;
};
export type RiskCase = {
  id: string;
  ownerId: string;
  version: number;
  state: "proposed" | "in_review" | "needs_evidence" | "reviewed";
  draft: RiskDraft;
  hash: string;
  decisions: Record<
    string,
    { decision: Decision; reviewerId: string; at: string }
  >;
  finding?: Finding;
  reviewedAt?: string;
  history: Snapshot[];
};
export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function createRiskReviewStore(directory: string) {
  const filename = (caseId: string) => {
    if (!/^[a-f0-9-]{36}$/.test(caseId))
      throw new ReviewError("Review not found.", 404);
    return join(directory, `${caseId}.json`);
  };
  const save = (item: RiskCase) => {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = filename(item.id);
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(item), { mode: 0o600 });
    renameSync(temporary, file);
    return structuredClone(item);
  };
  const get = (actorId: string, caseId: string) => {
    let item: RiskCase;
    try {
      item = JSON.parse(readFileSync(filename(caseId), "utf8"));
    } catch {
      throw new ReviewError("Review not found.", 404);
    }
    if (item.ownerId !== actorId)
      throw new ReviewError("Review not found.", 404);
    if (hash(item.draft) !== item.hash)
      throw new ReviewError(
        "Evidence changed. Create a new draft before reviewing.",
        409,
      );
    return item;
  };
  const writable = (actorId: string, caseId: string, version: number) => {
    const item = get(actorId, caseId);
    if (item.version !== version)
      throw new ReviewError("Review changed. Reload before continuing.", 409);
    return item;
  };
  return {
    list(actorId: string) {
      try {
        return readdirSync(directory)
          .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
          .map((name) => {
            try {
              const item = get(actorId, name.slice(0, -5));
              return {
                id: item.id,
                title: item.draft.title,
                state: item.state,
                version: item.version,
              };
            } catch {
              return null;
            }
          })
          .filter((x) => x !== null);
      } catch {
        return [];
      }
    },
    get,
    create(actorId: string, value: unknown) {
      const draft = validateDraft(value);
      return save({
        id: randomUUID(),
        ownerId: actorId,
        version: 1,
        state: "proposed",
        draft,
        hash: hash(draft),
        decisions: {},
        history: [],
      });
    },
    replace(actorId: string, caseId: string, version: number, value: unknown) {
      const item = writable(actorId, caseId, version);
      const draft = validateDraft(value);
      if (item.history.length >= 50)
        throw new ReviewError(
          "Start a new case; the history limit is reached.",
        );
      if (item.finding)
        item.history.push({
          draft: item.draft,
          hash: item.hash,
          finding: item.finding,
          reviewerId: actorId,
          reviewedAt: item.reviewedAt!,
          version: item.version,
        });
      return save({
        ...item,
        version: item.version + 1,
        state: "proposed",
        draft,
        hash: hash(draft),
        decisions: {},
        finding: undefined,
        reviewedAt: undefined,
      });
    },
    decide(
      actorId: string,
      caseId: string,
      version: number,
      key: string,
      decision: Decision,
    ) {
      const item = writable(actorId, caseId, version);
      if (item.state === "reviewed")
        throw new ReviewError(
          "Reviewed snapshots are immutable. Replace the draft to start a new review.",
          409,
        );
      const field = reviewFields(item.draft).find((f) => f.key === key);
      if (!field || !["accept", "unknown", "reject"].includes(decision))
        throw new ReviewError("Invalid review decision.");
      if (decision === "accept" && field.value === null)
        throw new ReviewError(
          "Resolve this unknown value in a revised draft first.",
        );
      item.decisions[key] = {
        decision,
        reviewerId: actorId,
        at: new Date().toISOString(),
      };
      item.version++;
      item.state = Object.values(item.decisions).some(
        (d) => d.decision !== "accept",
      )
        ? "needs_evidence"
        : "in_review";
      return save(item);
    },
    compare(actorId: string, caseId: string, version: number) {
      const item = writable(actorId, caseId, version);
      if (item.state === "reviewed") return item;
      const draft = validateDraft(item.draft);
      if (
        reviewFields(draft).some(
          (f) => item.decisions[f.key]?.decision !== "accept",
        )
      )
        throw new ReviewError(
          "Every required field needs explicit human acceptance before comparison.",
          409,
        );
      const policies = draft.facts.filter((f) => f.kind === "policy");
      const payments = draft.facts.filter((f) => f.kind === "payment");
      const records = draft.facts.filter((f) => f.kind === "approval");
      if (policies.length !== 1 || payments.length !== 1 || !records.length)
        throw new ReviewError(
          "Supply one policy, one payment and at least one approval record.",
        );
      const policy = policies[0]!;
      const payment = payments[0]!;
      if (
        policy.effectiveDate === null ||
        payment.date === null ||
        policy.thresholdMinorUnits === null ||
        policy.requiredApprovers === null ||
        payment.amountMinorUnits === null ||
        policy.currency === null ||
        payment.currency === null
      )
        throw new ReviewError(
          "Required policy or payment values remain unknown.",
        );
      if (
        policy.appliesToPayment !== true ||
        payment.policyId !== policy.id ||
        policy.currency !== payment.currency ||
        policy.effectiveDate > payment.date
      )
        throw new ReviewError(
          "Policy scope, effective date, currency or payment references do not match.",
        );
      if (
        records.some(
          (r) =>
            r.paymentId !== payment.id ||
            r.authoritative === null ||
            r.complete === null ||
            r.approvers.some(
              (a) =>
                a.authorized === null ||
                new Set(r.approvers.map((a) => a.id)).size !==
                  r.approvers.length,
            ),
        )
      )
        throw new ReviewError(
          "Approval references, distinct identities or reviewed authority remain unresolved.",
        );
      const facts: Fact[] = [
        {
          id: policy.id,
          kind: "policy",
          threshold: policy.thresholdMinorUnits,
          requiredApprovers: policy.requiredApprovers,
        },
        { id: payment.id, kind: "payment", amount: payment.amountMinorUnits },
        ...records.map((r) => ({
          id: r.id,
          kind: "approval" as const,
          authoritative: r.authoritative!,
          complete: r.complete!,
          approvers: r.approvers.map((a) => ({
            id: a.id,
            authorized: a.authorized!,
          })),
        })),
      ];
      item.finding = compareApprovalFacts(facts);
      item.state = "reviewed";
      item.version++;
      item.reviewedAt = new Date().toISOString();
      return save(item);
    },
  };
}
