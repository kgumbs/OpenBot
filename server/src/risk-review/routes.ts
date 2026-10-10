import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppVariables } from "../auth/guards";
import { requireAdmin } from "../auth/guards";
import { createRiskReviewStore, reviewFields, ReviewError } from "./store";
import type { AuditStore } from "../audit";
import { recordAuditEvent } from "../audit";
export function createRiskReviewRoutes(
  directory: string,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  auditStore?: AuditStore,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  const store = createRiskReviewStore(directory);
  routes.use("*", requireUser, async (c, next) => {
    const denied = requireAdmin(c);
    if (denied) return denied;
    if (process.env.OPENBOT_LOCAL_SUBSCRIPTION !== "claude")
      return c.json({ error: "Local review is not enabled." }, 404);
    await next();
  });
  routes.use("*", bodyLimit({ maxSize: 256_000 }));
  routes.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof ReviewError
            ? error.message
            : error instanceof z.ZodError
              ? "Invalid evidence draft."
              : "Review could not complete. Check the source support for every field.",
      },
      error instanceof ReviewError ? (error.status as 400 | 404 | 409) : 400,
    ),
  );
  const view = (item: ReturnType<typeof store.get>) => ({
    ...item,
    fields: reviewFields(item.draft),
    notice:
      "Rule comparison for reviewed facts. This is not payment approval or compliance certification.",
  });
  const audit = async (
    actorId: string,
    caseId: string,
    operation: string,
    version: number,
  ) => {
    if (auditStore)
      await recordAuditEvent(auditStore, {
        eventType: "configuration.changed",
        targetType: "risk_review",
        targetId: caseId,
        actorUserId: actorId,
        payload: { change: "risk_evidence_review", operation, version },
      });
  };
  routes.get("/", (c) => c.json({ cases: store.list(c.var.actor.id) }));
  routes.post("/", async (c) => {
    const item = store.create(c.var.actor.id, await c.req.json());
    await audit(c.var.actor.id, item.id, "proposed", item.version);
    return c.json(view(item), 201);
  });
  routes.get("/:id", (c) =>
    c.json(view(store.get(c.var.actor.id, c.req.param("id")))),
  );
  routes.put("/:id", async (c) => {
    const input = z
      .object({ version: z.number().int().min(1), draft: z.unknown() })
      .strict()
      .parse(await c.req.json());
    const item = store.replace(
      c.var.actor.id,
      c.req.param("id"),
      input.version,
      input.draft,
    );
    await audit(c.var.actor.id, item.id, "revised", item.version);
    return c.json(view(item));
  });
  routes.post("/:id/decisions", async (c) => {
    const input = z
      .object({
        version: z.number().int().min(1),
        field: z.string().min(1),
        decision: z.enum(["accept", "unknown", "reject"]),
      })
      .strict()
      .parse(await c.req.json());
    const item = store.decide(
      c.var.actor.id,
      c.req.param("id"),
      input.version,
      input.field,
      input.decision,
    );
    await audit(
      c.var.actor.id,
      item.id,
      `field:${input.field}:${input.decision}`,
      item.version,
    );
    return c.json(view(item));
  });
  routes.post("/:id/compare", async (c) => {
    const input = z
      .object({ version: z.number().int().min(1) })
      .strict()
      .parse(await c.req.json());
    const item = store.compare(
      c.var.actor.id,
      c.req.param("id"),
      input.version,
    );
    await audit(c.var.actor.id, item.id, "compared", item.version);
    return c.json(view(item));
  });
  return routes;
}
