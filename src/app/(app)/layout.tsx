import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canSeeRevisionBadge } from "@/lib/revision-badge";
import { outstandingRevisionCount } from "@/lib/revisions";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // The badge is opt-in per person, so the count is only fetched for someone
  // who'd actually see it.
  const prefs = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPrefs: true },
  });
  const revisionBadge = canSeeRevisionBadge(user, prefs?.notificationPrefs)
    ? await outstandingRevisionCount()
    : 0;
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar revisionBadge={revisionBadge} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4">
          <MobileNav revisionBadge={revisionBadge} />
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
