import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSignUpOpen, registerOwnerFn } from "@/server/register";

export const Route = createFileRoute("/sign-up")({
  loader: () => getSignUpOpen(),
  component: SignUpPage,
  headers: () => ({ "cache-control": "no-store" }),
});

function SignUpPage() {
  const { open } = Route.useLoaderData();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await registerOwnerFn({
      data: {
        name: String(form.get("name") ?? ""),
        businessName: String(form.get("businessName") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        timeZone: String(form.get("timeZone") ?? "America/Denver"),
      },
    });
    setPending(false);
    setMessage(
      result.ok
        ? "Account created. Sign in with the password and the emailed code."
        : result.message,
    );
  }

  return (
    <Shell>
      <Card>
        {open ? (
          <>
            <h1 className="font-serif text-3xl">Create an Owner</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This creates one Owner and one Business.
            </p>
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" name="name" required autoComplete="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input id="businessName" name="businessName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeZone">Time zone</Label>
                <Input
                  id="timeZone"
                  name="timeZone"
                  defaultValue="America/Denver"
                  required
                />
              </div>
              {message ? <p className="text-sm">{message}</p> : null}
              <Button type="submit" disabled={pending}>
                Create account
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl">Coming soon</h1>
            <p className="mt-4 text-muted-foreground">
              Sign-up is closed. The first Owner is created from the server, not
              from this page.
            </p>
          </>
        )}
      </Card>
    </Shell>
  );
}
