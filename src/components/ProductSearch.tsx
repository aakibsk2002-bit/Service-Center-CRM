"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface ProductHit {
  device_id: string;
  serial_no: string | null;
  brand: string | null;
  model_no: string | null;
  category_id: number;
  category_name: string;
  customer_id: string | null;
  customer_name: string | null;
  company: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  jobs_count: number;
  last_job_at: string | null;
  last_rma: string | null;
}

/** Search the database by serial number, model, customer name, phone, RMA or job number. */
export default function ProductSearch({ onPick, label }: { onPick: (h: ProductHit) => void; label?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setHits([]); setSearched(false); return; }
    const my = ++seq.current;
    setBusy(true);
    const h = setTimeout(async () => {
      const { data } = await supabase.rpc("find_products", { p_q: t, p_limit: 8 });
      if (my !== seq.current) return;
      setHits((data ?? []) as ProductHit[]);
      setSearched(true);
      setBusy(false);
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div className="panel p-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {label ?? "Find an existing customer / product"}
          <span className="ml-1 font-normal text-slate-400">serial no., model, name, phone or RMA</span>
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="field w-full" placeholder="Type at least 3 characters" />
      </label>
      {busy && <div className="mt-2 text-xs text-slate-500">Searching...</div>}
      {searched && !busy && hits.length === 0 && (
        <div className="mt-2 text-xs text-slate-500">No match found. Continue below to add a new customer and product.</div>
      )}
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded border border-line bg-white">
          {hits.map((h) => (
            <li key={h.device_id}>
              <button type="button" onClick={() => { onPick(h); setQ(""); setHits([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <div className="font-medium text-ink">
                  {[h.brand, h.model_no].filter(Boolean).join(" ") || h.category_name}
                  {h.serial_no && <span className="mono ml-2 text-xs text-slate-500">S/N {h.serial_no}</span>}
                </div>
                <div className="text-xs text-slate-600">
                  {h.customer_name ?? "No customer"}{h.phone ? ` - ${h.phone}` : ""}{h.city ? ` - ${h.city}` : ""}
                  {" | "}{h.jobs_count} earlier call(s){h.last_rma ? `, last RMA ${h.last_rma}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
