import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const devEnabled = process.env.DEV_AUTH_ENABLED === "true";
  const azureEnabled = Boolean(process.env.AZURE_AD_CLIENT_ID);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--muted)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-bold">
            S2P
          </div>
          <CardTitle>Sample-to-PO CRM</CardTitle>
          <CardDescription>
            Wholesale production tracker. Sign in with your Microsoft 365 account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm devEnabled={devEnabled} azureEnabled={azureEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
