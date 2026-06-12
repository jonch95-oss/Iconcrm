"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { updateSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import { logAudit } from "@/lib/audit";

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
  const role = String(formData.get("role") ?? "viewer") as Role;
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
