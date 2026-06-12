import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { QuickReceive } from "./quick-receive";

export const dynamic = "force-dynamic";

export default async function ReceivePage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Receive samples"
        description="A box just arrived? Type the sample number and tap once. Built for your phone."
      />
      <QuickReceive />
    </div>
  );
}
