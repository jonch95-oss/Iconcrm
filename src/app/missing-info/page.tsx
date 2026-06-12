import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/tokens";
import { MissingInfoForm } from "./missing-info-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function MissingInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const payload = token ? verifyToken(token) : null;
  const sample =
    payload && payload.purpose === "missing_info"
      ? await prisma.sample.findUnique({ where: { id: payload.sampleId } })
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--muted)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete sample details</CardTitle>
          <CardDescription>
            {sample
              ? `A few details are missing for sample ${sample.sampleNumber}. Please fill them in below.`
              : "This link is invalid or has expired."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sample && token ? (
            <MissingInfoForm
              token={token}
              sampleNumber={sample.sampleNumber}
              defaults={{
                brand: sample.brand ?? "",
                category: sample.category ?? "",
                styleName: sample.styleName ?? "",
                styleNumber: sample.styleNumber ?? "",
                description: sample.description ?? "",
              }}
            />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Please request a new link from the team.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
