import { startAuthentication } from "@simplewebauthn/browser";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) =>
    search.step === "code" ? { step: "code" as const } : {},
  component: SignInPage,
  headers: () => ({ "cache-control": "no-store" }),
});

function SignInPage() {
  const { step } = Route.useSearch();
  const showCode = step === "code";
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(false);
  const sentCode = useRef(false);

  const sendCode = useCallback(async () => {
    const sent = await authClient.twoFactor.sendOtp();
    if (sent.error)
      setMessage("Could not send a code. Request another in a moment.");
  }, []);

  useEffect(() => {
    if (!showCode || sentCode.current) return;
    sentCode.current = true;
    void sendCode();
    void fetch("/api/auth/two-factor/passkey-options", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((response) => setPasskeyReady(response.ok));
  }, [sendCode, showCode]);

  async function onPassword(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setMessage("Email or password is incorrect.");
      return;
    }
    if (
      result.data &&
      "twoFactorRedirect" in result.data &&
      result.data.twoFactorRedirect
    ) {
      await navigate({ to: "/sign-in", search: { step: "code" } });
    }
  }

  async function onCode(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await authClient.twoFactor.verifyOtp({ code });
    setPending(false);
    if (result.error) {
      setMessage("That code is not valid. Request a new one if it expired.");
      return;
    }
    await navigate({ to: "/app" });
  }

  async function onPasskey() {
    setPending(true);
    setMessage(null);
    const optionsResponse = await fetch(
      "/api/auth/two-factor/passkey-options",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    if (!optionsResponse.ok) {
      setPending(false);
      setMessage("No passkey is available for this sign-in.");
      return;
    }
    const optionsJSON = await optionsResponse.json();
    try {
      const assertion = await startAuthentication({ optionsJSON });
      const verified = await fetch("/api/auth/two-factor/passkey-verify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: assertion }),
      });
      setPending(false);
      if (!verified.ok) {
        setMessage("Passkey verification failed. Use the emailed code.");
        return;
      }
      await navigate({ to: "/app" });
    } catch {
      setPending(false);
      setMessage("Passkey verification failed. Use the emailed code.");
    }
  }

  return (
    <Shell>
      <Card>
        <h1 className="font-serif text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Email, password, then the code we send you.
        </p>
        {showCode ? (
          <form className="mt-6 space-y-4" onSubmit={onCode}>
            <div className="space-y-2">
              <Label htmlFor="code">Email code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            {message ? (
              <p className="text-sm text-destructive">{message}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                Sign in
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void sendCode()}
              >
                Send a new code
              </Button>
              {passkeyReady ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void onPasskey()}
                >
                  Use a passkey
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onPassword}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {message ? (
              <p className="text-sm text-destructive">{message}</p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}
      </Card>
    </Shell>
  );
}
