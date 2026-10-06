import { Hono } from "hono";
import { ok } from "../http";
import type { Env } from "../index";

export const equipment = new Hono<Env>();

equipment.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, name, location FROM equipment ORDER BY id").all();
  return ok(c, results);
});
