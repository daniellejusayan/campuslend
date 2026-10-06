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

export const errorBody = (code: string, message: string) => ({
  success: false as const,
  error: { code, message },
});
