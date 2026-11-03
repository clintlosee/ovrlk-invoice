import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        const url = new URL(window.location.href);
        url.pathname = "/sign-in";
        url.searchParams.set("step", "code");
        window.location.assign(url.toString());
      },
    }),
    passkeyClient(),
  ],
});
