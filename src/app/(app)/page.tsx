"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchActive } from "@/lib/jobs";
import { ageText, ageTone, daysSince, fmtDate } from "@/lib/format";
import { STATUS_LABEL, type JobFull } from "@/lib/types";
import { StatusBadge } from "@/components/JobTable";
import { useAuth } from "@/components/AuthProvider";
import { money } from "@/lib/format";
import { todayIST } from "@/lib/dates";

function Stage({
  href,
  title,
  count,
  tone,
  children,
}: {
  href: string;
  title: string;
  count: number | string;
  tone: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col px-5 py-4">
      <span className={`absolute inset-x-0 top-0 h-1 ${tone}`} />
      <Link href={href} className="group">
        <div className="text-sm text-slate-600 group-hover:text-ink">{title}</div>
        <div className="mono mt-1 text-4xl font-medium tracking-tight text-ink">{count}</div>
      </Link>
      {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

function SubLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded border border-line bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:border-slate-400">
      {children}
    </Link>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [active, setActive] = useState<JobFull[]>([]);
  const [closed, setClosed] = useState(0);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<{ low: number; credit: number }>({ low: 0, credit: 0 });

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        fetchActive(),
        supabase.from("job_cards").select("id", { count: "exact", head: true }).eq("status", "outward"),
      ]);
      setActive(a);
      setClosed(c.count ?? 0);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!profile || (profile.role !== "admin" && profile.role !== "crm")) return;
    (async () => {
      try {
        const [parts, sum] = await Promise.all([
          supabase.from("parts").select("stock_qty,min_stock").eq("active", true).eq("is_service", false),
          supabase.rpc("report_summary", { p_from: todayIST(), p_to: todayIST() }),
        ]);
        const low = (parts.data ?? []).filter((x: { stock_qty: number; min_stock: number }) => x.stock_qty <= x.min_stock).length;
        const credit = Number((sum.data as { credit_outstanding?: number } | null)?.credit_outstanding ?? 0);
        setAlerts({ low, credit });
      } catch {
        /* alerts are optional */
      }
    })();
  }, [profile]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("jobs-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_cards" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const g = useMemo(() => {
    const by = (s: string) => active.filter((j) => j.status === s);
    const repairing = active.filter((j) => ["in_repair", "pending_spares", "pending_tech", "pending_approval"].includes(j.status));
    const ready = by("ready").sort((a, b) => (a.ready_at ?? "").localeCompare(b.ready_at ?? ""));
    return {
      waiting: by("inward").length,
      repairing: repairing.length,
      spares: by("pending_spares").length,
      tech: by("pending_tech").length,
      approval: by("pending_approval").sort((a, b) => a.updated_at.localeCompare(b.updated_at)),
      quote: active.filter((j) => j.quotation_requested_at && j.status !== "pending_approval" && j.status !== "ready"),
      ready,
      oldest: active.filter((j) => j.status !== "ready").slice(0, 8),
    };
  }, [active]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">Everything currently at the centre, updated live.</p>
        </div>
        <Link href="/inward" className="btn btn-go">+ New inward</Link>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/jobs?q=${encodeURIComponent(q.trim())}`);
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Serial number, name, phone or job no"
            aria-label="Search jobs"
            className="field min-w-0 flex-1 sm:w-72 sm:flex-none"
          />
          <button className="btn btn-primary">Find history</button>
        </form>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {(alerts.low > 0 || alerts.credit > 0) && (
        <div className="flex flex-wrap gap-3">
          {alerts.credit > 0 && (
            <Link href="/reports?tab=credit" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 hover:border-red-400">
              Credit to collect: <b className="mono">{money(alerts.credit)}</b>
            </Link>
          )}
          {alerts.low > 0 && (
            <Link href="/stock" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:border-amber-400">
              <b>{alerts.low}</b> stock item{alerts.low === 1 ? "" : "s"} low or out
            </Link>
          )}
        </div>
      )}

      <section aria-label="Pipeline" className="panel grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <Stage href="/jobs?status=inward" title="Waiting for an engineer" count={loaded ? g.waiting : "-"} tone="bg-amber-500" />
        <Stage href="/jobs?status=in_repair" title="Under repair" count={loaded ? g.repairing : "-"} tone="bg-blue-600">
          {g.spares > 0 && <SubLink href="/jobs?status=pending_spares">{g.spares} need spares</SubLink>}
          {g.tech > 0 && <SubLink href="/jobs?status=pending_tech">{g.tech} need tech support</SubLink>}
          {g.approval.length > 0 && <SubLink href="/jobs?status=pending_approval">{g.approval.length} waiting for approval</SubLink>}
        </Stage>
        <Stage href="/jobs?status=ready" title="Ready for pickup" count={loaded ? g.ready.length : "-"} tone="bg-emerald-600" />
        <Stage href="/jobs?status=outward" title="Closed so far" count={loaded ? closed : "-"} tone="bg-slate-400" />
      </section>

      {(g.quote.length > 0 || g.approval.length > 0) && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="panel">
            <header className="border-b border-line px-5 py-3">
              <h2 className="font-semibold text-ink">Quotations to prepare</h2>
              <p className="text-xs text-slate-500">Engineers have finished diagnosis. Open the job and press Generate estimate.</p>
            </header>
            {g.quote.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">No quotation requests.</p>
            ) : (
              <ul className="divide-y divide-line">
                {g.quote.map((j) => (
                  <li key={j.id} className="px-5 py-3 text-sm">
                    <Link href={`/jobs/${j.id}`} className="mono font-medium text-bench hover:underline">{j.job_no}</Link>
                    <span className="text-slate-500"> - {j.customer?.name}, requested {fmtDate(j.quotation_requested_at)}</span>
                    {j.quotation_note && <div className="text-xs text-slate-600">Engineer note: {j.quotation_note}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <header className="border-b border-line px-5 py-3">
              <h2 className="font-semibold text-ink">Waiting for customer approval</h2>
              <p className="text-xs text-slate-500">Share the quotation on WhatsApp and record the decision. Oldest first.</p>
            </header>
            {g.approval.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">No quotation is waiting.</p>
            ) : (
              <ul className="divide-y divide-line">
                {g.approval.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} className="mono font-medium text-bench hover:underline">{j.job_no}</Link>
                      <span className="text-slate-500"> - {j.customer?.name}</span>
                    </div>
                    <span className={`mono rounded px-1.5 py-0.5 text-xs ${ageTone(daysSince(j.updated_at))}`}>{ageText(daysSince(j.updated_at))}</span>
                    <a href={`tel:${j.customer?.phone}`} className="btn btn-ghost btn-sm mono">{j.customer?.phone}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel">
          <header className="border-b border-line px-5 py-3">
            <h2 className="font-semibold text-ink">Ready for pickup</h2>
            <p className="text-xs text-slate-500">Call these customers. Longest waiting first.</p>
          </header>
          {g.ready.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing is waiting for pickup.</p>
          ) : (
            <ul className="divide-y divide-line">
              {g.ready.slice(0, 8).map((j) => {
                const d = daysSince(j.ready_at);
                return (
                  <li key={j.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} className="mono text-sm font-medium text-bench hover:underline">
                        {j.job_no}
                      </Link>
                      <div className="truncate text-sm">
                        {j.customer?.name}
                        <span className="text-slate-500"> - {[j.device?.brand, j.device?.model_no].filter(Boolean).join(" ") || j.category?.name}</span>
                      </div>
                    </div>
                    <span className={`mono rounded px-1.5 py-0.5 text-xs ${ageTone(d)}`} title="Days since ready">
                      {d === 0 ? "Ready today" : `Ready ${d}d`}
                    </span>
                    <a href={`tel:${j.customer?.phone}`} className="btn btn-ghost btn-sm mono">
                      {j.customer?.phone}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <header className="border-b border-line px-5 py-3">
            <h2 className="font-semibold text-ink">Open the longest</h2>
            <p className="text-xs text-slate-500">Jobs still waiting or under repair, oldest first.</p>
          </header>
          {g.oldest.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No open jobs. New inwards from the engineer app will show here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {g.oldest.map((j) => {
                const d = daysSince(j.received_at);
                return (
                  <li key={j.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} className="mono text-sm font-medium text-bench hover:underline">
                        {j.job_no}
                      </Link>
                      <div className="truncate text-sm">
                        {j.customer?.name}
                        <span className="text-slate-500"> - since {fmtDate(j.received_at)}</span>
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                    <span className={`mono rounded px-1.5 py-0.5 text-xs ${ageTone(d)}`}>{ageText(d)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <span className="sr-only">{STATUS_LABEL.inward}</span>
    </div>
  );
}
