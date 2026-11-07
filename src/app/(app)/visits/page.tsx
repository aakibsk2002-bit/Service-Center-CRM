"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { VisitLocation } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";

const empty = { name: "", address: "", km: "" };

export default function VisitLocationsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [rows, setRows] = useState<VisitLocation[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("visit_locations").select("*").order("name");
    if (error) setError(error.message);
    else setRows((data ?? []) as VisitLocation[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setMsg("");
    const km = Number(form.km);
    if (!form.name.trim()) return setError("Enter the location name");
    if (!Number.isFinite(km) || km < 0 || form.km.trim() === "") return setError("Enter the distance in km (0 or more)");
    const payload = { name: form.name.trim(), address: form.address.trim() || null, km };
    const { error } = editId
      ? await supabase.from("visit_locations").update(payload).eq("id", editId)
      : await supabase.from("visit_locations").insert(payload);
    if (error) return setError(error.message);
    setMsg(editId ? "Location updated. Jobs already recorded keep their old km." : "Location added.");
    setForm(empty); setEditId(null); load();
  };

  const toggle = async (r: VisitLocation) => {
    const { error } = await supabase.from("visit_locations").update({ active: !r.active }).eq("id", r.id);
    if (error) setError(error.message); else load();
  };

  const remove = async (r: VisitLocation) => {
    if (!confirm(`Delete "${r.name}"? Jobs already recorded keep their address and km.`)) return;
    setError(""); setMsg("");
    const { error } = await supabase.from("visit_locations").delete().eq("id", r.id);
    if (error) {
      // a closed (locked) job uses this location, so it cannot be deleted: hide it instead
      await supabase.from("visit_locations").update({ active: false }).eq("id", r.id);
      setMsg(`"${r.name}" is used by closed jobs, so it was hidden instead of deleted.`);
    } else {
      setMsg("Location deleted.");
    }
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Visit locations</h1>
        <p className="text-sm text-slate-600">
          Set the distance (km, one way or round trip as you prefer to pay) for every place an engineer may visit.
          When an engineer or CRM records a site visit, the km of the chosen location is saved on that job and shown in Reports under Visits and km.
        </p>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</div>}
      {msg && <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">{msg}</div>}

      <form onSubmit={save} className="panel grid gap-3 p-4 md:grid-cols-[1fr_2fr_8rem_auto] md:items-end">
        <label className="text-xs font-medium text-slate-600">Location name
          <input className="field mt-1 block w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dhule city" />
        </label>
        <label className="text-xs font-medium text-slate-600">Address / area (optional)
          <input className="field mt-1 block w-full" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">Km
          <input className="field mono mt-1 block w-full" inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary">{editId ? "Save changes" : "Add location"}</button>
          {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setForm(empty); }}>Cancel</button>}
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr><th className="th">Location</th><th className="th">Address</th><th className="th text-right">Km</th><th className="th">Status</th><th className="th" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? "" : "text-slate-400"}>
                <td className="td font-medium">{r.name}</td>
                <td className="td">{r.address ?? "-"}</td>
                <td className="td mono text-right">{Number(r.km).toFixed(1)}</td>
                <td className="td">{r.active ? "Active" : "Hidden"}</td>
                <td className="td whitespace-nowrap text-right">
                  <button className="btn btn-sm" onClick={() => { setEditId(r.id); setForm({ name: r.name, address: r.address ?? "", km: String(r.km) }); }}>Edit</button>{" "}
                  <button className="btn btn-sm" onClick={() => toggle(r)}>{r.active ? "Hide" : "Show"}</button>
                  {isAdmin && <>{" "}<button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button></>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="td py-6 text-center text-slate-500">No locations yet. Add the first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
