"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { updateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { toDecimal } from "@/lib/money";
import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { isOwner } from "@/lib/owner";

type ActionResult = { ok: true } | { ok: false; error: string };

const linesToArray = (v: FormDataEntryValue | null): string[] =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("admin");
  await updateSettings({
    sampleNumberPatterns: linesToArray(formData.get("sampleNumberPatterns")),
    brandPatterns: linesToArray(formData.get("brandPatterns")),
    categoryPatterns: linesToArray(formData.get("categoryPatterns")),
    missingInfoRecipients: linesToArray(formData.get("missingInfoRecipients")),
    internalPoDistribution: linesToArray(formData.get("internalPoDistribution")),
    brands: linesToArray(formData.get("brands")),
    categories: linesToArray(formData.get("categories")),
    poNumberPrefix: String(formData.get("poNumberPrefix") ?? "PO").trim() || "PO",
    poNumberStart: Number(formData.get("poNumberStart") ?? 1) || 1,
    orderFormPrefix: String(formData.get("orderFormPrefix") ?? "OF").trim() || "OF",
    followUpCadenceDays: Number(formData.get("followUpCadenceDays") ?? 7) || 7,
    inlandBufferDaysDefault: Number(formData.get("inlandBufferDaysDefault") ?? 5) || 5,
    riskThresholdDays: Number(formData.get("riskThresholdDays") ?? 7) || 7,
  });
  await logAudit({ entityType: "settings", entityId: "app_settings", action: "updated", userId: user.id });
  revalidatePath("/settings");
  return { ok: true };
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "member", "viewer"]),
});

export async function updateUserRole(userId: string, role: Role): Promise<ActionResult> {
  {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (target && isOwner(target.email) && role !== "admin") {
      return { ok: false, error: "The owner account is always the admin." };
    }
    if (target && !isOwner(target.email) && role === "admin") {
      return { ok: false, error: "Only the owner account can be an admin. Grant \"Can edit\" instead." };
    }
  }
  const admin = await assertRole("admin");
  const parsed = roleSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const before = await prisma.user.findUnique({ where: { id: userId } });
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAudit({
    entityType: "user",
    entityId: userId,
    action: "role_changed",
    userId: admin.id,
    before: { role: before?.role },
    after: { role },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (target && isOwner(target.email) && !isActive) {
      return { ok: false, error: "The owner account can't be deactivated." };
    }
  }
  const admin = await assertRole("admin");
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
  await logAudit({ entityType: "user", entityId: userId, action: isActive ? "activated" : "deactivated", userId: admin.id });
  revalidatePath("/settings");
  return { ok: true };
}

export async function inviteUser(formData: FormData): Promise<ActionResult> {
  const admin = await assertRole("admin");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  let role = String(formData.get("role") ?? "viewer") as Role;
  if (role === "admin") role = "member"; // only the owner account is admin
  if (!email) return { ok: false, error: "Email required" };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "User already exists" };
  const created = await prisma.user.create({
    data: { email, name: name || null, role, notificationPrefs: { morningDigest: true } },
  });
  await logAudit({ entityType: "user", entityId: created.id, action: "created", userId: admin.id, after: { email, role } });
  revalidatePath("/settings");
  return { ok: true };
}


export async function upsertColorCode(color: string, code: string): Promise<ActionResult> {
  const user = await assertRole("admin");
  const c = color.trim().toUpperCase();
  const cd = code.trim().toUpperCase();
  if (!c) return { ok: false, error: "Color is required." };
  if (!cd) return { ok: false, error: "Code is required." };
  await prisma.colorCode.upsert({ where: { color: c }, update: { code: cd }, create: { color: c, code: cd } });
  await logAudit({ entityType: "color_code", entityId: c, action: "upserted", userId: user.id, after: { color: c, code: cd } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteColorCode(id: string): Promise<ActionResult> {
  const user = await assertRole("admin");
  const existing = await prisma.colorCode.findUnique({ where: { id } });
  await prisma.colorCode.delete({ where: { id } });
  if (existing) await logAudit({ entityType: "color_code", entityId: existing.color, action: "deleted", userId: user.id });
  revalidatePath("/settings");
  return { ok: true };
}


export async function upsertHtsMapping(
  category: string,
  material: string,
  htsCode: string,
  baseDuty?: string,
  totalTariff?: string,
): Promise<ActionResult> {
  await assertRole("admin");
  const c = category.trim().toUpperCase();
  const m = material.trim().toUpperCase();
  const h = htsCode.trim();
  if (!c) return { ok: false, error: "Category is required." };
  if (!h) return { ok: false, error: "HTS code is required." };
  await prisma.htsMapping.upsert({
    where: { category_material: { category: c, material: m } },
    update: { htsCode: h, baseDuty: toDecimal(baseDuty), totalTariff: toDecimal(totalTariff) },
    create: { category: c, material: m, htsCode: h, baseDuty: toDecimal(baseDuty), totalTariff: toDecimal(totalTariff) },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteHtsMapping(id: string): Promise<ActionResult> {
  await assertRole("admin");
  await prisma.htsMapping.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function preloadHtsMappings(): Promise<ActionResult> {
  await assertRole("admin");
  const { HTS_SEED } = await import("@/lib/hts-seed");
  for (const r of HTS_SEED) {
    await prisma.htsMapping.upsert({
      where: { category_material: { category: r.category, material: r.material } },
      update: {}, // don't clobber edits on re-run
      create: {
        category: r.category,
        material: r.material,
        htsCode: r.htsCode,
        baseDuty: r.baseDuty != null ? new Prisma.Decimal(r.baseDuty) : null,
        totalTariff: r.totalTariff != null ? new Prisma.Decimal(r.totalTariff) : null,
      },
    });
  }
  revalidatePath("/settings");
  return { ok: true };
}
