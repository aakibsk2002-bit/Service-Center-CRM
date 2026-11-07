"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { rpcAll } from "@/lib/db";
import { fmtDateTime, fmtDate, money } from "@/lib/format";
import { todayIST, fmtYmd } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { useAuth } from "@/components/AuthProvider";
import { StatusBadge } from "@/components/JobTable";
import DataTable, { type Col } from "@/components/reports/DataTable";
import Filters, { TABS, useReportParams, type RP } from "@/components/reports/Filters";
import { MODE_LABEL } from "@/lib/types";
import type { VisitRow } from "@/lib/types";
import type { ReportJob, DayEvent, Summary, CustomerRow, EngineerRow } from "@/lib/types";

function useReport<T>(key: string, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: "", data: null, error: null });
  useEffect(() => {
    let live = true;
    load()
      .then((data) => live && setState({ key, data, error: null }))
      .catch((e: Error) => live && setState({ key, data: null, error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const loading = state.key !== key;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading };
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: "good" | "bad"; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mono mt-1 text-2xl font-semibold ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-ink"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const jobLink = (id: string, no: string) => (
  <Link href={`/jobs/${id}`} className="mono whitespace-nowrap font-medium text-bench hover:underline">{no}</Link>
);

function SummaryTab({ p, admin }: { p: RP; admin: boolean }) {
  const { data, error, loading } = useReport(`s|${p.from}|${p.to}`, async () => {
    const { data, error } = await supabase.rpc("report_summary", { p_from: p.from, p_to: p.to });
    if (error) throw new Error(error.message);
    return data as Summary;
  });
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const s = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Jobs received" value={String(s.jobs_in)} />
        <Kpi label="Marked ready" value={String(s.jobs_ready)} />
        <Kpi label="Outward (closed)" value={String(s.jobs_out)} />
        <Kpi label="Credit outstanding" value={money(s.credit_outstanding)} tone={s.credit_outstanding > 0 ? "bad" : undefined} hint="All time, not only this period" />
        <Kpi label="Billed (outward jobs)" value={money(s.revenue)} />
        {admin && <Kpi label="Parts cost" value={money(s.parts_cost)} />}
        {admin && <Kpi label="Profit" value={money(s.profit)} tone="good" hint="Bill minus parts cost" />}
        <Kpi label="Credit given" value={money(s.credit_given)} />
        <Kpi label="Cash received" value={money(s.cash)} />
        <Kpi label="Online received" value={money(s.online)} />
        <Kpi label="Total collected" value={money(s.cash + s.online)} tone="good" />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">By product type</h2>
        <DataTable
          rows={s.by_category ?? []}
          rowKey={(r) => r.category}
          filename={`category-summary_${p.from}_${p.to}.csv`}
          defaultSort={{ key: "revenue", dir: "desc" }}
          cols={[
            { key: "category", label: "Product type", value: (r) => r.category },
            { key: "jobs", label: "Jobs", kind: "number", sum: true, value: (r) => r.jobs },
            { key: "revenue", label: "Billed", kind: "money", sum: true, value: (r) => r.revenue },
            ...(admin ? [{ key: "profit", label: "Profit", kind: "money" as const, sum: true, value: (r: { profit: number }) => r.profit }] : []),
          ]}
        />
      </div>
    </div>
  );
}

const ymKey = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date(ts));
const ymLabel = (k: string) => new Date(k + "-01T00:00:00").toLocaleString("en-IN", { month: "short", year: "numeric" });

function MonthlyTab({ p, admin }: { p: RP; admin: boolean }) {
  const { data, error, loading } = useReport(`m|${p.from}|${p.to}`, async () => {
    const base = { p_from: p.from, p_to: p.to, p_category: null, p_status: null, p_engineer: null, p_q: null, p_payment: null };
    const [rec, rdy, out] = await Promise.all(
      ["received", "ready", "outward"].map((f) => rpcAll<ReportJob>("report_jobs", { ...base, p_field: f }))
    );
    return { rec, rdy, out };
  });
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const { rec, rdy, out } = data;
  const months = [...new Set([
    ...rec.map((r) => ymKey(r.received_at)),
    ...rdy.filter((r) => r.ready_at).map((r) => ymKey(r.ready_at!)),
    ...out.filter((r) => r.outward_at).map((r) => ymKey(r.outward_at!)),
  ])].sort();
  type M = { month: string; label: string; received: number; ready: number; outward: number; billed: number; profit: number };
  const rows: M[] = months.map((m) => {
    const o = out.filter((r) => r.outward_at && ymKey(r.outward_at) === m);
    return {
      month: m, label: ymLabel(m),
      received: rec.filter((r) => ymKey(r.received_at) === m).length,
      ready: rdy.filter((r) => r.ready_at && ymKey(r.ready_at) === m).length,
      outward: o.length,
      billed: o.reduce((s, r) => s + r.total, 0),
      profit: o.reduce((s, r) => s + r.profit, 0),
    };
  });
  const cols: Col<M>[] = [
    { key: "month", label: "Month", value: (r) => r.month, render: (r) => <span className="font-medium">{r.label}</span> },
    { key: "received", label: "Received", kind: "number", sum: true, value: (r) => r.received },
    { key: "ready", label: "Repaired (ready)", kind: "number", sum: true, value: (r) => r.ready },
    { key: "outward", label: "Outward", kind: "number", sum: true, value: (r) => r.outward },
    { key: "billed", label: "Billed", kind: "money", sum: true, value: (r) => r.billed },
    ...(admin ? [{ key: "profit", label: "Profit", kind: "money" as const, sum: true, value: (r: M) => r.profit }] : []),
  ];

  // engineer x month: jobs marked ready by each repair engineer
  const engs = [...new Set(rdy.filter((r) => r.ready_at).map((r) => r.repair_by_name ?? "(unassigned)"))].sort();
  const cell = (e: string, m: string) => rdy.filter((r) => r.ready_at && (r.repair_by_name ?? "(unassigned)") === e && ymKey(r.ready_at) === m).length;
  const exportEng = () =>
    downloadCsv(`engineer-monthly_${p.from}_${p.to}.csv`, ["Engineer", ...months.map(ymLabel), "Total"],
      engs.map((e) => [e, ...months.map((m) => cell(e, m)), months.reduce((s, m) => s + cell(e, m), 0)]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Month by month</h2>
        <DataTable rows={rows} cols={cols} rowKey={(r) => r.month} defaultSort={{ key: "month", dir: "asc" }} filename={`monthly_${p.from}_${p.to}.csv`} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Engineer wise, jobs repaired each month</h2>
          <button onClick={exportEng} disabled={!engs.length} className="btn btn-ghost btn-sm print:hidden">Download CSV</button>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Engineer</th>
                {months.map((m) => <th key={m} className="th text-right whitespace-nowrap">{ymLabel(m)}</th>)}
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {engs.map((e) => (
                <tr key={e} className="border-b border-line last:border-0">
                  <td className="td font-medium">{e}</td>
                  {months.map((m) => <td key={m} className="td mono text-right">{cell(e, m) || <span className="text-slate-300">-</span>}</td>)}
                  <td className="td mono text-right font-medium">{months.reduce((s, m) => s + cell(e, m), 0)}</td>
                </tr>
              ))}
              {!engs.length && <tr><td colSpan={months.length + 2} className="px-4 py-8 text-center text-slate-500">No repaired jobs in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">To see which customers an engineer worked for, click the engineer's name in the Engineer wise tab.</p>
      </div>
    </div>
  );
}

function DaybookTab({ p }: { p: RP }) {
  const { data, error, loading } = useReport(`d|${p.from}|${p.to}`, () => rpcAll<DayEvent>("report_daybook", { p_from: p.from, p_to: p.to }));
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const kindLabel: Record<string, string> = { inward: "Inward", ready: "Ready", outward: "Outward", part: "Part issued", payment: "Payment" };
  const days = new Map<string, DayEvent[]>();
  for (const e of data) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(e.event_at));
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  const keys = [...days.keys()].sort().reverse();
  const exportAll = () =>
    downloadCsv(`daybook_${p.from}_${p.to}.csv`, ["Time", "Type", "Job no", "Customer", "Detail", "Mode", "Amount", "By"],
      data.map((e) => [fmtDateTime(e.event_at), kindLabel[e.kind] ?? e.kind, e.job_no, e.customer_name, e.detail, e.mode ? MODE_LABEL[e.mode as keyof typeof MODE_LABEL] ?? e.mode : "", e.amount, e.by_name]));
  if (!keys.length) return <Empty />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden"><button onClick={exportAll} className="btn btn-ghost btn-sm">Download CSV</button></div>
      {keys.map((d) => {
        const ev = days.get(d)!;
        const pays = ev.filter((e) => e.kind === "payment");
        const cash = pays.filter((e) => e.mode === "cash").reduce((s, e) => s + (e.amount ?? 0), 0);
        const online = pays.filter((e) => e.mode === "online").reduce((s, e) => s + (e.amount ?? 0), 0);
        return (
          <section key={d} className="panel overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50 px-4 py-2.5">
              <h3 className="font-semibold text-ink">{fmtYmd(d)}</h3>
              <div className="mono flex gap-4 text-sm">
                <span>Cash {money(cash)}</span><span>Online {money(online)}</span><span className="font-semibold">Total {money(cash + online)}</span>
              </div>
            </header>
            <table className="w-full text-sm">
              <tbody>
                {ev.map((e, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="td mono whitespace-nowrap text-slate-500">{fmtDateTime(e.event_at).split(",").pop()?.trim()}</td>
                    <td className="td whitespace-nowrap font-medium">{kindLabel[e.kind] ?? e.kind}</td>
                    <td className="td">{jobLink(e.job_id, e.job_no)}</td>
                    <td className="td">{e.customer_name}</td>
                    <td className="td text-slate-600">{e.detail}{e.mode ? ` (${MODE_LABEL[e.mode as keyof typeof MODE_LABEL] ?? e.mode})` : ""}</td>
                    <td className="td mono text-right">{e.amount !== null ? money(e.amount) : ""}</td>
                    <td className="td text-slate-500">{e.by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function CustomersTab({ p, admin }: { p: RP; admin: boolean }) {
  const { data, error, loading } = useReport(`c|${p.from}|${p.to}|${p.basis}|${p.cat}|${p.q}`, async () => {
    const rows = await rpcAll<CustomerRow>("report_customers", { p_from: p.from, p_to: p.to, p_field: p.basis, p_category: p.cat });
    const q = p.q.trim().toLowerCase();
    return q ? rows.filter((r) => r.customer_name.toLowerCase().includes(q) || (r.phone ?? "").includes(q)) : rows;
  });
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const cols: Col<CustomerRow>[] = [
    { key: "name", label: "Customer", value: (r) => r.customer_name, render: (r) => <Link href={`/jobs?q=${encodeURIComponent(r.phone || r.customer_name)}`} className="font-medium text-bench hover:underline">{r.customer_name}</Link> },
    { key: "phone", label: "Phone", value: (r) => r.phone, mono: true },
    { key: "jobs", label: "Jobs", kind: "number", sum: true, value: (r) => r.jobs },
    { key: "revenue", label: "Billed", kind: "money", sum: true, value: (r) => r.revenue },
    ...(admin ? [
      { key: "cost", label: "Parts cost", kind: "money" as const, sum: true, value: (r: CustomerRow) => r.parts_cost },
      { key: "profit", label: "Profit", kind: "money" as const, sum: true, value: (r: CustomerRow) => r.profit },
    ] : []),
    { key: "paid", label: "Paid", kind: "money", sum: true, value: (r) => r.paid },
    { key: "due", label: "Due", kind: "money", sum: true, value: (r) => r.due, render: (r) => <span className={r.due > 0 ? "font-semibold text-red-700" : ""}>{money(r.due)}</span> },
  ];
  return <DataTable rows={data} cols={cols} rowKey={(r) => r.customer_id} defaultSort={{ key: "revenue", dir: "desc" }} filename={`customers_${p.from}_${p.to}.csv`} />;
}

function EngineersTab({ p, admin }: { p: RP; admin: boolean }) {
  const { data, error, loading } = useReport(`e|${p.from}|${p.to}|${p.basis}`, () => rpcAll<EngineerRow>("report_engineers", { p_from: p.from, p_to: p.to, p_field: p.basis }));
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const cols: Col<EngineerRow>[] = [
    { key: "name", label: "Engineer", value: (r) => r.full_name, render: (r) => (
      <Link href={`/reports?tab=jobs&eng=${r.engineer_id}&from=${p.from}&to=${p.to}&basis=${p.basis}`} className="font-medium text-bench hover:underline" title="See every job of this engineer">
        {r.full_name}{r.eng_code ? <span className="mono ml-1.5 text-xs text-slate-500">{r.eng_code}</span> : null}
      </Link>
    ) },
    { key: "recv", label: "Inwarded", kind: "number", sum: true, value: (r) => r.received_count },
    { key: "rep", label: "Repaired (accepted)", kind: "number", sum: true, value: (r) => r.repaired_count },
    { key: "ready", label: "Marked ready", kind: "number", sum: true, value: (r) => r.ready_count },
    { key: "out", label: "Outward", kind: "number", sum: true, value: (r) => r.outward_count },
    { key: "avg", label: "Avg days to ready", kind: "number", value: (r) => r.avg_days_to_ready },
    { key: "rev", label: "Billed", kind: "money", sum: true, value: (r) => r.revenue },
    ...(admin ? [{ key: "profit", label: "Profit", kind: "money" as const, sum: true, value: (r: EngineerRow) => r.profit }] : []),
  ];
  return <DataTable rows={data} cols={cols} rowKey={(r) => r.engineer_id} defaultSort={{ key: "rep", dir: "desc" }} filename={`engineers_${p.from}_${p.to}.csv`} />;
}

function VisitsTab({ p }: { p: RP }) {
  const { data, error, loading } = useReport(`v|${p.from}|${p.to}|${p.eng}`, () =>
    rpcAll<VisitRow>("report_visits", { p_from: p.from, p_to: p.to, p_engineer: p.eng || null })
  );
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const byEng = new Map<string, { name: string; visits: number; km: number; pending: number }>();
  for (const r of data) {
    const k = r.engineer_id ?? "none";
    const e = byEng.get(k) ?? { name: r.engineer_name, visits: 0, km: 0, pending: 0 };
    e.visits += 1;
    if (r.km === null) e.pending += 1;
    else e.km += Number(r.km);
    byEng.set(k, e);
  }
  const totalKm = data.reduce((s, r) => s + Number(r.km ?? 0), 0);
  const cols: Col<VisitRow>[] = [
    { key: "date", label: "Visit date", value: (r) => r.visited_on, render: (r) => fmtYmd(r.visited_on) },
    { key: "eng", label: "Engineer", value: (r) => r.engineer_name },
    { key: "job", label: "Job no", value: (r) => r.job_no, render: (r) => jobLink(r.job_id, r.job_no) },
    { key: "cust", label: "Customer", value: (r) => r.customer_name },
    { key: "loc", label: "Location", value: (r) => r.location_name ?? "" },
    { key: "addr", label: "Address", value: (r) => r.address ?? "" },
    { key: "km", label: "Km", kind: "number", sum: true, align: "right", value: (r) => (r.km === null ? null : Number(r.km)),
      render: (r) => (r.km === null ? <span className="text-amber-700">Km pending</span> : Number(r.km).toFixed(1)) },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Site visits" value={String(data.length)} />
        <Kpi label="Total km" value={totalKm.toFixed(1)} />
      </div>
      {byEng.size > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="th">Engineer</th><th className="th text-right">Visits</th><th className="th text-right">Km</th><th className="th text-right">Km pending</th></tr></thead>
            <tbody>
              {[...byEng.values()].map((e) => (
                <tr key={e.name}><td className="td">{e.name}</td><td className="td text-right">{e.visits}</td><td className="td text-right mono">{e.km.toFixed(1)}</td><td className="td text-right">{e.pending || "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DataTable rows={data} cols={cols} rowKey={(r) => r.job_id} defaultSort={{ key: "date", dir: "desc" }} filename={`visits_${p.from}_${p.to}.csv`} empty="No site visits in this period." />
    </div>
  );
}

function payPill(r: ReportJob) {
  if (r.total <= 0) return <span className="text-slate-500">No charge</span>;
  if (r.due <= 0) return <span className="font-medium text-emerald-700">Paid</span>;
  if (r.on_credit) return <span className="font-medium text-red-700">Credit {money(r.due)}</span>;
  return <span className="font-medium text-amber-700">Due {money(r.due)}</span>;
}

function jobCols(admin: boolean): Col<ReportJob>[] {
  const all: Col<ReportJob>[] = [
    { key: "no", label: "Job no", value: (r) => r.job_no, render: (r) => jobLink(r.job_id, r.job_no) },
    { key: "recv", label: "Received", value: (r) => r.received_at, render: (r) => fmtDate(r.received_at) },
    { key: "cust", label: "Customer", value: (r) => r.customer_name },
    { key: "phone", label: "Phone", value: (r) => r.phone, mono: true },
    { key: "cat", label: "Product type", value: (r) => r.category_name },
    { key: "dev", label: "Product", value: (r) => [r.brand, r.model_no].filter(Boolean).join(" ") },
    { key: "sn", label: "Serial", value: (r) => r.serial_no, mono: true },
    { key: "st", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: "rb", label: "Received by", value: (r) => r.received_by_name },
    { key: "eng", label: "Repair engineer", value: (r) => r.repair_by_name },
    { key: "out", label: "Outward", value: (r) => r.outward_at, render: (r) => (r.outward_at ? fmtDate(r.outward_at) : "-") },
    { key: "total", label: "Bill", kind: "money", sum: true, value: (r) => r.total },
    { key: "paid", label: "Paid", kind: "money", sum: true, value: (r) => r.paid },
    { key: "due", label: "Due", kind: "money", sum: true, value: (r) => r.due },
    { key: "profit", label: "Profit", kind: "money", sum: true, value: (r) => r.profit },
    { key: "pay", label: "Payment", value: (r) => (r.total <= 0 ? "No charge" : r.due <= 0 ? "Paid" : r.on_credit ? "Credit" : "Unpaid"), render: payPill },
  ];
  return admin ? all : all.filter((c) => c.key !== "profit");
}

function JobsTab({ p, admin }: { p: RP; admin: boolean }) {
  const { data, error, loading } = useReport(`j|${p.from}|${p.to}|${p.basis}|${p.cat}|${p.status}|${p.eng}|${p.q}|${p.pay}`, () =>
    rpcAll<ReportJob>("report_jobs", {
      p_from: p.from, p_to: p.to, p_field: p.basis, p_category: p.cat,
      p_status: p.status || null, p_engineer: p.eng || null, p_q: p.q.trim() || null, p_payment: p.pay || null,
    })
  );
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  return <DataTable rows={data} cols={jobCols(admin)} rowKey={(r) => r.job_id} defaultSort={{ key: "recv", dir: "desc" }} filename={`jobs_${p.from}_${p.to}.csv`} />;
}

function CreditTab() {
  const { data, error, loading } = useReport("credit", async () => {
    const args = { p_from: "2000-01-01", p_to: todayIST(), p_field: "received", p_category: null, p_status: null, p_engineer: null, p_q: null };
    const [a, b] = await Promise.all([
      rpcAll<ReportJob>("report_jobs", { ...args, p_payment: "credit" }),
      rpcAll<ReportJob>("report_jobs", { ...args, p_payment: "unpaid" }),
    ]);
    return [...a, ...b].filter((r) => r.due > 0);
  });
  if (error) return <Err m={error} />;
  if (loading || !data) return <Loading />;
  const total = data.reduce((s, r) => s + r.due, 0);
  const cols = jobCols(false).filter((c) => ["no", "recv", "cust", "phone", "dev", "st", "total", "paid", "due", "pay"].includes(c.key));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total to collect" value={money(total)} tone={total > 0 ? "bad" : undefined} />
        <Kpi label="Open jobs with dues" value={String(data.length)} />
      </div>
      <p className="text-sm text-slate-600">Open a job and use <b>Add payment</b> to record cash or online payments; the due amount reduces automatically.</p>
      <DataTable rows={data} cols={cols} rowKey={(r) => r.job_id} defaultSort={{ key: "due", dir: "desc" }} filename={`credit-due_${todayIST()}.csv`} empty="No credit outstanding." />
    </div>
  );
}

const Loading = () => <div className="panel p-10 text-center text-sm text-slate-500" role="status">Loading report...</div>;
const Empty = () => <div className="panel p-10 text-center text-sm text-slate-500">Nothing found for this period.</div>;
const Err = ({ m }: { m: string }) => (
  <div className="panel border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
    Could not load the report: {m}. If the message says &quot;function does not exist&quot;, run the latest SQL files (003 to 009) in the Supabase SQL Editor.
  </div>
);

function ReportsInner() {
  const { profile } = useAuth();
  const { p, set } = useReportParams();
  const allowed = profile && (profile.role === "admin" || profile.role === "crm");
  const admin = profile?.role === "admin";
  if (!allowed) return <div className="panel p-6 text-sm">Reports are available to Admin and CRM only.</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <button onClick={() => window.print()} className="btn btn-ghost btn-sm print:hidden">Print this report</button>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line print:hidden" aria-label="Report type">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => set({ tab: t.key, basis: null })}
            aria-current={p.tab === t.key ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${p.tab === t.key ? "border-bench text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Filters p={p} set={set} />
      {p.tab === "summary" && <SummaryTab p={p} admin={!!admin} />}
      {p.tab === "monthly" && <MonthlyTab p={p} admin={!!admin} />}
      {p.tab === "daybook" && <DaybookTab p={p} />}
      {p.tab === "customers" && <CustomersTab p={p} admin={!!admin} />}
      {p.tab === "engineers" && <EngineersTab p={p} admin={!!admin} />}
      {p.tab === "jobs" && <JobsTab p={p} admin={!!admin} />}
      {p.tab === "visits" && <VisitsTab p={p} />}
      {p.tab === "credit" && <CreditTab />}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReportsInner />
    </Suspense>
  );
}
