"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateUserRole, toggleUserActive, inviteUser } from "./actions";
import { toast } from "sonner";
import type { Role } from "@prisma/client";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
}

export function UserManager({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const setRole = (userId: string, role: Role) => {
    startTransition(async () => {
      const res = await updateUserRole(userId, role);
      if (res.ok) { toast.success("Role updated"); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const toggle = (userId: string, isActive: boolean) => {
    startTransition(async () => {
      await toggleUserActive(userId, isActive);
      router.refresh();
    });
  };
  const invite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await inviteUser(fd);
      if (res.ok) { toast.success("User added"); form.reset(); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.name ?? "—"}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{u.email}</div>
                </TableCell>
                <TableCell>
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u.id, e.target.value as Role)}
                    disabled={pending}
                    className="h-8 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-sm"
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "success" : "secondary"}>{u.isActive ? "active" : "inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => toggle(u.id, !u.isActive)} disabled={pending}>
                    {u.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <form onSubmit={invite} className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border)] p-3">
        <div className="space-y-1">
          <label className="text-xs">Email</label>
          <Input name="email" type="email" required className="h-8 w-56 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-xs">Name</label>
          <Input name="name" className="h-8 w-40 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-xs">Role</label>
          <select name="role" defaultValue="member" className="h-8 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-xs">
            <option value="admin">admin</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
        </div>
        <Button size="sm" type="submit" disabled={pending}>Add user</Button>
      </form>
    </div>
  );
}
