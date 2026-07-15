import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";
import { UserManager, type UserRow } from "./user-manager";
import { ColorCodeManager, type ColorCodeRow } from "./color-code-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [settings, users] = await Promise.all([
    getSettings(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const [colorCodes, variantColors, sampleColors] = await Promise.all([
    prisma.colorCode.findMany({ orderBy: { color: "asc" } }).catch(() => [] as { id: string; color: string; code: string }[]),
    prisma.skuVariant.findMany({ select: { color: true }, distinct: ["color"] }).catch(() => [] as { color: string }[]),
    prisma.sample.findMany({ where: { color: { not: null } }, select: { color: true }, distinct: ["color"] }).catch(() => [] as { color: string | null }[]),
  ]);
  const codeRows: ColorCodeRow[] = colorCodes.map((c) => ({ id: c.id, color: c.color, code: c.code }));
  const mapped = new Set(colorCodes.map((c) => c.color.trim().toUpperCase()));
  const usedColors = new Set<string>();
  for (const v of variantColors) if (v.color?.trim()) usedColors.add(v.color.trim().toUpperCase());
  for (const s2 of sampleColors) if (s2.color?.trim()) usedColors.add(s2.color.trim().toUpperCase());
  const missingColors = [...usedColors].filter((c) => c && c !== "—" && !mapped.has(c)).sort();

  const userRows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
  }));

  return (
    <div>
      <PageHeader title="Admin Settings" description="Users, recipients, numbering, parsing patterns, and option lists." />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">Users &amp; Roles</TabsTrigger>
          <TabsTrigger value="colors">Color Codes</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
            <CardContent>
              <SettingsForm settings={settings} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Users &amp; roles</CardTitle></CardHeader>
            <CardContent>
              <UserManager users={userRows} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="colors" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Color codes (for SKU generation)</CardTitle></CardHeader>
            <CardContent>
              <ColorCodeManager codes={codeRows} missing={missingColors} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
