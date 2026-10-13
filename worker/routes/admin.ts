import { Hono } from "hono";
import { adminOverview } from "../lib/admin-overview";
import { requireInstancePermission, type AppEnv } from "../lib/auth";

/** Instance administration pages that are not about users or settings. */
export const adminRoutes = new Hono<AppEnv>();

/** GET /api/admin/overview?days=30 (1-90): one D1 batch of aggregate queries. */
adminRoutes.get("/admin/overview", requireInstancePermission("instance.overview.view"), async (c) => {
  c.header("cache-control", "no-store");
  return c.json(await adminOverview(c.env, Number(c.req.query("days") ?? 30)));
});
