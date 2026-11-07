"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { fmtDateTime, money } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { StockItem, StockMove } from "@/lib/types";

type Panel = { id: string; kind: "in" | "fix" | "edit" } | null;

const KIND_LABEL: Record<StockMove["kind"], string> = {
  opening: "Opening stock",
  purchase: "Stock added",
  issue: "Issued to job",
  return: "Returned from job",
  adjust: "Count corrected",
};

function Kpi({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-sm text-slate-600">{label}</div>
      <div className={`mono mt-1 text-2xl font-medium tracking-tight ${tone || "text-ink"}`}>{value}</div>
    </div>
  );
}

function StockInner() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const params = useSearchParams();
  const [tab, setTab] = useState<"items" | "ledger">(params.get("tab") === "ledger" ? "ledger" : "items");
  const [items, setItems] = useState<StockItem[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(params.get("low") === "1");
  const [showOff, setShowOff] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<"product" | "service">("product");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("parts").select("id,part_number,description,price,active,stock_qty,min_stock,is_service,track_serial,is_head,product_name,part_category,ref_no,specification,manufacturer_code,remark").order("description"),
      supabase
        .from("stock_moves")
        .select("id,part_id,qty_change,kind,job_id,job_part_id,note,created_by,created_at, part:parts(description), by:profiles(full_name), job:job_cards(job_no)")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    let costs = new Map<string, number>();
    if (isAdmin) {
      const c = await supabase.rpc("admin_part_costs");
      costs = new Map(((c.data ?? []) as { part_id: string; cost_price: number }[]).map((x) => [x.part_id, Number(x.cost_price)]));
    }
    if (a.error) setError(a.error.message);
    else setItems(((a.data ?? []) as StockItem[]).map((x) => ({ ...x, cost_price: costs.get(x.id) ?? 0 })));
    if (!b.error) setMoves((b.data ?? []) as unknown as StockMove[]);
  }, [isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  }

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (showOff || i.active) &&
        (!lowOnly || (!i.is_service && i.min_stock > 0 && i.stock_qty <= i.min_stock)) &&
        (!term || i.description.toLowerCase().includes(term) || (i.part_number ?? "").toLowerCase().includes(term))
    );
  }, [items, q, lowOnly, showOff]);

  const kpi = useMemo(() => {
    const all = items.filter((i) => i.active);
    const act = all.filter((i) => !i.is_service);
    return {
      count: all.length,
      atCost: act.reduce((s, i) => s + i.stock_qty * Number(i.cost_price), 0),
      atSell: act.reduce((s, i) => s + i.stock_qty * Number(i.price), 0),
      low: act.filter((i) => i.min_stock > 0 && i.stock_qty <= i.min_stock).length,
      out: act.filter((i) => i.stock_qty <= 0).length,
    };
  }, [items]);

  const serialList = (v: FormDataEntryValue | null) =>
    String(v ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

  async function addStock(i: StockItem, f: FormData, kind: "purchase" | "adjust") {
    const serials = kind === "purchase" ? serialList(f.get("serials")) : [];
    if (serials.length > 0) {
      const cost = String(f.get("cost") ?? "").trim();
      const r = await supabase.rpc("stock_add_serials", {
        p_part: i.id, p_serials: serials, p_cost: cost !== "" ? Number(cost) : null, p_note: String(f.get("note") ?? "").trim() || null,
      });
      if (r.error) return setError(r.error.message);
      setError(""); setPanel(null); flash(`${serials.length} item(s) with serial numbers added to ${i.description}`); load();
      return;
    }
    const raw = Number(f.get("qty"));
    if (!Number.isFinite(raw) || raw === 0 || !Number.isInteger(raw)) return setError("Quantity must be a whole number");
    let qty = raw;
    if (kind === "adjust") qty = raw - i.stock_qty; // raw = counted quantity
    if (kind === "adjust" && qty === 0) return setError("The count is unchanged; nothing to adjust");
    const cost = String(f.get("cost") ?? "").trim();
    const { error } = await supabase.rpc("stock_add", {
      p_part: i.id,
      p_qty: qty,
      p_kind: kind,
      p_cost: kind === "purchase" && cost !== "" ? Number(cost) : null,
      p_note: String(f.get("note") ?? "").trim() || null,
    });
    if (error) return setError(error.message);
    setError("");
    setPanel(null);
    flash(kind === "purchase" ? `${qty} added to ${i.description}` : `${i.description} count corrected`);
    load();
  }

  async function deleteItem(i: StockItem) {
    if (!confirm(`Delete "${i.description}" permanently? Its stock history will also be removed.`)) return;
    const { error } = await supabase.from("parts").delete().eq("id", i.id);
    if (error) {
      if (error.code === "23503") {
        // used in an old job, so it cannot be deleted: hide it instead
        await supabase.from("parts").update({ active: false }).eq("id", i.id);
        setError("");
        flash(`"${i.description}" is used in earlier jobs, so it was marked inactive instead of deleted.`);
        setPanel(null);
        load();
        return;
      }
      return setError(error.message);
    }
    setError("");
    setPanel(null);
    flash("Deleted");
    load();
  }

  async function saveItem(i: StockItem, f: FormData) {
    const { error } = await supabase
      .from("parts")
      .update({
        description: String(f.get("description")).trim(),
        part_number: String(f.get("part_number") ?? "").trim() || null,
        ...(isAdmin ? { cost_price: Number(f.get("cost_price")) || 0 } : {}),
        price: Number(f.get("price")) || 0,
        min_stock: f.get("is_service") === "on" ? 0 : Math.max(0, parseInt(String(f.get("min_stock"))) || 0),
        is_service: f.get("is_service") === "on",
        is_head: f.get("is_head") === "on",
        product_name: String(f.get("product_name") ?? "").trim() || null,
        part_category: String(f.get("part_category") ?? "").trim() || null,
        ref_no: String(f.get("ref_no") ?? "").trim() || null,
        specification: String(f.get("specification") ?? "").trim() || null,
        manufacturer_code: String(f.get("manufacturer_code") ?? "").trim() || null,
        remark: String(f.get("remark") ?? "").trim() || null,
        active: f.get("active") === "on",
      })
      .eq("id", i.id);
    if (error) return setError(error.message);
    setError("");
    setPanel(null);
    flash("Saved");
    load();
  }

  async function createItem(f: FormData) {
    const isService = newKind === "service";
    const serials = isService ? [] : serialList(f.get("serials"));
    const qty = isService ? 0 : serials.length > 0 ? serials.length : parseInt(String(f.get("qty"))) || 0;
    const { data, error } = await supabase
      .from("parts")
      .insert({
        description: String(f.get("description")).trim(),
        part_number: String(f.get("part_number") ?? "").trim() || null,
        ...(isAdmin && !isService ? { cost_price: Number(f.get("cost_price")) || 0 } : {}),
        price: Number(f.get("price")) || 0,
        min_stock: isService ? 0 : Math.max(0, parseInt(String(f.get("min_stock"))) || 0),
        is_service: isService,
      })
      .select("id")
      .single();
    if (error) return setError(error.message);
    if (serials.length > 0) {
      const r = await supabase.rpc("stock_add_serials", { p_part: data.id, p_serials: serials, p_cost: null, p_note: "Opening stock" });
      if (r.error) return setError(r.error.message);
    } else if (qty > 0) {
      const r = await supabase.rpc("stock_add", { p_part: data.id, p_qty: qty, p_kind: "opening", p_cost: null, p_note: "Opening stock" });
      if (r.error) return setError(r.error.message);
    }
    setError("");
    setAdding(false);
    flash("Item added");
    load();
  }

  function exportCsv() {
    downloadCsv(
      "stock.csv",
      isAdmin ? ["Item", "Part no", "In stock", "Min stock", "Cost price", "Selling price", "Stock value (cost)", "Stock value (selling)"] : ["Item", "Part no", "In stock", "Min stock", "Selling price", "Stock value (selling)"],
      shown.map((i) => isAdmin ? [i.description + (i.is_service ? " (service)" : ""), i.part_number, i.is_service ? "" : i.stock_qty, i.min_stock, i.cost_price, i.price, i.stock_qty * i.cost_price, i.stock_qty * i.price] : [i.description + (i.is_service ? " (service)" : ""), i.part_number, i.is_service ? "" : i.stock_qty, i.min_stock, i.price, i.stock_qty * i.price])
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Stock</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Quantity and selling price of every part{isAdmin ? ", plus cost price" : ""}. Stock goes down when a part is marked issued on a job.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn btn-ghost">Download CSV</button>
          <Link href="/data" className="btn btn-ghost">Import / Export Excel</Link>
          <button onClick={() => setAdding((v) => !v)} className="btn btn-primary">{adding ? "Close" : "Add item"}</button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {msg && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</p>}

      <section className="panel grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <Kpi label="Items" value={kpi.count} />
        {isAdmin && <Kpi label="Stock value at cost" value={money(kpi.atCost)} />}
        <Kpi label="Stock value at selling price" value={money(kpi.atSell)} />
        <Kpi label="Low or out of stock" value={`${kpi.low} low, ${kpi.out} out`} tone={kpi.low + kpi.out > 0 ? "text-red-700" : ""} />
      </section>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createItem(new FormData(e.currentTarget));
          }}
          className="panel grid gap-3 p-5 md:grid-cols-6"
        >
          <div className="md:col-span-6 inline-flex w-fit rounded-md border border-line p-0.5 text-sm" role="group" aria-label="Item type">
            {(["product", "service"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={newKind === k}
                onClick={() => setNewKind(k)}
                className={`rounded px-4 py-1.5 font-medium ${newKind === k ? "bg-ink text-white" : "text-slate-600 hover:text-ink"}`}
              >
                {k === "product" ? "Product (has stock)" : "Service (no quantity)"}
              </button>
            ))}
          </div>
          <label className="md:col-span-2 text-xs text-slate-600">{newKind === "service" ? "Service name" : "Item name"}
            <input name="description" required className="field mt-1 w-full" placeholder={newKind === "service" ? "e.g. Service charges, Software installation" : "e.g. Epson L3250 print head"} />
          </label>
          <label className="text-xs text-slate-600">Part number
            <input name="part_number" className="field mt-1 w-full" />
          </label>
          {isAdmin && newKind === "product" && (
            <label className="text-xs text-slate-600">Cost price
              <input name="cost_price" type="number" min="0" step="0.01" defaultValue="0" className="field mt-1 w-full" />
            </label>
          )}
          <label className="text-xs text-slate-600">{newKind === "service" ? "Service charge" : "Selling price"}
            <input name="price" type="number" min="0" step="0.01" defaultValue="0" className="field mt-1 w-full" />
          </label>
          {newKind === "product" && (
            <>
              <label className="text-xs text-slate-600">Quantity now
                <input name="qty" type="number" min="0" step="1" defaultValue="0" className="field mt-1 w-full" />
              </label>
              <label className="text-xs text-slate-600">Alert when stock is at or below
                <input name="min_stock" type="number" min="0" step="1" defaultValue="0" className="field mt-1 w-full" />
              </label>
              <label className="text-xs text-slate-600 md:col-span-5">Serial numbers (optional, one per line; quantity then equals the number of serials)
                <textarea name="serials" rows={2} className="field mono mt-1 w-full" placeholder="SN001&#10;SN002" />
              </label>
            </>
          )}
          <div className="flex items-end md:col-span-5">
            <button className="btn btn-primary">Save item</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-line bg-white text-sm">
          {(["items", "ledger"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 ${tab === t ? "bg-ink text-white" : "hover:bg-slate-50"}`}
            >
              {t === "items" ? "Items" : "Stock history"}
            </button>
          ))}
        </div>
        {tab === "items" && (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item or part number" aria-label="Search stock" className="field min-w-64 flex-1" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show hidden items</label>
          </>
        )}
      </div>

      {tab === "items" ? (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Item</th>
                <th className="th text-right">In stock</th>
                {isAdmin && <th className="th text-right">Cost price</th>}
                <th className="th text-right">Selling price</th>
                {isAdmin && <th className="th text-right">Margin</th>}
                <th className="th text-right">{isAdmin ? "Stock value (cost)" : "Stock value (selling)"}</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const low = !i.is_service && i.min_stock > 0 && i.stock_qty <= i.min_stock;
                const open = panel?.id === i.id ? panel.kind : null;
                return (
                  <FragmentRow key={i.id}>
                    <tr className={`border-b border-line ${!i.active ? "opacity-50" : ""}`}>
                      <td className="td">
                        <div className="font-medium">{i.description}{i.is_service && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">Service</span>}</div>
                        <div className="mono text-xs text-slate-500">{i.part_number || "no part no"}{i.track_serial ? " - serial tracked" : ""}</div>
                      </td>
                      <td className="td text-right">
                        {i.is_service ? <span className="text-xs text-slate-500">no quantity</span> : <span className="mono text-base font-medium">{i.stock_qty}</span>}
                        {i.is_service ? null : i.stock_qty <= 0 ? (
                          <div className="text-xs font-medium text-red-700">Out of stock</div>
                        ) : low ? (
                          <div className="text-xs font-medium text-amber-700">Low (alert at {i.min_stock})</div>
                        ) : null}
                      </td>
                      {isAdmin && <td className="td mono text-right">{i.is_service ? "-" : money(Number(i.cost_price))}</td>}
                      <td className="td mono text-right">{money(Number(i.price))}</td>
                      {isAdmin && <td className="td mono text-right text-slate-600">{i.is_service ? "-" : money(Number(i.price) - Number(i.cost_price))}</td>}
                      <td className="td mono text-right">{i.is_service ? "-" : money(i.stock_qty * Number(isAdmin ? i.cost_price : i.price))}</td>
                      <td className="td whitespace-nowrap text-right text-xs">
                        {!i.is_service && (
                          <>
                            <button onClick={() => setPanel({ id: i.id, kind: "in" })} className="btn btn-ghost btn-sm">Add stock</button>{" "}
                            <button onClick={() => setPanel({ id: i.id, kind: "fix" })} className="btn btn-ghost btn-sm">Correct count</button>{" "}
                          </>
                        )}
                        <button onClick={() => setPanel({ id: i.id, kind: "edit" })} className="btn btn-ghost btn-sm">Edit</button>
                        {isAdmin && <button onClick={() => deleteItem(i)} className="btn btn-ghost btn-sm text-red-700">Delete</button>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-line bg-slate-50">
                        <td colSpan={7} className="px-4 py-3">
                          {open === "edit" ? (
                            <form onSubmit={(e) => { e.preventDefault(); saveItem(i, new FormData(e.currentTarget)); }} className="grid gap-3 md:grid-cols-7">
                              <label className="md:col-span-2 text-xs text-slate-600">Item name<input name="description" defaultValue={i.description} required className="field mt-1 w-full" /></label>
                              <label className="text-xs text-slate-600">Part number<input name="part_number" defaultValue={i.part_number ?? ""} className="field mt-1 w-full" /></label>
                              {isAdmin ? <label className="text-xs text-slate-600">Cost price<input name="cost_price" type="number" min="0" step="0.01" defaultValue={i.cost_price} className="field mt-1 w-full" /></label> : <span />}
                              <label className="text-xs text-slate-600">Selling price<input name="price" type="number" min="0" step="0.01" defaultValue={i.price} className="field mt-1 w-full" /></label>
                              <label className="text-xs text-slate-600">Alert at<input name="min_stock" type="number" min="0" step="1" defaultValue={i.min_stock} className="field mt-1 w-full" /></label>
                              <label className="flex items-end gap-2 pb-2 text-sm"><input name="active" type="checkbox" defaultChecked={i.active} /> Active</label>
                              <label className="md:col-span-7 flex items-center gap-2 text-sm"><input name="is_service" type="checkbox" defaultChecked={i.is_service} /> This is a <b>service</b> (no quantity, never runs out)</label>
                              <label className="md:col-span-7 flex items-center gap-2 text-sm"><input name="is_head" type="checkbox" defaultChecked={i.is_head} /> This is a <b>print head</b> (the Head ID must be entered when it is issued to a job)</label>
                              <label className="md:col-span-2 text-xs text-slate-600">Fits product<input name="product_name" defaultValue={i.product_name ?? ""} className="field mt-1 w-full" /></label>
                              <label className="text-xs text-slate-600">Part category<input name="part_category" defaultValue={i.part_category ?? ""} className="field mt-1 w-full" /></label>
                              <label className="text-xs text-slate-600">Ref no.<input name="ref_no" defaultValue={i.ref_no ?? ""} className="field mt-1 w-full" /></label>
                              <label className="text-xs text-slate-600">Manufacturer code<input name="manufacturer_code" defaultValue={i.manufacturer_code ?? ""} className="field mt-1 w-full" /></label>
                              <label className="md:col-span-2 text-xs text-slate-600">Specification<input name="specification" defaultValue={i.specification ?? ""} className="field mt-1 w-full" /></label>
                              <label className="md:col-span-7 text-xs text-slate-600">Remark<input name="remark" defaultValue={i.remark ?? ""} className="field mt-1 w-full" /></label>
                              <div className="md:col-span-7 flex gap-2"><button className="btn btn-primary btn-sm">Save</button><button type="button" onClick={() => setPanel(null)} className="btn btn-ghost btn-sm">Cancel</button></div>
                            </form>
                          ) : (
                            <form onSubmit={(e) => { e.preventDefault(); addStock(i, new FormData(e.currentTarget), open === "in" ? "purchase" : "adjust"); }} className="flex flex-wrap items-end gap-3">
                              <label className="text-xs text-slate-600">{open === "in" ? "Quantity received" : `Counted quantity now (system shows ${i.stock_qty})`}
                                <input name="qty" type="number" step="1" autoFocus className="field mt-1 w-44" />
                              </label>
                              {open === "in" && (
                                <label className="text-xs text-slate-600">Serial numbers (optional, one per line)
                                  <textarea name="serials" rows={2} className="field mono mt-1 w-56" placeholder="Leave empty if not serial-tracked" />
                                </label>
                              )}
                              {open === "in" && isAdmin && (
                                <label className="text-xs text-slate-600">New cost price (optional)
                                  <input name="cost" type="number" min="0" step="0.01" placeholder={String(i.cost_price)} className="field mt-1 w-40" />
                                </label>
                              )}
                              <label className="min-w-48 flex-1 text-xs text-slate-600">Note (supplier, bill no, reason)
                                <input name="note" className="field mt-1 w-full" />
                              </label>
                              <button className="btn btn-primary btn-sm">{open === "in" ? "Add to stock" : "Save count"}</button>
                              <button type="button" onClick={() => setPanel(null)} className="btn btn-ghost btn-sm">Cancel</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {items.length === 0 ? "No items yet. Click Add item to enter your first part." : "No item matches this filter."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">When</th>
                <th className="th">Item</th>
                <th className="th">What happened</th>
                <th className="th text-right">Qty</th>
                <th className="th">Job</th>
                <th className="th">By</th>
                <th className="th">Note</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="td whitespace-nowrap text-xs">{fmtDateTime(m.created_at)}</td>
                  <td className="td">{m.part?.description}</td>
                  <td className="td">{KIND_LABEL[m.kind]}</td>
                  <td className={`td mono text-right font-medium ${m.qty_change > 0 ? "text-emerald-700" : "text-red-700"}`}>{m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}</td>
                  <td className="td mono text-xs">{m.job ? <Link className="text-bench hover:underline" href={`/jobs?q=${encodeURIComponent(m.job.job_no)}`}>{m.job.job_no}</Link> : "-"}</td>
                  <td className="td text-xs">{m.by?.full_name ?? "-"}</td>
                  <td className="td text-xs text-slate-600">{m.note ?? ""}</td>
                </tr>
              ))}
              {moves.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No stock movement yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function StockPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
      <StockInner />
    </Suspense>
  );
}
