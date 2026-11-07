"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

interface Issue { id: number; name: string; needs_pickup_test: boolean; sort_order: number; active: boolean }

export default function IssuesPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Issue[]>([]);
  const [name, setName] = useState("");
  const [test, setTest] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("issue_categories").select("*").order("sort_order").order("name");
    setRows((data ?? []) as Issue[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (profile && profile.role !== "admin") return <div className="panel p-5 text-sm">Only an admin can manage issue categories.</div>;

  const upd = async (id: number, patch: Partial<Issue>) => {
    const { error } = await supabase.from("issue_categories").update(patch).eq("id", id);
    setError(error?.message ?? ""); load();
  };
  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("issue_categories").insert({ name: name.trim(), needs_pickup_test: test, sort_order: (rows.at(-1)?.sort_order ?? 0) + 1 });
    if (error) return setError(error.message);
    setName(""); setTest(false); setError(""); load();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Issue categories</h1>
        <p className="text-sm text-slate-600">
          The category chosen at inward (for example Paper pickup issue). Tick <b>Paper pickup test compulsory</b> only for categories where the 50 to 60 page test must be completed before the job can be marked Ready.
        </p>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</div>}
      <div className="panel divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${r.active ? "" : "opacity-50"}`}>
            <input defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && upd(r.id, { name: e.target.value.trim() })} className="field field-sm w-56" />
            <label className="flex items-center gap-2"><input type="checkbox" checked={r.needs_pickup_test} onChange={(e) => upd(r.id, { needs_pickup_test: e.target.checked })} /> Paper pickup test compulsory</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={r.active} onChange={(e) => upd(r.id, { active: e.target.checked })} /> Active</label>
          </div>
        ))}
      </div>
      <div className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New issue category" className="field w-56" />
        <label className="flex items-center gap-2"><input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Paper pickup test compulsory</label>
        <button className="btn btn-primary btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}
