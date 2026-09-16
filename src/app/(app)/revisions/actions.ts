"use server";

import { assertRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { getRevisionRecap, recapFiltersFromQuery, recapSubject } from "@/lib/revisions";
import { RevisionRecapEmail } from "@/emails/revision-recap";

/**
 * Mail one factory its recap. The filters come through as the dashboard's own
 * query string, so what lands in the factory's inbox is what was on screen.
 */
export async function emailRecapToFactory(
  factoryId: string,
  query: string,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const user = await assertRole("member");
  const factory = await prisma.factory.findUnique({ where: { id: factoryId } });
  if (!factory) return { ok: false, error: "Factory not found." };
  if (!factory.contactEmail)
    return { ok: false, error: `No contact email on ${factory.name} — add one under Factories.` };

  const filters = { ...recapFiltersFromQuery(Object.fromEntries(new URLSearchParams(query))), factoryId };
  const recap = await getRevisionRecap(filters);
  const bucket = recap.factories.find((f) => f.id === factoryId);
  if (!bucket || bucket.samples.length === 0)
    return { ok: false, error: "Nothing to send for this factory in the selected range." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const sent = await sendEmail({
    to: factory.contactEmail,
    replyTo: user.email,
    subject: recapSubject(bucket.samples.length, recap.since),
    react: RevisionRecapEmail({
      factoryName: factory.name,
      contactName: factory.contactName,
      since: recap.since,
      samples: bucket.samples,
      appUrl,
    }),
  });
  if (!sent.ok) return { ok: false, error: "The email failed to send." };

  await logAudit({
    entityType: "factory",
    entityId: factoryId,
    action: "revision_recap_emailed",
    userId: user.id,
    after: { to: factory.contactEmail, samples: bucket.samples.length, openRevisions: bucket.openRevisions },
  });
  return { ok: true, to: factory.contactEmail };
}
