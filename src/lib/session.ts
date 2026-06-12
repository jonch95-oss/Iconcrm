import { auth } from "@/auth";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role: Role;
};

/** Returns the current session user or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name,
    image: session.user.image,
    role: session.user.role,
  };
}

/** Requires an authenticated user; redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2 };

/** True when the user's role meets or exceeds the required role. */
export function hasRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Requires the user to meet a minimum role; redirects to dashboard otherwise. */
export async function requireRole(required: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user.role, required)) redirect("/?error=forbidden");
  return user;
}

/** Throwing variant for server actions / API routes. */
export async function assertRole(required: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasRole(user.role, required)) throw new Error("Forbidden");
  return user;
}
