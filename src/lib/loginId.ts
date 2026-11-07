/** Staff can sign in with a username. Supabase needs an email, so a username becomes username@<suffix>. */
export const LOGIN_DOMAIN = "users.servicedesk.app";

export function toLoginEmail(input: string): string {
  const v = input.trim();
  return v.includes("@") ? v : `${v.toLowerCase()}@${LOGIN_DOMAIN}`;
}
