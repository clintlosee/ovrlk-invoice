import { base64 } from "@better-auth/utils/base64";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { z } from "zod";

// Matches better-auth's TWO_FACTOR_COOKIE_NAME. The dist path is not a public export.
const TWO_FACTOR_COOKIE_NAME = "two_factor";

const challengeSeconds = 5 * 60;

async function userFromTwoFactorCookie(ctx: {
  context: {
    createAuthCookie: (name: string) => {
      name: string;
      attributes: Record<string, unknown>;
    };
    secret: string;
    internalAdapter: {
      findVerificationValue: (
        identifier: string,
      ) => Promise<{ value: string } | null>;
      findUserById: (
        id: string,
      ) => Promise<{ id: string; email: string; name: string } | null>;
    };
  };
  getSignedCookie: (
    name: string,
    secret: string,
  ) => Promise<string | false | null>;
}) {
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
  const signed = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!signed)
    throw new APIError("UNAUTHORIZED", {
      message: "Sign in with your password first",
    });
  const verification =
    await ctx.context.internalAdapter.findVerificationValue(signed);
  if (!verification)
    throw new APIError("UNAUTHORIZED", {
      message: "Sign in with your password first",
    });
  const user = await ctx.context.internalAdapter.findUserById(
    verification.value,
  );
  if (!user)
    throw new APIError("UNAUTHORIZED", {
      message: "Sign in with your password first",
    });
  return { user, cookie, signed };
}

function relyingParty(baseURL: string | undefined) {
  if (!baseURL)
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "BETTER_AUTH_URL is not set",
    });
  const url = new URL(baseURL);
  return { origin: url.origin, rpID: url.hostname };
}

const passkeyTwoFactorOptions = createAuthEndpoint(
  "/two-factor/passkey-options",
  { method: "POST", body: z.object({}).optional() },
  async (ctx) => {
    const { user } = await userFromTwoFactorCookie(ctx);
    const passkeys = await ctx.context.adapter.findMany<{
      credentialID: string;
      transports?: string | null;
    }>({
      model: "passkey",
      where: [{ field: "userId", value: user.id }],
    });
    if (passkeys.length === 0) {
      throw new APIError("BAD_REQUEST", {
        message: "No passkey is registered",
      });
    }
    const { rpID } = relyingParty(
      typeof ctx.context.options.baseURL === "string"
        ? ctx.context.options.baseURL
        : undefined,
    );
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: passkeys.map((row) => ({
        id: row.credentialID,
        transports: row.transports?.split(","),
      })),
    });
    const token = generateRandomString(32);
    const challengeCookie = ctx.context.createAuthCookie("passkey_2fa", {
      maxAge: challengeSeconds,
    });
    await ctx.setSignedCookie(challengeCookie.name, token, ctx.context.secret, {
      ...challengeCookie.attributes,
      maxAge: challengeSeconds,
    });
    await ctx.context.internalAdapter.createVerificationValue({
      identifier: token,
      value: JSON.stringify({ userId: user.id, challenge: options.challenge }),
      expiresAt: new Date(Date.now() + challengeSeconds * 1000),
    });
    return ctx.json(options);
  },
);

const passkeyTwoFactorVerify = createAuthEndpoint(
  "/two-factor/passkey-verify",
  {
    method: "POST",
    body: z.object({ response: z.custom<AuthenticationResponseJSON>() }),
  },
  async (ctx) => {
    const { user, cookie, signed } = await userFromTwoFactorCookie(ctx);
    const challengeCookie = ctx.context.createAuthCookie("passkey_2fa");
    const challengeToken = await ctx.getSignedCookie(
      challengeCookie.name,
      ctx.context.secret,
    );
    if (!challengeToken)
      throw new APIError("BAD_REQUEST", {
        message: "Passkey challenge expired",
      });
    const stored =
      await ctx.context.internalAdapter.consumeVerificationValue(
        challengeToken,
      );
    if (!stored)
      throw new APIError("BAD_REQUEST", {
        message: "Passkey challenge expired",
      });
    const parsed = JSON.parse(stored.value) as {
      userId?: string;
      challenge?: string;
    };
    if (parsed.userId !== user.id || !parsed.challenge) {
      throw new APIError("UNAUTHORIZED", {
        message: "Passkey challenge does not match this sign-in",
      });
    }
    const assertion = ctx.body.response;
    const passkey = await ctx.context.adapter.findOne<{
      id: string;
      userId: string;
      credentialID: string;
      publicKey: string;
      counter: number;
      transports?: string | null;
    }>({
      model: "passkey",
      where: [{ field: "credentialID", value: assertion.id }],
    });
    if (!passkey || passkey.userId !== user.id) {
      throw new APIError("UNAUTHORIZED", {
        message: "Passkey does not belong to this Owner",
      });
    }
    const { origin, rpID } = relyingParty(
      typeof ctx.context.options.baseURL === "string"
        ? ctx.context.options.baseURL
        : undefined,
    );
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: parsed.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: passkey.credentialID,
          publicKey: base64.decode(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports?.split(","),
        },
      });
    } catch {
      throw new APIError("UNAUTHORIZED", {
        message: "Passkey verification failed",
      });
    }
    if (!verification.verified) {
      throw new APIError("UNAUTHORIZED", {
        message: "Passkey verification failed",
      });
    }
    await ctx.context.adapter.update({
      model: "passkey",
      where: [{ field: "id", value: passkey.id }],
      update: { counter: verification.authenticationInfo.newCounter },
    });
    const consumed =
      await ctx.context.internalAdapter.consumeVerificationValue(signed);
    if (!consumed || consumed.value !== user.id) {
      throw new APIError("UNAUTHORIZED", {
        message: "Sign in with your password first",
      });
    }
    const session = await ctx.context.internalAdapter.createSession(user.id);
    if (!session)
      throw new APIError("INTERNAL_SERVER_ERROR", {
        message: "Could not start a session",
      });
    const freshUser = await ctx.context.internalAdapter.findUserById(user.id);
    if (!freshUser)
      throw new APIError("INTERNAL_SERVER_ERROR", {
        message: "Could not start a session",
      });
    await setSessionCookie(ctx, { session, user: freshUser });
    expireCookie(ctx, cookie);
    expireCookie(ctx, challengeCookie);
    return ctx.json({
      status: true,
      user: { id: freshUser.id, email: freshUser.email },
    });
  },
);

export function passkeySecondFactor() {
  return {
    id: "passkey-second-factor",
    endpoints: {
      passkeyTwoFactorOptions,
      passkeyTwoFactorVerify,
    },
  };
}
