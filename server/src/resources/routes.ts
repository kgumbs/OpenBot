import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import type { BotAccessCheck } from "../agents/profile-policy";
import type { ResourceService } from "./service";
export function createResourceRoutes(
  service: ResourceService,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  canUseBot: BotAccessCheck,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser, async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });
  routes.get("/", async (context) => context.json(await service.snapshot()));
  routes.get("/:botId", async (context) => {
    const botId = context.req.param("botId");
    if (!(await canUseBot(context.var.actor, botId)))
      return context.json({ error: "Bot not found." }, 404);
    return context.json(await service.snapshot(botId));
  });
  return routes;
}
