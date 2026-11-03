import { createSerializationAdapter } from "@tanstack/react-router";
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";
import { migrateDb } from "./db/client";
import { isProduction } from "./lib/config";
import {
  clientIp,
  consumePublicRateLimit,
  runPublicRateLimitCounted,
} from "./server/rate-limit";
import {
  publicDocumentHeaders,
  securityHeaders,
} from "./server/security-headers";

const publicError = createSerializationAdapter({
  key: "ovrlk/public-error",
  test: (value): value is Error => value instanceof Error,
  toSerializable: () => null,
  fromSerializable: () => new Error("The request could not be completed."),
});

let migrating: Promise<void> | undefined;

const gate = createMiddleware().server(async ({ next, pathname, request }) => {
  // Render's pre-deploy command is the production migration path.
  // This still runs so `pnpm dev` and other setups migrate on first request.
  migrating ??= migrateDb();
  await migrating;
  const limited = pathname.startsWith("/p/");
  if (limited) {
    const limit = await consumePublicRateLimit(clientIp(request));
    if (!limit.allowed) {
      const headers = new Headers({
        ...securityHeaders({ dev: !isProduction(), https: isProduction() }),
        ...publicDocumentHeaders(),
      });
      headers.set("content-type", "text/plain; charset=utf-8");
      headers.set("retry-after", String(Math.ceil(limit.retryAfterMs / 1000)));
      return new Response("Too many requests", { status: 429, headers });
    }
  }
  const result = limited
    ? await runPublicRateLimitCounted(() => next())
    : await next();
  const headers = new Headers(result.response.headers);
  for (const [key, value] of Object.entries(
    securityHeaders({ dev: !isProduction(), https: isProduction() }),
  )) {
    headers.set(key, value);
  }
  if (limited) {
    for (const [key, value] of Object.entries(publicDocumentHeaders())) {
      headers.set(key, value);
    }
  }
  return {
    ...result,
    response: new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    }),
  };
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  serializationAdapters: [publicError],
  requestMiddleware: [gate, csrfMiddleware],
}));
