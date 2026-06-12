/**
 * The owner account. Always an admin, cannot be demoted or deactivated, and
 * the only account that may be an admin. Override with the ADMIN_EMAIL env
 * var if the owner ever changes.
 */
export const OWNER_EMAIL = (process.env.ADMIN_EMAIL ?? "jonc@iconluxurygroup.com")
  .toLowerCase()
  .trim();

export const isOwner = (email: string | null | undefined) =>
  (email ?? "").toLowerCase().trim() === OWNER_EMAIL;
