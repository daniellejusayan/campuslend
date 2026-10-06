import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

type Bindings = { DB: D1Database };
const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", cors());

const BookingInput = z.object({
  equipmentId: z.string().min(1),
  borrowerName: z.string().trim().min(1).max(100),
  startAt: z.string().refine((s) => !isNaN(Date.parse(s)), "invalid date"),
  endAt: z.string().refine((s) => !isNaN(Date.parse(s)), "invalid date"),
  purpose: z.string().trim().min(1).max(500),
});

const toApi = (r: any) => ({
  id: r.id,
  equipmentId: r.equipment_id,
  borrowerName: r.borrower_name,
  startAt: r.start_at,
  endAt: r.end_at,
  purpose: r.purpose,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fail = (c: any, status: number, code: string, message: string) =>
  c.json({ success: false, error: { code, message } }, status);

app.get("/api/equipment", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, name, location FROM equipment ORDER BY id").all();
  return c.json({ success: true, data: results });
});

app.get("/api/bookings", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM bookings ORDER BY start_at").all();
  return c.json({ success: true, data: results.map(toApi) });
});

app.get("/api/bookings/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(c.req.param("id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Booking not found");
  return c.json({ success: true, data: toApi(row) });
});

app.post("/api/bookings", async (c) => {
  const body = await c.req.json();
  const parsed = BookingInput.safeParse(body);
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  const b = parsed.data;
  const start = new Date(b.startAt).toISOString();
  const end = new Date(b.endAt).toISOString();
  if (end <= start) return fail(c, 400, "VALIDATION_ERROR", "endAt must be after startAt");

  const eq = await c.env.DB.prepare("SELECT id FROM equipment WHERE id = ?").bind(b.equipmentId).first();
  if (!eq) return fail(c, 404, "EQUIPMENT_NOT_FOUND", "Equipment not found");

  const clash = await c.env.DB
    .prepare("SELECT id FROM bookings WHERE equipment_id = ? AND start_at < ? AND end_at > ?")
    .bind(b.equipmentId, end, start)
    .first();
  if (clash) return fail(c, 409, "BOOKING_CONFLICT", "Equipment already booked for that time");

  const id = "bk-" + crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO bookings (id, equipment_id, borrower_name, start_at, end_at, purpose) VALUES (?,?,?,?,?,?)")
    .bind(id, b.equipmentId, b.borrowerName, start, end, b.purpose)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
  return c.json({ success: true, data: toApi(row) }, 201);
});

app.patch("/api/bookings/:id", async (c) => {
  const id = c.req.param("id");
  const existing: any = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
  if (!existing) return fail(c, 404, "NOT_FOUND", "Booking not found");

  const body = await c.req.json();
  const parsed = BookingInput.partial().safeParse(body);
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  const p = parsed.data;

  const next = {
    equipmentId: p.equipmentId ?? existing.equipment_id,
    borrowerName: p.borrowerName ?? existing.borrower_name,
    startAt: p.startAt ? new Date(p.startAt).toISOString() : existing.start_at,
    endAt: p.endAt ? new Date(p.endAt).toISOString() : existing.end_at,
    purpose: p.purpose ?? existing.purpose,
  };

  await c.env.DB
    .prepare("UPDATE bookings SET equipment_id=?, borrower_name=?, start_at=?, end_at=?, purpose=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
    .bind(next.equipmentId, next.borrowerName, next.startAt, next.endAt, next.purpose, id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
  return c.json({ success: true, data: toApi(row) });
});

app.delete("/api/bookings/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(c.req.param("id")).run();
  if (!r.meta.changes) return fail(c, 404, "NOT_FOUND", "Booking not found");
  return c.body(null, 204);
});

export default app;
