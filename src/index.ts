import { Hono } from "hono";
import { cors } from "hono/cors";
import { ApiError, errorBody, ok } from "./http";
import { equipment } from "./routes/equipment";
import { bookings } from "./routes/bookings";

export type Env = { Bindings: { DB: D1Database; ALLOWED_ORIGINS: string } };

const app = new Hono<Env>();

// CORS: only origins listed in ALLOWED_ORIGINS get Access-Control-Allow-Origin.
// This is a browser rule, not authentication; curl and other servers ignore it.
app.use("/api/*", (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
  })(c, next);
});

app.route("/api/equipment", equipment);
app.route("/api/bookings", bookings);

// Index: opening the base URL in a browser shows what is available instead of a 404.
app.on("GET", ["/", "/api", "/api/"], (c) =>
  ok(c, {
    name: "CampusLend API",
    endpoints: [
      "GET /api/equipment",
      "GET /api/bookings",
      "GET /api/bookings/:id",
      "POST /api/bookings",
      "PATCH /api/bookings/:id",
      "DELETE /api/bookings/:id",
    ],
  }),
);

app.notFound((c) => c.json(errorBody("NOT_FOUND", "Route not found"), 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(errorBody(err.code, err.message), err.status);

  // Safety net behind the API-level check: the DB trigger refused an overlapping row
  // (e.g. two requests raced past the SELECT). Same answer as the normal check: 409.
  if (String(err.message).includes("booking overlap")) {
    return c.json(errorBody("BOOKING_CONFLICT", "That equipment is already booked for an overlapping time"), 409);
  }

  console.error("Unhandled error:", err); // full detail stays in the server log...
  return c.json(errorBody("INTERNAL_ERROR", "Something went wrong on the server"), 500); // ...not in the response
});

export default app;
