import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getDb } from "../db/client";
import { getAuth } from "../lib/auth";
import { signUpsOpen } from "../lib/config";
import { renameBusiness } from "./provision";
import { clientIp, consumeRateLimit } from "./rate-limit";

export type RegisterInput = {
  name: string;
  businessName: string;
  email: string;
  password: string;
  timeZone: string;
};

export type RegisterResult = { ok: true } | { ok: false; message: string };

export async function registerOwner(
  input: RegisterInput,
  headers: Headers,
  ip: string,
): Promise<RegisterResult> {
  const limit = await consumeRateLimit(getDb(), `auth:${ip}`, {
    windowMs: 5 * 60 * 1000,
    max: 5,
  });
  if (!limit.allowed)
    return { ok: false, message: "Too many requests. Try again later." };
  if (!signUpsOpen()) return { ok: false, message: "Sign-up is closed." };

  const name = input.name.trim();
  const businessName = input.businessName.trim();
  const email = input.email.trim().toLowerCase();
  const timeZone = input.timeZone.trim() || "America/Denver";
  if (
    !name ||
    !businessName ||
    !email.includes("@") ||
    input.password.length < 12
  ) {
    return {
      ok: false,
      message:
        "Use your name, a Business name, a valid email, and a password of at least 12 characters.",
    };
  }

  try {
    const created = await getAuth().api.signUpEmail({
      body: { name, email, password: input.password },
      headers,
    });
    if (!created?.user?.id)
      return { ok: false, message: "Could not create an account." };
    await renameBusiness(created.user.id, businessName, timeZone);
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not create an account." };
  }
}

export const getSignUpOpen = createServerFn({ method: "GET" }).handler(() => {
  return { open: signUpsOpen() };
});

export const registerOwnerFn = createServerFn({ method: "POST" })
  .validator((data: RegisterInput) => data)
  .handler(async ({ data }) => {
    const request = getRequest();
    return registerOwner(data, request.headers, clientIp(request));
  });
