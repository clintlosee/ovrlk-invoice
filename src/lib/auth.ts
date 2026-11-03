import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { provisionOwner } from "../server/provision";
import { appUrl, authSecret, isProduction, signUpsOpen } from "./config";
import { sendOtpEmail } from "./email";
import { passkeySecondFactor } from "./passkey-second-factor";

const blockedPasskeySignIn = new Set([
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
]);

export function createAuth() {
  const url = appUrl();
  return betterAuth({
    appName: "ovrlk-invoice",
    baseURL: url,
    secret: authSecret(),
    trustedOrigins: [url],
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Closed or open is decided per request in the hook below, from ALLOW_SIGN_UP.
      disableSignUp: false,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: isProduction(),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction(),
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 300, max: 10 },
        "/sign-up/email": { window: 300, max: 5 },
      },
    },
    user: {
      additionalFields: {},
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!signUpsOpen()) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-up is closed.",
              });
            }
            return { data: { ...user, twoFactorEnabled: true } };
          },
          after: async (user) => {
            await provisionOwner({
              userId: user.id,
              businessName: user.name,
              timeZone: "America/Denver",
            });
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email" && !signUpsOpen()) {
          throw new APIError("FORBIDDEN", { message: "Sign-up is closed." });
        }
        if (blockedPasskeySignIn.has(ctx.path)) {
          throw new APIError("FORBIDDEN", {
            message:
              "Passkeys are a second factor. Sign in with email and password first.",
          });
        }
        if (ctx.path === "/two-factor/disable") {
          throw new APIError("FORBIDDEN", {
            message: "Email codes stay on for every Owner.",
          });
        }
      }),
    },
    plugins: [
      twoFactor({
        issuer: "ovrlk-invoice",
        otpOptions: {
          period: 10,
          storeOTP: "encrypted",
          async sendOTP({ user, otp }) {
            await sendOtpEmail(user.email, otp);
          },
        },
      }),
      passkey({
        rpName: "ovrlk-invoice",
        rpID: new URL(url).hostname,
        origin: url,
      }),
      passkeySecondFactor(),
      tanstackStartCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

export function getAuth(): Auth {
  if (!auth) auth = createAuth();
  return auth;
}
