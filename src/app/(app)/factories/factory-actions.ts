"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const schema = z.object({
  name: z.string().trim().min(1, "Factory name required"),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  country: z.string().trim().optional(),
  paymentTermsDefault: z.string().trim().optional(),
  notes: z.string().optional(),
});

export async function createFactory(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  const dup = await prisma.factory.findFirst({
    where: { name: { equals: d.name, mode: "insensitive" } },
  });
  if (dup) return { ok: false, error: `Factory "${d.name}" already exists.` };
  const factory = await prisma.factory.create({
    data: {
      name: d.name,
      contactName: d.contactName || null,
      contactEmail: d.contactEmail || null,
      country: d.country || null,
      paymentTermsDefault: d.paymentTermsDefault || null,
      notes: d.notes || null,
    },
  });
  await logAudit({
    entityType: "factory",
    entityId: factory.id,
    action: "created",
    userId: user.id,
    after: { name: factory.name },
  });
  revalidatePath("/factories");
  revalidatePath("/samples");
  return { ok: true, id: factory.id };
}


/**
 * Delete a factory. Any samples / order forms / PIs pointing at it are
 * explicitly unlinked first (set to no factory) so the delete can't fail on a
 * foreign key. Useful for clearing junk factories created by older imports.
 */
export async function deleteFactory(id: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const factory = await prisma.factory.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!factory) return { ok: false, error: "Factory not found." };

  await prisma.$transaction([
    prisma.sample.updateMany({ where: { factoryId: id }, data: { factoryId: null } }),
    prisma.orderForm.updateMany({ where: { factoryId: id }, data: { factoryId: null } }),
    prisma.proformaInvoice.updateMany({ where: { factoryId: id }, data: { factoryId: null } }),
    prisma.factory.delete({ where: { id } }),
  ]);

  await logAudit({
    entityType: "factory",
    entityId: id,
    action: "deleted",
    userId: user.id,
    before: { name: factory.name },
  });
  revalidatePath("/factories");
  revalidatePath("/samples");
  return { ok: true };
}
