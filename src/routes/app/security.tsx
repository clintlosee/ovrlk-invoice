import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { disableTotp, enableTotp } from "@/server/factors";
import { getSecurity } from "@/server/session";

export const Route = createFileRoute("/app/security")({
  loader: () => getSecurity(),
  component: SecurityPage,
});

function SecurityPage() {
  const security = Route.useLoaderData();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  if (!security) return <p>Sign in again.</p>;

  async function onEnable(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await enableTotp({ data: { password } });
    setPending(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setQr(result.qrDataUrl);
    setBackupCodes(result.backupCodes);
    setMessage("Scan the code, then enter a code from the app to finish.");
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setPending(true);
    const result = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (result.error) {
      setMessage("That authenticator code did not match.");
      return;
    }
    setQr(null);
    setMessage("Authenticator app is on. Email codes stay on too.");
    await router.invalidate();
  }

  async function onDisable(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await disableTotp({ data: { password } });
    setPending(false);
    setMessage(
      result.ok
        ? "Authenticator app turned off. Email codes stay on."
        : result.message,
    );
    if (result.ok) await router.invalidate();
  }

  async function onAddPasskey() {
    setPending(true);
    const result = await authClient.passkey.addPasskey({ name: "This device" });
    setPending(false);
    setMessage(
      result.error
        ? "Could not add a passkey in this browser."
        : "Passkey added.",
    );
    if (!result.error) await router.invalidate();
  }

  async function onDeletePasskey(id: string) {
    setPending(true);
    const result = await authClient.passkey.deletePasskey({ id });
    setPending(false);
    setMessage(
      result.error ? "Could not remove that passkey." : "Passkey removed.",
    );
    if (!result.error) await router.invalidate();
  }

  return (
    <>
      <h1 className="font-serif text-3xl">Security</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Email codes are required and cannot be turned off.
      </p>
      <Card className="mt-6 space-y-4">
        <h2 className="font-medium">Authenticator app</h2>
        <p className="text-sm text-muted-foreground">
          Optional. Use it instead of the emailed code when you want.
        </p>
        <form
          className="space-y-3"
          onSubmit={security.totpEnabled ? onDisable : onEnable}
        >
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {security.totpEnabled
              ? "Turn off authenticator app"
              : "Set up authenticator app"}
          </Button>
        </form>
        {qr ? (
          <form className="space-y-3" onSubmit={onVerify}>
            <img
              src={qr}
              alt="Authenticator setup QR code"
              width={196}
              height={196}
            />
            <Label htmlFor="code">Code from the app</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <Button type="submit" disabled={pending}>
              Confirm authenticator
            </Button>
          </form>
        ) : null}
        {backupCodes.length > 0 ? (
          <div>
            <p className="text-sm">
              Save these backup codes. They are shown once.
            </p>
            <ul className="mt-2 font-mono text-sm">
              {backupCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
      <Card className="mt-6 space-y-4">
        <h2 className="font-medium">Passkey</h2>
        <p className="text-sm text-muted-foreground">
          Optional second factor for this browser or device. It does not replace
          the password.
        </p>
        <Button
          type="button"
          disabled={pending}
          onClick={() => void onAddPasskey()}
        >
          Add a passkey
        </Button>
        <ul className="text-sm">
          {security.passkeys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span>{key.name ?? "Passkey"}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void onDeletePasskey(key.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      {message ? <p className="mt-4 text-sm">{message}</p> : null}
    </>
  );
}
