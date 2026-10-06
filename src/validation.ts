import { z } from "zod";

// Strict ISO-8601 with an explicit timezone, e.g. 2026-10-20T09:00:00Z or ...+07:00.
// Strings without a timezone are rejected: "09:00" would otherwise mean different
// instants depending on where the code runs.
const ISO_WITH_TZ =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parses to a normalized UTC string (always 24 chars), so text comparison == time comparison. */
const timestamp = z.string().transform((value, ctx) => {
  const m = ISO_WITH_TZ.exec(value);
  const bad = (msg: string) => {
    ctx.addIssue({ code: "custom", message: msg });
    return z.NEVER;
  };
  if (!m) return bad("must be an ISO-8601 timestamp with timezone, e.g. 2026-10-20T09:00:00.000Z");
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || s > 59) {
    return bad("is not a real calendar date/time");
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return bad("is not a valid timestamp");
  return new Date(ms).toISOString();
});

const BookingFields = {
  equipmentId: z.string().trim().min(1).max(64),
  borrowerName: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(500),
  startAt: timestamp,
  endAt: timestamp,
};

/** POST: every field required. Unknown fields are ignored (not stored). */
export const CreateBooking = z.object(BookingFields);

/** PATCH: every field optional, but at least one must be present. */
export const PatchBooking = z
  .object(BookingFields)
  .partial()
  .refine((o) => Object.values(o).some((v) => v !== undefined), {
    message: "provide at least one field to update",
  });

export type CreateBookingInput = z.infer<typeof CreateBooking>;

/** Turns the first zod issue into a human message such as "borrowerName: Too small ...". */
export const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
};
