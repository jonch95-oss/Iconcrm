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
}: {
  devEnabled: boolean;
  azureEnabled: boolean;
}) {
  const [email, setEmail] = React.useState("admin@ourdomain.com");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      {azureEnabled && (
        <Button className="w-full" onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/" })}>
          Sign in with Microsoft
        </Button>
      )}

      {devEnabled && (
        <>
          {azureEnabled && (
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-[var(--muted-foreground)]">or dev login</span>
              <Separator className="flex-1" />
            </div>
          )}
          <form onSubmit={devLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Dev login (email only)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ourdomain.com"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Seeded: admin@ourdomain.com, morgan@ourdomain.com, casey@ourdomain.com (viewer)
              </p>
            </div>
            {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading} variant="secondary">
              {loading ? "Signing in…" : "Continue"}
            </Button>
          </form>
        </>
      )}

      {!azureEnabled && !devEnabled && (
        <p className="text-sm text-[var(--muted-foreground)]">
          No auth providers configured. Set AZURE_AD_* or DEV_AUTH_ENABLED.
        </p>
      )}
    </div>
  );
}
