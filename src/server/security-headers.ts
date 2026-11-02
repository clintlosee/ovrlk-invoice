export function securityHeaders(options: {
  dev: boolean;
  https: boolean;
}): Record<string, string> {
  const script = options.dev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self'";
  const connect = options.dev ? "connect-src 'self' ws:" : "connect-src 'self'";
  const csp = [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    connect,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers: Record<string, string> = {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
  };
  if (options.https) {
    headers["strict-transport-security"] =
      "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export function withSecurityHeaders(
  response: Response,
  options: { dev: boolean; https: boolean },
): Response {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  for (const [key, value] of Object.entries(securityHeaders(options))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
