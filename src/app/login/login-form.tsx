"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm({
  devEnabled,
  azureEnabled,
  passwordEnabled,
}: {
  devEnabled: boolean;
  azureEnabled: boolean;
  passwordEnabled: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const passwordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("password", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(
        "That didn't work. Check the password, and make sure your email has been added by an admin.",
      );
    } else window.location.href = "/";
  };

  const devLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("dev", { email, redirect: false });
    setLoading(false);
    if (res?.error) setError("No active user with that email. Try a seeded account.");
    else window.location.href = "/";
  };

  return (
    <div className="space-y-4">
      {passwordEnabled && (
        <form onSubmit={passwordLogin} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Your email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Team password</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}

      {azureEnabled && (
        <>
          {passwordEnabled && (
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-[var(--muted-foreground)]">or</span>
              <Separator className="flex-1" />
            </div>
          )}
          <Button
            className="w-full"
            variant={passwordEnabled ? "outline" : "default"}
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/" })}
          >
            Sign in with Microsoft
          </Button>
        </>
      )}

      {devEnabled && (
        <form onSubmit={devLogin} className="space-y-3">
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-[var(--muted-foreground)]">dev login</span>
            <Separator className="flex-1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-email">Dev login (email only)</Label>
            <Input
              id="dev-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ourdomain.com"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Seeded: admin@ourdomain.com, morgan@ourdomain.com, casey@ourdomain.com (viewer)
            </p>
          </div>
          {error && !passwordEnabled && (
            <p className="text-xs text-[var(--destructive)]">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading} variant="secondary">
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>
      )}

      {!azureEnabled && !devEnabled && !passwordEnabled && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Sign-in isn&apos;t set up yet. In Vercel, add an APP_PASSWORD environment variable
          (team password) or the AZURE_AD_* variables (Microsoft sign-in), then redeploy.
        </p>
      )}
    </div>
  );
}
