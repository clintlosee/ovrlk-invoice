import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import {
  consumePublicRateLimit,
  consumeRateLimit,
} from "../src/server/rate-limit";

describe("rate limit", () => {
  it("blocks the next request in the window and allows a later window", async () => {
    const db = getDb();
    const rule = { windowMs: 1_000, max: 2 };
    const key = "auth:rate-test";
    expect((await consumeRateLimit(db, key, rule, 0)).allowed).toBe(true);
    expect((await consumeRateLimit(db, key, rule, 10)).allowed).toBe(true);
    const blocked = await consumeRateLimit(db, key, rule, 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect((await consumeRateLimit(db, key, rule, 1_000)).allowed).toBe(true);
  });

  it("limits a future public route by IP", async () => {
    process.env.PUBLIC_RATE_LIMIT_MAX = "1";
    expect((await consumePublicRateLimit("public-test", 0)).allowed).toBe(true);
    expect((await consumePublicRateLimit("public-test", 10)).allowed).toBe(
      false,
    );
    expect((await consumePublicRateLimit("someone-else", 10)).allowed).toBe(
      true,
    );
    delete process.env.PUBLIC_RATE_LIMIT_MAX;
  });
});
