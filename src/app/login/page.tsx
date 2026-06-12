import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const devEnabled = process.env.DEV_AUTH_ENABLED === "true";
  const azureEnabled = Boolean(process.env.AZURE_AD_CLIENT_ID);
  const passwordEnabled = Boolean(process.env.APP_PASSWORD);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--muted)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-3">
            <div className="font-display text-3xl tracking-wide">ICON</div>
            <div className="label-luxe mt-1 text-[var(--bronze)]">Luxury Group · Production</div>
          </div>
          <CardTitle className="sr-only">Icon CRM</CardTitle>
          <CardDescription>
            Wholesale production tracker.{" "}
            {passwordEnabled
              ? "Sign in with your email and the team password."
              : azureEnabled
                ? "Sign in with your Microsoft 365 account."
                : "Sign in below."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm devEnabled={devEnabled} azureEnabled={azureEnabled} passwordEnabled={passwordEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
