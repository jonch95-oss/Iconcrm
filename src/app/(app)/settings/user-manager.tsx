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
import { updateUserRole, updateUserName, toggleUserActive, inviteUser } from "./actions";
import { toast } from "sonner";
import type { Role } from "@prisma/client";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
}

/** Click the name to rename someone — it's the name that shows up on every
 *  comment, receipt and revision request, so it needs to be fixable. */
function EditableName({ id, name }: { id: string; name: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name ?? "");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setValue(name ?? ""), [name]);

  const save = () => {
    setEditing(false);
    if (value.trim() === (name ?? "")) return;
    startTransition(async () => {
      const res = await updateUserName(id, value);
      if (res.ok) {
        toast.success("Name updated");
        router.refresh();
      } else {
        toast.error(res.error);
        setValue(name ?? "");
      }
    });
  };

  if (editing)
    return (
      <Input
        autoFocus
        value={value}
        disabled={pending}
        placeholder="Full name"
        className="h-8 w-48"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(name ?? "");
            setEditing(false);
          }
        }}
      />
    );

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      title="Rename"
      className="rounded px-1 text-left font-medium hover:bg-[var(--accent)]"
    >
      {name ?? "— add a name"}
    </button>
  );
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
                  <EditableName id={u.id} name={u.name} />
                  <div className="text-xs text-[var(--muted-foreground)]">{u.email}</div>
                </TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge className="bg-[var(--bronze)] text-[var(--bronze-foreground)]">Owner · Admin</Badge>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value as Role)}
                      disabled={pending}
                      className="h-8 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-sm"
                    >
                      <option value="member">Can edit</option>
                      <option value="viewer">View only</option>
                    </select>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "success" : "secondary"}>{u.isActive ? "active" : "inactive"}</Badge>
                </TableCell>
                <TableCell>
                  {u.role !== "admin" && (
                    <Button size="sm" variant="ghost" onClick={() => toggle(u.id, !u.isActive)} disabled={pending}>
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
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
          <select name="role" defaultValue="viewer" className="h-8 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-xs">
            <option value="member">Can edit</option>
            <option value="viewer">View only</option>
          </select>
        </div>
        <Button size="sm" type="submit" disabled={pending}>Add user</Button>
      </form>
    </div>
  );
}
