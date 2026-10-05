// Single source of truth for "which home screen does this role land on".
// Used both by the post-login redirect (src/app/index.tsx) and by each role
// home screen itself, so a staff member can never end up on another role's
// dashboard just by navigating there directly (deep link, browser back/
// forward, a stale bottom-tab href, typing the URL on web, etc.) — only the
// initial redirect isn't enough, because nothing then stops direct navigation.
export type RoleHome = '/(staff)/waiter-home' | '/(staff)/kitchen-home' | '/(staff)/cashier-home' | '/(staff)/manager-home' | '/(staff)/home';

export function homePathForRole(roleName: string | undefined): RoleHome {
  if (roleName === 'Waiter') return '/(staff)/waiter-home';
  if (roleName === 'Kitchen Staff') return '/(staff)/kitchen-home';
  if (roleName === 'Cashier') return '/(staff)/cashier-home';
  if (roleName === 'Manager') return '/(staff)/manager-home';
  return '/(staff)/home';
}
