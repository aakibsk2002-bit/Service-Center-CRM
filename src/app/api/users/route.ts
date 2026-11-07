import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOGIN_DOMAIN } from "@/lib/loginId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["admin", "crm", "engineer"];
const DETAIL_KEYS = [
  "joining_date", "leave_date", "date_of_birth", "personal_phone", "personal_email",
  "address", "emergency_contact_name", "emergency_contact_phone", "notes",
] as const;
const DATE_KEYS = ["joining_date", "leave_date", "date_of_birth"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function service(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(500, "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to web/.env.local (see the README) and restart the website.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Only an active admin may call this API. The browser sends its own login token. */
async function requireAdmin(req: Request, sb: SupabaseClient): Promise<string> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  const { data: p } = await sb.from("profiles").select("role,active").eq("id", data.user.id).maybeSingle();
  if (!p || p.role !== "admin" || !p.active) throw new HttpError(403, "Only an admin can manage users.");
  return data.user.id;
}

function cleanDetails(raw: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const k of DETAIL_KEYS) {
    if (!(k in r)) continue;
    const v = String(r[k] ?? "").trim();
    if (DATE_KEYS.includes(k) && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date for ${k.replace(/_/g, " ")}`);
    out[k] = v || null;
  }
  return out;
}

async function saveDetails(sb: SupabaseClient, id: string, d: Record<string, string | null>) {
  if (Object.keys(d).length === 0) return;
  const { error } = await sb.from("employee_details").upsert({ profile_id: id, ...d, updated_at: new Date().toISOString() });
  if (error) throw new HttpError(400, error.message);
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function validUsername(u: string) {
  return /^[a-z0-9._-]{3,30}$/i.test(u);
}

function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message || "Something went wrong" }, { status: 500 });
}

async function otherActiveAdmins(sb: SupabaseClient, excludeId: string) {
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true).neq("id", excludeId);
  return count ?? 0;
}

/** Create a user. */
export async function POST(req: Request) {
  try {
    const sb = service();
    await requireAdmin(req, sb);
    const b = await req.json();
    const fullName = String(b.full_name ?? "").trim();
    const username = String(b.username ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const role = String(b.role ?? "engineer");
    if (!fullName) throw new HttpError(400, "Enter the full name");
    if (!username && !email) throw new HttpError(400, "Enter a username (or an email)");
    if (username && !validUsername(username)) throw new HttpError(400, "Username must be 3 to 30 characters: letters, numbers, dot, dash or underscore");
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
    if (!ROLES.includes(role)) throw new HttpError(400, "Invalid role");
    const details = cleanDetails(b.details);

    const loginEmail = email || `${username.toLowerCase()}@${LOGIN_DOMAIN}`;
    if (username) {
      const { data: dup } = await sb.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (dup) throw new HttpError(409, "This username is already taken");
    }
    const created = await sb.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, phone: String(b.phone ?? "").trim() || null },
    });
    if (created.error || !created.data.user) {
      const m = created.error?.message ?? "Could not create the user";
      throw new HttpError(/already|registered|exists/i.test(m) ? 409 : 400, /already|registered|exists/i.test(m) ? "A user with this username or email already exists" : m);
    }
    const id = created.data.user.id;
    try {
      const up = await sb.from("profiles").update({
        full_name: fullName, role, username: username ? username.toLowerCase() : null,
        eng_code: String(b.eng_code ?? "").trim() || null, phone: String(b.phone ?? "").trim() || null, active: true,
      }).eq("id", id);
      if (up.error) throw new HttpError(400, /eng_code/.test(up.error.message) ? "This engineer code is already used" : up.error.message);
      await saveDetails(sb, id, details);
    } catch (e) {
      await sb.auth.admin.deleteUser(id); // undo, so no half-created user is left behind
      throw e;
    }
    return NextResponse.json({ id });
  } catch (e) {
    return fail(e);
  }
}

/** Edit a user: profile fields, personal details, active flag, password reset. */
export async function PATCH(req: Request) {
  try {
    const sb = service();
    const me = await requireAdmin(req, sb);
    const b = await req.json();
    const id = String(b.id ?? "");
    if (!id) throw new HttpError(400, "Missing user id");
    const { data: cur } = await sb.from("profiles").select("id,role,active,username").eq("id", id).maybeSingle();
    if (!cur) throw new HttpError(404, "User not found");

    const patch: Record<string, unknown> = {};
    if ("full_name" in b) {
      const v = String(b.full_name ?? "").trim();
      if (!v) throw new HttpError(400, "Enter the full name");
      patch.full_name = v;
    }
    if ("role" in b) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, "Invalid role");
      patch.role = b.role;
    }
    if ("eng_code" in b) patch.eng_code = String(b.eng_code ?? "").trim() || null;
    if ("phone" in b) patch.phone = String(b.phone ?? "").trim() || null;
    if ("active" in b) patch.active = !!b.active;

    const details = cleanDetails(b.details);
    // a leave date of today or earlier switches the account off
    if (details.leave_date && details.leave_date <= today()) patch.active = false;

    const losingAdmin = cur.role === "admin" && ((patch.role && patch.role !== "admin") || patch.active === false);
    if (id === me && (patch.active === false || (patch.role && patch.role !== "admin"))) {
      throw new HttpError(400, "You cannot deactivate or demote your own account");
    }
    if (losingAdmin && (await otherActiveAdmins(sb, id)) === 0) throw new HttpError(400, "At least one active admin is required");

    let newUsername: string | null = null;
    if ("username" in b) {
      const u = String(b.username ?? "").trim();
      if (u && !validUsername(u)) throw new HttpError(400, "Username must be 3 to 30 characters: letters, numbers, dot, dash or underscore");
      if (u && u.toLowerCase() !== (cur.username ?? "").toLowerCase()) {
        const { data: dup } = await sb.from("profiles").select("id").ilike("username", u).neq("id", id).maybeSingle();
        if (dup) throw new HttpError(409, "This username is already taken");
        newUsername = u.toLowerCase();
        patch.username = newUsername;
      }
    }

    const authUpdate: { password?: string; email?: string; email_confirm?: boolean } = {};
    if (b.password) {
      if (String(b.password).length < 8) throw new HttpError(400, "Password must be at least 8 characters");
      authUpdate.password = String(b.password);
    }
    if (newUsername) {
      const au = await sb.auth.admin.getUserById(id);
      if (au.data.user?.email?.endsWith(`@${LOGIN_DOMAIN}`)) {
        authUpdate.email = `${newUsername}@${LOGIN_DOMAIN}`;
        authUpdate.email_confirm = true;
      }
    }
    if (Object.keys(authUpdate).length) {
      const r = await sb.auth.admin.updateUserById(id, authUpdate);
      if (r.error) throw new HttpError(400, r.error.message);
    }
    if (Object.keys(patch).length) {
      const r = await sb.from("profiles").update(patch).eq("id", id);
      if (r.error) throw new HttpError(400, /eng_code/.test(r.error.message) ? "This engineer code is already used" : r.error.message);
    }
    await saveDetails(sb, id, details);
    return NextResponse.json({ ok: true, deactivated: patch.active === false });
  } catch (e) {
    return fail(e);
  }
}

/** Delete a user. A user who already has jobs cannot be erased (history must stay), so the account is deactivated instead. */
export async function DELETE(req: Request) {
  try {
    const sb = service();
    const me = await requireAdmin(req, sb);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) throw new HttpError(400, "Missing user id");
    if (id === me) throw new HttpError(400, "You cannot delete your own account");
    const { data: cur } = await sb.from("profiles").select("role,active").eq("id", id).maybeSingle();
    if (!cur) throw new HttpError(404, "User not found");
    if (cur.role === "admin" && cur.active && (await otherActiveAdmins(sb, id)) === 0) {
      throw new HttpError(400, "At least one active admin is required");
    }
    const r = await sb.auth.admin.deleteUser(id);
    if (r.error) {
      await sb.from("profiles").update({ active: false }).eq("id", id);
      return NextResponse.json({
        deactivated: true,
        message: "This user already has jobs or history, so the account cannot be erased. It has been deactivated instead (the user can no longer sign in).",
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
