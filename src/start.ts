import { createSerializationAdapter } from "@tanstack/react-router";
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";
import { migrateDb } from "./db/client";
import { isProduction } from "./lib/config";
import { clientIp, consumePublicRateLimit } from "./server/rate-limit";
import { securityHeaders } from "./server/security-headers";

const publicError = createSerializationAdapter({
  key: "ovrlk/public-error",
  test: (value): value is Error => value instanceof Error,
  toSerializable: () => null,
  fromSerializable: () => new Error("The request could not be completed."),
});

let migrating: Promise<void> | undefined;

const gate = createMiddleware().server(async ({ next, pathname, request }) => {
  migrating ??= migrateDb();
  await migrating;
  if (pathname.startsWith("/p/")) {
    const limit = await consumePublicRateLimit(clientIp(request));
    if (!limit.allowed) {
      const headers = new Headers(
        securityHeaders({ dev: !isProduction(), https: isProduction() }),
      );
      headers.set("content-type", "text/plain; charset=utf-8");
      headers.set("retry-after", String(Math.ceil(limit.retryAfterMs / 1000)));
      headers.set("cache-control", "no-store");
      return new Response("Too many requests", { status: 429, headers });
    }
  }
  const result = await next();
  const headers = new Headers(result.response.headers);
  for (const [key, value] of Object.entries(
    securityHeaders({ dev: !isProduction(), https: isProduction() }),
  )) {
    headers.set(key, value);
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
