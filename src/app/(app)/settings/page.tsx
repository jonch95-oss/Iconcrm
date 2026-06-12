import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";
import { UserManager, type UserRow } from "./user-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [settings, users] = await Promise.all([
    getSettings(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

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
      </Tabs>
    </div>
  );
}
