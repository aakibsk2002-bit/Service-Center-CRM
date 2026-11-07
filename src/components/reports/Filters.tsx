"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PRESETS, todayIST, fmtYmd } from "@/lib/dates";
import type { Category } from "@/lib/types";

export type Tab = "summary" | "monthly" | "daybook" | "customers" | "engineers" | "jobs" | "visits" | "credit";
export type Basis = "received" | "accepted" | "ready" | "outward";

export const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "monthly", label: "Monthly" },
  { key: "daybook", label: "Day book" },
  { key: "customers", label: "Customer wise" },
  { key: "engineers", label: "Engineer wise" },
  { key: "jobs", label: "Job search" },
  { key: "visits", label: "Visits and km" },
  { key: "credit", label: "Credit due" },
];

export const BASIS_LABEL: Record<Basis, string> = {
  received: "Received (inward) date",
  accepted: "Repair started date",
  ready: "Ready date",
  outward: "Outward date",
};

export interface RP {
  tab: Tab;
  from: string;
  to: string;
  basis: Basis;
  cat: number | null;
  eng: string;
  pay: string;
  status: string;
  q: string;
}

export function useReportParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = ((sp.get("tab") as Tab) || "summary") as Tab;
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  const fyStart = (() => {
    const y = Number(today.slice(0, 4));
    return `${Number(today.slice(5, 7)) >= 4 ? y : y - 1}-04-01`;
  })();
  const p: RP = {
    tab,
    from: sp.get("from") || (tab === "daybook" ? today : tab === "monthly" ? fyStart : monthStart),
    to: sp.get("to") || today,
    basis: (sp.get("basis") as Basis) || (tab === "jobs" || tab === "engineers" ? "received" : "outward"),
    cat: sp.get("cat") ? Number(sp.get("cat")) : null,
    eng: sp.get("eng") || "",
    pay: sp.get("pay") || "",
    status: sp.get("status") || "",
    q: sp.get("q") || "",
  };
  function set(patch: Record<string, string | null>) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") n.delete(k);
      else n.set(k, v);
    }
    router.replace(`/reports?${n.toString()}`);
  }
  return { p, set };
}

const STATUS_OPTS = [
  ["inward", "Inward (not taken)"],
  ["in_repair", "In repair"],
  ["pending_spares", "Pending for spares"],
  ["pending_tech", "Pending for tech support"],
  ["pending_approval", "Pending for approval"],
  ["ready", "Ready"],
  ["outward", "Outward (closed)"],
];

export default function Filters({ p, set }: { p: RP; set: (patch: Record<string, string | null>) => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name: string; eng_code: string | null }[]>([]);
  const [q, setQ] = useState(p.q);

  useEffect(() => {
    supabase.from("product_categories").select("*").order("sort_order").then(({ data }) => setCats((data ?? []) as Category[]));
    supabase.from("profiles").select("id,full_name,eng_code").eq("active", true).order("full_name").then(({ data }) => setPeople(data ?? []));
  }, []);

  const showBasis = p.tab === "customers" || p.tab === "engineers" || p.tab === "jobs";
  const showCat = p.tab === "customers" || p.tab === "jobs";
  const isJobs = p.tab === "jobs";
  const isVisits = p.tab === "visits";
  const showQ = p.tab === "customers" || p.tab === "jobs";

  if (p.tab === "credit") {
    return <p className="text-sm text-slate-500">Credit due shows every unpaid balance up to today, so no date is needed.</p>;
  }

  const preset = PRESETS.find((x) => {
    const r = x.range();
    return r.from === p.from && r.to === p.to;
  });

  return (
    <div className="panel space-y-3 p-4 print:hidden">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">From
          <input type="date" value={p.from} max={p.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="field mono mt-1 block" />
        </label>
        <label className="text-xs font-medium text-slate-600">To
          <input type="date" value={p.to} min={p.from} onChange={(e) => e.target.value && set({ to: e.target.value })} className="field mono mt-1 block" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick periods">
          {PRESETS.map((x) => (
            <button
              key={x.key}
              onClick={() => { const r = x.range(); set({ from: r.from, to: r.to }); }}
              aria-pressed={preset?.key === x.key}
              className={`rounded-full border px-3 py-1.5 text-sm ${preset?.key === x.key ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-slate-400"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {(showBasis || showCat || isJobs || showQ || isVisits) && (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          {showBasis && (
            <label className="text-xs font-medium text-slate-600">Period applies to
              <select value={p.basis} onChange={(e) => set({ basis: e.target.value })} className="field mt-1 block">
                {(Object.keys(BASIS_LABEL) as Basis[]).map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
              </select>
            </label>
          )}
          {showCat && (
            <label className="text-xs font-medium text-slate-600">Product type
              <select value={p.cat ?? ""} onChange={(e) => set({ cat: e.target.value })} className="field mt-1 block">
                <option value="">All products</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {(isJobs || isVisits) && (
            <label className="text-xs font-medium text-slate-600">Engineer
              <select value={p.eng} onChange={(e) => set({ eng: e.target.value })} className="field mt-1 block">
                <option value="">Everyone</option>
                {people.map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.eng_code ? ` (${x.eng_code})` : ""}</option>)}
              </select>
            </label>
          )}
          {isJobs && (
            <>
              <label className="text-xs font-medium text-slate-600">Status
                <select value={p.status} onChange={(e) => set({ status: e.target.value })} className="field mt-1 block">
                  <option value="">All statuses</option>
                  {STATUS_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Payment
                <select value={p.pay} onChange={(e) => set({ pay: e.target.value })} className="field mt-1 block">
                  <option value="">Any</option>
                  <option value="paid">Paid</option>
                  <option value="credit">On credit</option>
                  <option value="unpaid">Not paid yet</option>
                  <option value="nocharge">No charge</option>
                </select>
              </label>
            </>
          )}
          {showQ && (
            <form onSubmit={(e) => { e.preventDefault(); set({ q }); }} className="flex items-end gap-2">
              <label className="text-xs font-medium text-slate-600">Search
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, serial or job no" className="field mt-1 block w-60" />
              </label>
              <button className="btn btn-ghost">Apply</button>
            </form>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">Showing {fmtYmd(p.from)} to {fmtYmd(p.to)}</p>
    </div>
  );
}
