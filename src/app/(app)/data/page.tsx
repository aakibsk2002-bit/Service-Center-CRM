"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { rpcAll } from "@/lib/db";
import { PRESETS, todayIST } from "@/lib/dates";
import { downloadTable, readTable, type Row } from "@/lib/tabular";
import type { ReportJob } from "@/lib/types";

type Fmt = "csv" | "xlsx";
interface Result {
  row_no: number;
  job_no?: string | null;
  item?: string | null;
  error: string | null;
}

const JOB_COLS = [
  "job_no", "received_at", "status", "customer_name", "company", "phone", "email", "address", "city", "pincode",
  "category", "brand", "model_no", "serial_no", "service_type", "reported_problem", "observed_problem",
  "action_taken", "pages_in", "pages_out", "outward_at", "service_charge", "discount", "paid_amount", "payment_mode",
];
const JOB_SAMPLE = [
  "", "2026-04-10 10:30", "outward", "Rahul Patil", "ABC Traders", "9876543210", "", "Station Road", "Dhule", "424001",
  "Printer / Scanner", "HP", "LaserJet M126", "VNC3K12345", "carry_in", "Not printing", "Drum worn", "Drum replaced",
  "1200", "1260", "2026-04-12 17:00", "300", "0", "1500", "cash",
];
const RMA_COLS = [
  "SerialNumber", "RMANumber", "ItemCategory", "AreaCode", "WarrantyStatus", "RunningStatus", "ConCurrentStatus",
  "ProductModelName", "FamilyName", "GivenName", "ContactNumber", "IncomingSource", "ServiceType", "AssignedTo",
  "ServiceCenterName", "CallLogged", "Created_Date", "LastUpdated", "RMAHoldStatus", "RepairScheduledDateTime",
  "RepairScheduledDateTime2", "RepairScheduledDateTime3", "RepairScheduledDateTime4", "RepairScheduledDateTime5",
  "RepairScheduledDateTime6", "PostalCode", "CustomerAddress", "HoldFrom", "HoldTo", "SRNumber", "JRNumber",
  "SRCreatedDate", "JRCreatedDate", "Courier", "DocketNumber", "CustomerNote", "InternalNote",
];
const RMA_DATES = ["calllogged", "createddate", "lastupdated", "repairscheduleddatetime", "repairscheduleddatetime2",
  "repairscheduleddatetime3", "repairscheduleddatetime4", "repairscheduleddatetime5", "repairscheduleddatetime6",
  "holdfrom", "holdto", "srcreateddate", "jrcreateddate"];
const RMA_SAMPLE = RMA_COLS.map((c) =>
  ({ SerialNumber: "VNC3K12345", RMANumber: "RMA1001", ItemCategory: "Printer", WarrantyStatus: "In Warranty", RunningStatus: "Open",
     ProductModelName: "L3250", FamilyName: "Patil", GivenName: "Rahul", ContactNumber: "9876543210", ServiceType: "Carry In",
     CallLogged: "10/11/2026 10:30", PostalCode: "424001", CustomerAddress: "Station Road, Dhule", CustomerNote: "Not printing" } as Record<string, string>)[c] ?? "");
const STOCK_COLS = ["Product Name", "Part Category", "RefNo.", "Part Code", "Part Name", "Specification", "Manufacturer Code", "Qty", "Sales Price (INR)", "Remark"];
const STOCK_SAMPLE = ["L3250", "Head", "1", "PH-3250", "Print Head L3250", "", "M-100", "5", "3500", ""];
/** Header names are matched loosely: "Sales Price (INR)" -> salespriceinr, "Created_Date" -> createddate. */
const flatKeys = (r: Row) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_/g, ""), v]));
const PART_COLS = ["part_number", "description", "price", "cost_price", "min_stock", "is_service", "add_qty", "serial_nos"];
const PART_SAMPLE = ["D12", "Drum 12A", "900", "650", "2", "no", "5", ""];

const ymd = (ts: string | null) => (ts ? new Date(ts).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16) : "");

/** "2026-04-10 10:30" or "10/04/2026" -> ISO with India offset */
function toIso(v: string): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  const dm = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}T${(dm[4] ?? "00").padStart(2, "0")}:${dm[5] ?? "00"}:00+05:30`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+05:30`;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) return `${s.replace(" ", "T")}${s.length === 16 ? ":00" : ""}+05:30`;
  return s;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-5">
      <h2 className="mb-3 text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Importer({
  label, columns, sample, fn, map, filename, params,
}: {
  label: string;
  columns: string[];
  sample: string[];
  fn: "import_jobs" | "import_parts" | "import_rma_calls" | "import_stock_list";
  params?: Record<string, unknown>;
  map: (r: Row) => Record<string, unknown>;
  filename: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);

  const pick = async (f: File | null) => {
    setError(""); setResults(null); setRows([]); setFileName("");
    if (!f) return;
    try {
      const r = await readTable(f);
      if (r.length === 0) throw new Error("No data rows found. The first row must contain the column names.");
      setRows(r); setFileName(f.name);
    } catch (e) { setError((e as Error).message); }
  };

  const run = async () => {
    setBusy(true); setError("");
    const all: Result[] = [];
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100).map(map);
        const { data, error } = await supabase.rpc(fn, { p_rows: chunk, ...(params ?? {}) });
        if (error) throw new Error(error.message);
        for (const x of (data ?? []) as Result[]) all.push({ ...x, row_no: x.row_no + i });
      }
      setResults(all);
    } catch (e) {
      setError((e as Error).message);
      if (all.length) setResults(all);
    }
    setBusy(false);
  };

  const ok = results?.filter((r) => !r.error).length ?? 0;
  const skipped = results?.filter((r) => r.error?.startsWith("Skipped")).length ?? 0;
  const bad = results?.filter((r) => r.error && !r.error.startsWith("Skipped")) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => downloadTable(`${filename}-template.csv`, columns, [sample], "csv")}>Download CSV template</button>
        <button className="btn" onClick={() => downloadTable(`${filename}-template.xlsx`, columns, [sample], "xlsx")}>Download Excel template</button>
      </div>
      <div>
        <label className="text-sm text-slate-600">{label} (.csv or .xlsx)</label>
        <input type="file" accept=".csv,.xlsx" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="field mt-1 block w-full max-w-md" />
      </div>
      {rows.length > 0 && (
        <div className="text-sm">
          <b>{rows.length}</b> rows read from {fileName}. Columns found: <span className="mono text-xs">{Object.keys(rows[0]).join(", ")}</span>
          <div className="mt-2">
            <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? "Importing..." : `Import ${rows.length} rows`}</button>
          </div>
        </div>
      )}
      {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</div>}
      {results && (
        <div className="text-sm">
          <div className="font-medium">{ok} imported{skipped > 0 ? `, ${skipped} skipped (already in the system)` : ""}, {bad.length} failed.</div>
          {bad.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-auto rounded border border-line bg-white p-2">
              {bad.map((b) => (
                <li key={b.row_no} className="text-red-700">Row {b.row_no + 1}: {b.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [kind, setKind] = useState<"open" | "done">("done");
  const [from, setFrom] = useState(PRESETS[3].range().from);
  const [to, setTo] = useState(todayIST());
  const [fmt, setFmt] = useState<Fmt>("xlsx");
  const [stockExtra, setStockExtra] = useState(false);
  const [stockMode, setStockMode] = useState<"add" | "set">("add");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const exportJobs = async () => {
    setBusy("jobs"); setError("");
    try {
      const base = { p_from: kind === "open" ? "2000-01-01" : from, p_to: kind === "open" ? todayIST() : to, p_field: kind === "open" ? "received" : "outward" };
      let list = await rpcAll<ReportJob>("report_jobs", base);
      if (kind === "open") list = list.filter((j) => j.status !== "outward");
      else list = list.filter((j) => j.status === "outward");
      const ids = list.map((j) => j.job_id);
      const extra = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("job_cards")
          .select("id,rma_no,reported_problem,internal_note,warranty_status,service_type,updated_at,received_at,customer:customers(address,pincode),info:job_call_info(*)")
          .in("id", ids.slice(i, i + 100));
        if (error) throw new Error(error.message);
        for (const d of (data ?? []) as unknown as Record<string, unknown>[]) extra.set(d.id as string, d);
      }
      const WAR: Record<string, string> = { in_warranty: "In Warranty", out_of_warranty: "Out of Warranty", amc: "AMC", unknown: "" };
      const rows = list.map((j) => {
        const x = (extra.get(j.job_id) ?? {}) as Record<string, unknown> & { customer?: Record<string, string | null>; info?: Record<string, unknown> | null };
        const c = x.customer ?? {};
        const inf = (x.info ?? {}) as Record<string, string | string[] | null>;
        const parts = (j.customer_name ?? "").trim().split(/\s+/);
        const family = parts.length > 1 ? parts[parts.length - 1] : "";
        const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
        const sch = ((inf.schedule as string[] | undefined) ?? []).map((v) => ymd(v));
        const running = (inf.running_status as string) || (j.status === "outward" ? "Closed" : j.status === "ready" ? "Ready" : "Open");
        const d = (v: unknown) => ymd((v as string) ?? null);
        return [
          j.serial_no, x.rma_no as string, j.category_name, inf.area_code, WAR[(x.warranty_status as string) ?? "unknown"], running, inf.concurrent_status,
          [j.brand, j.model_no].filter(Boolean).join(" "), family, given, j.phone, inf.incoming_source,
          x.service_type === "onsite" ? "On Site" : "Carry In", (inf.assigned_to_name as string) || j.repair_by_name, inf.service_center,
          d(inf.call_logged_at ?? x.received_at), d(x.received_at), d(x.updated_at), inf.rma_hold_status,
          sch[0] ?? "", sch[1] ?? "", sch[2] ?? "", sch[3] ?? "", sch[4] ?? "", sch[5] ?? "",
          c.pincode, c.address, d(inf.hold_from), d(inf.hold_to), inf.sr_no, inf.jr_no, d(inf.sr_created), d(inf.jr_created),
          inf.courier, inf.docket_no, x.reported_problem as string, x.internal_note as string,
        ];
      });
      if (rows.length === 0) throw new Error("No jobs found for this selection.");
      await downloadTable(`${kind === "open" ? "inward-calls" : "done-calls"}_${todayIST()}.csv`, RMA_COLS, rows as never, fmt);
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };

  const exportStock = async () => {
    setBusy("stock"); setError("");
    try {
      const { data, error } = await supabase
        .from("parts")
        .select("id,part_number,description,price,active,stock_qty,min_stock,is_service,product_name,part_category,ref_no,specification,manufacturer_code,remark")
        .order("description");
      if (error) throw new Error(error.message);
      const costs = new Map<string, number>();
      if (isAdmin && stockExtra) {
        const c = await supabase.rpc("admin_part_costs");
        for (const r of (c.data ?? []) as { part_id: string; cost_price: number }[]) costs.set(r.part_id, Number(r.cost_price));
      }
      const serMap = new Map<string, string[]>();
      if (stockExtra) {
        const ser = await supabase.from("part_serials").select("part_id,serial_no,status").eq("status", "in_stock");
        for (const s of (ser.data ?? []) as { part_id: string; serial_no: string }[]) serMap.set(s.part_id, [...(serMap.get(s.part_id) ?? []), s.serial_no]);
      }
      const head = [...STOCK_COLS, ...(stockExtra ? [...(isAdmin ? ["Cost Price (INR)"] : []), "Min Stock", "Is Service", "Serial Nos"] : [])];
      const rows = (data ?? []).map((p) => [
        p.product_name, p.is_service ? "Service" : p.part_category, p.ref_no, p.part_number, p.description, p.specification, p.manufacturer_code,
        p.is_service ? "" : p.stock_qty, p.price, p.remark,
        ...(stockExtra ? [...(isAdmin ? [costs.get(p.id) ?? 0] : []), p.min_stock, p.is_service ? "yes" : "no", (serMap.get(p.id) ?? []).join("; ")] : []),
      ]);
      await downloadTable(`stock_${todayIST()}.csv`, head, rows, fmt);
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };

  const mapJob = (r: Row) => ({ ...r, received_at: toIso(r.received_at), outward_at: toIso(r.outward_at) });
  const partCols = isAdmin ? PART_COLS : PART_COLS.filter((c) => c !== "cost_price");
  const partSample = isAdmin ? PART_SAMPLE : PART_SAMPLE.filter((_, i) => PART_COLS[i] !== "cost_price");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Import / Export</h1>
        <p className="text-sm text-slate-600">Move job and stock data in and out using CSV or Excel files.</p>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-3 text-sm">
        <span className="text-slate-600">Export format</span>
        <select className="field" value={fmt} onChange={(e) => setFmt(e.target.value as Fmt)}>
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="csv">CSV</option>
        </select>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Box title="Export calls">
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <button className={`btn ${kind === "done" ? "btn-primary" : ""}`} onClick={() => setKind("done")}>Done calls (outward)</button>
              <button className={`btn ${kind === "open" ? "btn-primary" : ""}`} onClick={() => setKind("open")}>Inward calls (still open)</button>
            </div>
            {kind === "done" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-600">Outward date</span>
                <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span>to</span>
                <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            ) : (
              <p className="text-slate-600">All calls that have been received but not yet handed back.</p>
            )}
            <button className="btn btn-primary" disabled={busy === "jobs"} onClick={exportJobs}>{busy === "jobs" ? "Preparing..." : "Export"}</button>
          </div>
        </Box>

        <Box title="Export stock">
          <p className="mb-3 text-sm text-slate-600">All stock items in the standard stock-list format (Product Name, Part Category, RefNo., Part Code, Part Name, Specification, Manufacturer Code, Qty, Sales Price, Remark).</p>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={stockExtra} onChange={(e) => setStockExtra(e.target.checked)} /> Include extra columns ({isAdmin ? "cost, " : ""}minimum stock, serial numbers)</label>
          <button className="btn btn-primary" disabled={busy === "stock"} onClick={exportStock}>{busy === "stock" ? "Preparing..." : "Export stock"}</button>
        </Box>

        <Box title="Import calls (RMA list)">
          <p className="mb-3 text-sm text-slate-600">
            Use the call list exported from your service portal (SerialNumber, RMANumber, ItemCategory ... InternalNote).
            If a <b>SerialNumber</b> already exists, the existing customer and product are reused and only a new call is added with the new RMA number.
            A call whose <b>RMANumber</b> is already in the system is skipped, so the same file can be imported again safely.
            New customers need GivenName / FamilyName and ContactNumber.
          </p>
          <Importer label="RMA calls file" columns={RMA_COLS} sample={RMA_SAMPLE} fn="import_rma_calls"
            map={(r) => { const f = flatKeys(r) as Record<string, string>; for (const k of RMA_DATES) if (f[k]) f[k] = toIso(f[k]); return f; }} filename="rma-calls" />
        </Box>

        <Box title="Import stock list">
          <p className="mb-3 text-sm text-slate-600">
            Columns: Product Name, Part Category, RefNo., Part Code, Part Name, Specification, Manufacturer Code, Qty, Sales Price (INR), Remark.
            Items are matched by Part Code (or Part Name). New items are created; existing items are updated.
            Optional extra columns: Cost Price (INR){isAdmin ? "" : " (admin only)"}, Min Stock, Is Service, Serial Nos (separated by ;).
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Qty means</span>
            <select className="field" value={stockMode} onChange={(e) => setStockMode(e.target.value as "add" | "set")}>
              <option value="add">Add this quantity to current stock</option>
              <option value="set">Set stock to exactly this quantity</option>
            </select>
          </div>
          <Importer label="Stock list file" columns={STOCK_COLS} sample={STOCK_SAMPLE} fn="import_stock_list"
            map={(r) => flatKeys(r)} params={{ p_mode: stockMode }} filename="stock-list" />
        </Box>

        <details className="panel p-5 lg:col-span-2">
          <summary className="cursor-pointer text-base font-semibold text-ink">Older simple templates (own call history, stock with add_qty)</summary>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <Box title="Import calls (simple template)">
              <Importer label="Calls file" columns={JOB_COLS} sample={JOB_SAMPLE} fn="import_jobs" map={mapJob} filename="calls" />
            </Box>
            <Box title="Import stock (simple template)">
              <Importer label="Stock file" columns={partCols} sample={partSample} fn="import_parts" map={(r) => r} filename="stock" />
            </Box>
          </div>
        </details>
      </div>
    </div>
  );
}
