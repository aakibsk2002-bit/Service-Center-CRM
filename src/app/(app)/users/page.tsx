"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { fmtDate } from "@/lib/format";
import type { EmployeeDetails, Profile, Role } from "@/lib/types";

interface Form {
  full_name: string;
  username: string;
  email: string;
  password: string;
  role: Role;
  eng_code: string;
  phone: string;
  active: boolean;
  joining_date: string;
  leave_date: string;
  date_of_birth: string;
  personal_phone: string;
  personal_email: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
}

const EMPTY: Form = {
  full_name: "", username: "", email: "", password: "", role: "engineer", eng_code: "", phone: "", active: true,
  joining_date: "", leave_date: "", date_of_birth: "", personal_phone: "", personal_email: "", address: "",
  emergency_contact_name: "", emergency_contact_phone: "", notes: "",
};

const DETAIL_KEYS = [
  "joining_date", "leave_date", "date_of_birth", "personal_phone", "personal_email", "address",
  "emergency_contact_name", "emergency_contact_phone", "notes",
] as const;

const lbl = "block text-xs font-medium text-slate-600";
const inp = "field mt-1 block w-full";

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

async function callApi(method: "POST" | "PATCH" | "DELETE", body?: unknown, query = "") {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/users${query}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as { id?: string; deleted?: boolean; deactivated?: boolean; message?: string };
}

export default function UsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [details, setDetails] = useState<Record<string, EmployeeDetails>>({});
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [showPersonal, setShowPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [u, d] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("employee_details").select("*"),
    ]);
    if (u.error) setError(u.error.message);
    else setUsers((u.data ?? []) as Profile[]);
    const map: Record<string, EmployeeDetails> = {};
    for (const x of (d.data ?? []) as EmployeeDetails[]) map[x.profile_id] = x;
    setDetails(map);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setForm({ ...EMPTY, password: randomPassword() });
    setShowPersonal(false);
    setEditing("new");
    setError(""); setMsg("");
  }

  function openEdit(u: Profile) {
    const d = details[u.id];
    setForm({
      ...EMPTY,
      full_name: u.full_name, username: u.username ?? "", role: u.role, eng_code: u.eng_code ?? "", phone: u.phone ?? "", active: u.active,
      ...Object.fromEntries(DETAIL_KEYS.map((k) => [k, d?.[k] ?? ""])),
    } as Form);
    setShowPersonal(!!d);
    setEditing(u.id);
    setError(""); setMsg("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    setBusy(true);
    try {
      const det = Object.fromEntries(DETAIL_KEYS.map((k) => [k, form[k]]));
      if (editing === "new") {
        const r = await callApi("POST", {
          full_name: form.full_name, username: form.username, email: form.email, password: form.password,
          role: form.role, eng_code: form.eng_code, phone: form.phone, details: det,
        });
        setMsg(`User created. Share these login details with ${form.full_name}: username "${form.username || form.email}" and the password you set.`);
        void r;
      } else {
        await callApi("PATCH", {
          id: editing, full_name: form.full_name, username: form.username, role: form.role, eng_code: form.eng_code,
          phone: form.phone, active: form.active, details: det, ...(form.password ? { password: form.password } : {}),
        });
        setMsg(form.password ? "Saved. The password has been changed." : "Saved.");
      }
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function remove(u: Profile) {
    if (!confirm(`Delete ${u.full_name}? This cannot be undone.`)) return;
    setError(""); setMsg("");
    try {
      const r = await callApi("DELETE", undefined, `?id=${u.id}`);
      setMsg(r.deactivated ? (r.message ?? "User deactivated.") : "User deleted.");
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (profile?.role !== "admin") {
    return <p className="text-slate-600">Only admin can manage users.</p>;
  }

  const left = (u: Profile) => {
    const l = details[u.id]?.leave_date;
    return l && l <= new Date().toISOString().slice(0, 10) ? l : null;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-slate-600">Add, edit or remove CRM and engineer accounts. Personal details are visible to admins only.</p>
        </div>
        <button onClick={openNew} className="btn btn-primary">Add user</button>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {msg && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</p>}

      {editing && (
        <form onSubmit={save} className="panel space-y-4 p-5">
          <h2 className="font-semibold text-ink">{editing === "new" ? "New user" : `Edit ${form.full_name || "user"}`}</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label className={lbl}>Full name *<input className={inp} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
            <label className={lbl}>Username (for login) {editing === "new" ? "*" : ""}
              <input className={inp} value={form.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="none" placeholder="e.g. rahul.p" />
            </label>
            <label className={lbl}>Role
              <select className={inp} value={form.role} onChange={(e) => set("role", e.target.value as Role)} disabled={editing === profile.id}>
                <option value="engineer">Engineer</option>
                <option value="crm">CRM</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className={lbl}>Engineer code<input className={inp} value={form.eng_code} onChange={(e) => set("eng_code", e.target.value)} placeholder="e.g. E3" /></label>
            <label className={lbl}>Work phone<input className={inp} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            {editing === "new" && (
              <label className={lbl}>Email (optional, if you want email login)
                <input className={inp} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </label>
            )}
            <label className={`${lbl} md:col-span-2`}>{editing === "new" ? "Password * (minimum 8 characters)" : "New password (leave empty to keep the current one)"}
              <div className="mt-1 flex gap-2">
                <input className="field mono w-full" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
                <button type="button" className="btn" onClick={() => set("password", randomPassword())}>Generate</button>
              </div>
            </label>
            {editing !== "new" && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={form.active} disabled={editing === profile.id} onChange={(e) => set("active", e.target.checked)} />
                Account active (can sign in)
              </label>
            )}
          </div>

          <div>
            <button type="button" className="text-sm text-bench underline" onClick={() => setShowPersonal((v) => !v)}>
              {showPersonal ? "Hide" : "Show"} joining / leave date and personal details (optional)
            </button>
            {showPersonal && (
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className={lbl}>Joining date<input type="date" className={inp} value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} /></label>
                <label className={lbl}>Leave date<input type="date" className={inp} value={form.leave_date} onChange={(e) => set("leave_date", e.target.value)} /></label>
                <label className={lbl}>Date of birth<input type="date" className={inp} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></label>
                <label className={lbl}>Personal phone<input className={inp} value={form.personal_phone} onChange={(e) => set("personal_phone", e.target.value)} /></label>
                <label className={lbl}>Personal email<input className={inp} value={form.personal_email} onChange={(e) => set("personal_email", e.target.value)} /></label>
                <label className={`${lbl} md:col-span-3`}>Address<input className={inp} value={form.address} onChange={(e) => set("address", e.target.value)} /></label>
                <label className={lbl}>Emergency contact name<input className={inp} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></label>
                <label className={lbl}>Emergency contact phone<input className={inp} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></label>
                <label className={`${lbl} md:col-span-2`}>Notes<input className={inp} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
                <p className="text-xs text-slate-500 md:col-span-4">A leave date of today or earlier switches the account off automatically when you save.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : editing === "new" ? "Create user" : "Save changes"}</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
            {editing !== "new" && editing !== profile.id && (
              <button type="button" className="btn ml-auto text-red-700" onClick={() => remove(users.find((x) => x.id === editing)!)}>Delete user</button>
            )}
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Eng code</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-line last:border-0 ${u.active ? "" : "text-slate-400"}`}>
                <td className="px-4 py-2 font-medium">{u.full_name}</td>
                <td className="mono px-4 py-2">{u.username ?? "-"}</td>
                <td className="px-4 py-2 capitalize">{u.role}</td>
                <td className="mono px-4 py-2">{u.eng_code ?? "-"}</td>
                <td className="px-4 py-2">{u.phone ?? "-"}</td>
                <td className="px-4 py-2">{details[u.id]?.joining_date ? fmtDate(details[u.id].joining_date) : "-"}</td>
                <td className="px-4 py-2">
                  {left(u) ? `Left ${fmtDate(left(u))}` : u.active ? "Active" : "Inactive"}
                </td>
                <td className="px-4 py-2 text-right"><button className="btn btn-sm" onClick={() => openEdit(u)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
