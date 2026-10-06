import type { Context } from "hono";

/** Thrown anywhere in a handler; app.onError turns it into the JSON error envelope. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 500,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ok = (c: Context, data: unknown, status: 200 | 201 = 200) =>
  c.json({ success: true, data }, status);

/**
 * Required error format: {"error": "<message>"}. `code` is an extra machine-readable field
 * (e.g. NOT_FOUND vs EQUIPMENT_NOT_FOUND, both 404) so clients and tests need not parse text.
 */
export const errorBody = (code: string, message: string) => ({
  error: message,
  code,
});
