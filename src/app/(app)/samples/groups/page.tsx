import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { suggestGroups } from "@/lib/grouping";
import { GroupSuggestions } from "./group-suggestions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SuggestedGroupsPage() {
  // Admin-only.
  await requireRole("admin");

  const samples = await prisma.sample.findMany({
    where: { status: { notIn: ["dropped"] } },
    select: { id: true, sampleNumber: true, color: true, material: true, status: true, brand: true },
    orderBy: { sampleNumber: "asc" },
    take: 5000,
  });
  const clusters = suggestGroups(
    samples.map((s) => ({
      id: s.id,
      sampleNumber: s.sampleNumber,
      color: s.color ?? "",
      material: s.material ?? "",
      status: s.status,
      brand: s.brand ?? "",
    })),
  );

  return (
    <div>
      <PageHeader title="Suggested groups" description="Admin only. Look-alike sample numbers clustered into candidate families.">
        <Button asChild variant="outline">
          <Link href="/samples"><ArrowLeft className="h-4 w-4" /> Samples</Link>
        </Button>
      </PageHeader>
      <GroupSuggestions clusters={clusters} />
    </div>
  );
}
