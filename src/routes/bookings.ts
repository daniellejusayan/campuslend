import { Hono } from "hono";
import { ApiError, ok } from "../http";
import { CreateBooking, PatchBooking, firstIssue } from "../validation";
import { assertBookable, getBooking, toApi, type BookingRow } from "../bookings-db";
import type { Env } from "../index";

export const bookings = new Hono<Env>();

/** Reads the JSON body; anything unparseable is the client's fault (400), not ours (500). */
const readJson = (c: { req: { json: () => Promise<unknown> } }) =>
  c.req.json().catch(() => {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  });

bookings.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM bookings ORDER BY start_at, id").all<BookingRow>();
  return ok(c, results.map(toApi));
});

bookings.get("/:id", async (c) => {
  const row = await getBooking(c.env.DB, c.req.param("id"));
  if (!row) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  return ok(c, toApi(row));
});

bookings.post("/", async (c) => {
  const parsed = CreateBooking.safeParse(await readJson(c));
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", firstIssue(parsed.error));
  const b = parsed.data;

  await assertBookable(c.env.DB, b, null);

  const id = `bk-${crypto.randomUUID()}`;
  await c.env.DB
    .prepare(
      `INSERT INTO bookings (id, equipment_id, borrower_name, start_at, end_at, purpose)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, b.equipmentId, b.borrowerName, b.startAt, b.endAt, b.purpose)
    .run();

  return ok(c, toApi((await getBooking(c.env.DB, id))!), 201);
});

bookings.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await getBooking(c.env.DB, id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Booking not found");

  const parsed = PatchBooking.safeParse(await readJson(c));
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", firstIssue(parsed.error));
  const patch = parsed.data;

  // Merge the patch over the stored booking, then validate the RESULT. Checking only
  // the fields the client sent would miss e.g. a new endAt that is before the old startAt.
  const next = {
    equipmentId: patch.equipmentId ?? existing.equipment_id,
    borrowerName: patch.borrowerName ?? existing.borrower_name,
    startAt: patch.startAt ?? existing.start_at,
    endAt: patch.endAt ?? existing.end_at,
    purpose: patch.purpose ?? existing.purpose,
  };

  await assertBookable(c.env.DB, next, id);

  await c.env.DB
    .prepare(
      `UPDATE bookings
       SET equipment_id = ?, borrower_name = ?, start_at = ?, end_at = ?, purpose = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    )
    .bind(next.equipmentId, next.borrowerName, next.startAt, next.endAt, next.purpose, id)
    .run();

  return ok(c, toApi((await getBooking(c.env.DB, id))!));
});

bookings.delete("/:id", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(c.req.param("id")).run();
  if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  return c.body(null, 204); // 204 = success with NO body
});
