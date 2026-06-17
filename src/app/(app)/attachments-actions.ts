"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

type Result = { ok: true } | { ok: false; error: string };

const PATH: Record<string, (id: string) => string> = {
  sample: (id) => `/samples/${id}`,
  pi: (id) => `/pis/${id}`,
  po: (id) => `/pos/${id}`,
  customer_po: (id) => `/customer-pos/${id}`,
  order_form: (id) => `/order-forms/${id}`,
  packing_list: (id) => `/packing-lists/${id}`,
};

export async function attachFile(
  parentType: string,
  parentId: string,
  blobUrl: string,
  filename: string,
  mimeType?: string,
): Promise<Result> {
  const user = await assertRole("member");
  if (!PATH[parentType]) return { ok: false, error: "Unsupported attachment target." };
  if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(blobUrl)) {
    return { ok: false, error: "Invalid upload URL." };
  }
  await prisma.attachment.create({
    data: { parentType, parentId, blobUrl, filename, mimeType: mimeType || null, uploadedById: user.id },
  });
  await logAudit({ entityType: parentType, entityId: parentId, action: "file_attached", userId: user.id, after: { filename } });
  revalidatePath(PATH[parentType](parentId));
  return { ok: true };
}

export async function deleteAttachment(id: string): Promise<Result> {
  const user = await assertRole("member");
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return { ok: false, error: "Attachment not found." };
  await prisma.attachment.delete({ where: { id } });
  await logAudit({ entityType: a.parentType, entityId: a.parentId, action: "file_removed", userId: user.id, after: { filename: a.filename } });
  if (PATH[a.parentType]) revalidatePath(PATH[a.parentType](a.parentId));
  return { ok: true };
}
