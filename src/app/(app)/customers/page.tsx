"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { fmtDateTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/types";
import type { ProductHit } from "@/components/ProductSearch";

interface Cust {
  id: string; name: string; company: string | null; phone: string; whatsapp_phone: string | null;
  email: string | null; address: string | null; city: string | null; pincode: string | null;
}
interface JobLine {
  id: string; job_no: string; rma_no: string | null; received_at: string; status: string;
  reported_problem: string | null; action_taken: string | null;
  device: { serial_no: string | null; brand: string | null; model_no: string | null } | null;
  repair: { full_name: string } | null;
}

export default function CustomersPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "crm";
  const [q, setQ] = useState("");
  const [list, setList] = useState<(Cust & { match?: string })[]>([]);
  const [sel, setSel] = useState<Cust | null>(null);
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [form, setForm] = useState<Cust | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = q.trim();
    const h = setTimeout(async () => {
      if (t.length < 3) {
        const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(20);
        setList((data ?? []) as Cust[]);
        return;
      }
      const [pr, cu] = await Promise.all([
        supabase.rpc("find_products", { p_q: t, p_limit: 40 }),
        supabase.rpc("find_customers", { p_q: t, p_limit: 20 }),
      ]);
      const map = new Map<string, Cust & { match?: string }>();
      for (const c of (cu.data ?? []) as Cust[]) map.set(c.id, c);
      const ids = new Set<string>();
      for (const h of (pr.data ?? []) as ProductHit[]) {
        if (!h.customer_id) continue;
        ids.add(h.customer_id);
        const ex = map.get(h.customer_id);
        const m = [h.serial_no ? `S/N ${h.serial_no}` : "", [h.brand, h.model_no].filter(Boolean).join(" ")].filter(Boolean).join(" ");
        if (ex) ex.match = ex.match ? `${ex.match}; ${m}` : m;
        else map.set(h.customer_id, {
          id: h.customer_id, name: h.customer_name ?? "", company: h.company, phone: h.phone ?? "", whatsapp_phone: h.whatsapp_phone,
          email: h.email, address: h.address, city: h.city, pincode: h.pincode, match: m,
        });
      }
      setList([...map.values()]);
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  const open = useCallback(async (c: Cust) => {
    setSel(c); setForm(c); setMsg(""); setError("");
    const { data } = await supabase
      .from("job_cards")
      .select("id,job_no,rma_no,received_at,status,reported_problem,action_taken,device:devices(serial_no,brand,model_no),repair:profiles!job_cards_repair_engineer_fkey(full_name)")
      .eq("customer_id", c.id)
      .order("received_at", { ascending: false });
    setJobs((data ?? []) as unknown as JobLine[]);
  }, []);

  const byDevice = useMemo(() => {
    const m = new Map<string, { label: string; jobs: JobLine[] }>();
    for (const j of jobs) {
      const key = (j.device?.serial_no ?? "").toUpperCase() || `nodev-${j.id}`;
      const label = [j.device?.brand, j.device?.model_no].filter(Boolean).join(" ") + (j.device?.serial_no ? ` - S/N ${j.device.serial_no}` : "");
      if (!m.has(key)) m.set(key, { label: label || "Product", jobs: [] });
      m.get(key)!.jobs.push(j);
    }
    return [...m.values()];
  }, [jobs]);

  async function save() {
    if (!form) return;
    const { error } = await supabase.from("customers").update({
      name: form.name.trim(), company: form.company?.trim() || null, phone: form.phone.trim(),
      whatsapp_phone: form.whatsapp_phone?.trim() || null, email: form.email?.trim() || null,
      address: form.address?.trim() || null, city: form.city?.trim() || null, pincode: form.pincode?.trim() || null,
    }).eq("id", form.id);
    if (error) return setError(error.message);
    setError(""); setMsg("Saved"); setTimeout(() => setMsg(""), 2000);
    setSel(form);
    setList((l) => l.map((c) => (c.id === form.id ? { ...c, ...form } : c)));
  }

  const inp = "field field-sm mt-1 w-full";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Customers and products</h1>
        <p className="text-sm text-slate-600">Search by serial number, model, customer name, phone, RMA number or job number to see the full call history.</p>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search (at least 3 characters)" className="field w-full max-w-xl" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="panel max-h-[70vh] overflow-auto lg:col-span-1">
          {list.length === 0 && <div className="p-4 text-sm text-slate-500">No customers found.</div>}
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <button onClick={() => open(c)} className={`block w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${sel?.id === c.id ? "bg-slate-50" : ""}`}>
                  <div className="font-medium text-ink">{c.name}{c.company ? ` (${c.company})` : ""}</div>
                  <div className="mono text-xs text-slate-500">{c.phone}{c.city ? ` - ${c.city}` : ""}</div>
                  {c.match && <div className="text-xs text-slate-600">{c.match}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5 lg:col-span-2">
          {!sel || !form ? (
            <div className="panel p-6 text-sm text-slate-500">Select a customer to see the details and every call, product by product.</div>
          ) : (
            <>
              <div className="panel p-5">
                <h2 className="mb-3 font-medium">Customer details</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  {([["name", "Name"], ["company", "Company"], ["phone", "Phone"], ["whatsapp_phone", "WhatsApp"], ["email", "Email"], ["city", "City"], ["pincode", "Pincode"]] as const).map(([k, l]) => (
                    <label key={k} className="block text-xs text-slate-600">{l}
                      <input value={(form[k] as string | null) ?? ""} disabled={!canEdit} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp} />
                    </label>
                  ))}
                  <label className="block text-xs text-slate-600 md:col-span-3">Address
                    <input value={form.address ?? ""} disabled={!canEdit} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp} />
                  </label>
                </div>
                {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
                {canEdit && (
                  <div className="mt-3 flex items-center gap-3">
                    <button className="btn btn-primary btn-sm" onClick={save}>Save customer</button>
                    {msg && <span className="text-sm text-emerald-700">{msg}</span>}
                  </div>
                )}
              </div>

              <div className="panel p-5">
                <h2 className="mb-1 font-medium">Call history ({jobs.length} call{jobs.length === 1 ? "" : "s"}, {byDevice.length} product{byDevice.length === 1 ? "" : "s"})</h2>
                {byDevice.map((d, i) => (
                  <div key={i} className="mt-3">
                    <div className="text-sm font-medium text-ink">{d.label} <span className="font-normal text-slate-500">- {d.jobs.length} call(s)</span></div>
                    <ul className="mt-1 divide-y divide-line rounded border border-line bg-white text-sm">
                      {d.jobs.map((j) => (
                        <li key={j.id} className="px-3 py-2">
                          <Link href={`/jobs/${j.id}`} className="font-medium text-blue-700 underline">{j.job_no}</Link>
                          {j.rma_no && <span className="mono ml-2 text-xs text-slate-600">RMA {j.rma_no}</span>}
                          <span className="ml-2 text-xs text-slate-500">{fmtDateTime(j.received_at)} - {STATUS_LABEL[j.status as keyof typeof STATUS_LABEL] ?? j.status}{j.repair ? ` - ${j.repair.full_name}` : ""}</span>
                          {j.reported_problem && <div className="text-xs text-slate-600">Problem: {j.reported_problem}</div>}
                          {j.action_taken && <div className="text-xs text-slate-600">Action: {j.action_taken}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
