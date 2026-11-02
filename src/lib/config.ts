export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function signUpsOpen(): boolean {
  return process.env.ALLOW_SIGN_UP === "true";
}

export function appUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  }
  return secret;
}

export function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error("Time zone must be a valid IANA name");
  }
  return timeZone;
}
