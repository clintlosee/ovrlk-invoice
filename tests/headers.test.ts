import { describe, expect, it } from "vitest";
import {
  publicDocumentHeaders,
  securityHeaders,
} from "../src/server/security-headers";

describe("security headers", () => {
  it("sets CSP, nosniff, referrer policy, and frame-ancestors", () => {
    const headers = securityHeaders({ dev: false, https: true });
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).toMatch(
      /(?:^|; )script-src 'self'(?:;|$)/,
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  it("keeps public Invoice Links out of caches, indexes, and referrers", () => {
    const headers = publicDocumentHeaders();
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["cache-control"]).toContain("no-store");
  });

  it("omits HSTS off HTTPS and relaxes scripts in dev", () => {
    const headers = securityHeaders({ dev: true, https: false });
    expect(headers["strict-transport-security"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain("unsafe-inline");
  });
});
