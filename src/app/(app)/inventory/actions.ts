"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function adjustInventory(
  skuVariantId: string,
  delta: number,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertRole("member");
  const d = Math.trunc(Number(delta));
  if (!Number.isFinite(d) || d === 0) return { ok: false, error: "Enter a non-zero adjustment." };
  const sku = await prisma.skuVariant.findUnique({ where: { id: skuVariantId }, select: { id: true } });
  if (!sku) return { ok: false, error: "SKU not found." };
  await prisma.inventoryMovement.create({
    data: { skuVariantId, delta: d, reason: reason?.trim() || "adjustment", source: "manual", createdById: user.id },
  });
  await logAudit({ entityType: "inventory", entityId: skuVariantId, action: "adjust", userId: user.id, after: { delta: d } });
  revalidatePath("/inventory");
  return { ok: true };
}
