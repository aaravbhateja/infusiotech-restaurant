// The backend enforces one active tenant_membership per user (MVP decision)
// and reports it as this error code from both create_tenant_and_owner() and
// accept_staff_invitation(). When it shows up, the account isn't broken —
// the user just already has a restaurant to go back to.
export function isAlreadyMemberError(message: string | null | undefined): boolean {
  return !!message && message.includes('already_has_active_membership');
}
