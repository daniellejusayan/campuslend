import { ApiError } from "./http";

export type BookingRow = {
  id: string;
  equipment_id: string;
  borrower_name: string;
  start_at: string;
  end_at: string;
  purpose: string;
  created_at: string;
  updated_at: string;
};

/** DB column names (snake_case) -> API field names (camelCase). */
export const toApi = (r: BookingRow) => ({
  id: r.id,
  equipmentId: r.equipment_id,
  borrowerName: r.borrower_name,
  startAt: r.start_at,
  endAt: r.end_at,
  purpose: r.purpose,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const getBooking = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookingRow>();

/**
 * The single place that enforces the business rules for a booking's
 * equipment + time range. Used by BOTH POST and PATCH so they cannot drift apart.
 *   400  endAt is not after startAt
 *   404  equipment does not exist
 *   409  another booking of the same equipment overlaps
 * `excludeId` is the booking being updated, so it is never compared with itself.
 */
export async function assertBookable(
  db: D1Database,
  slot: { equipmentId: string; startAt: string; endAt: string },
  excludeId: string | null,
) {
  if (slot.endAt <= slot.startAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "endAt: must be after startAt");
  }

  const eq = await db.prepare("SELECT id FROM equipment WHERE id = ?").bind(slot.equipmentId).first();
  if (!eq) throw new ApiError(404, "EQUIPMENT_NOT_FOUND", `Equipment '${slot.equipmentId}' does not exist`);

  // Overlap: existing.start < requested.end AND existing.end > requested.start
  const clash = await db
    .prepare(
      `SELECT id FROM bookings
       WHERE equipment_id = ?1
         AND start_at < ?2
         AND end_at   > ?3
         AND (?4 IS NULL OR id <> ?4)
       LIMIT 1`,
    )
    .bind(slot.equipmentId, slot.endAt, slot.startAt, excludeId)
    .first();
  if (clash) {
    throw new ApiError(409, "BOOKING_CONFLICT", "That equipment is already booked for an overlapping time");
  }
}
