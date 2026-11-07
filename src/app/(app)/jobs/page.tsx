"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fetchJobs } from "@/lib/jobs";
import { STATUSES, STATUS_LABEL, type Category, type JobFull, type Status } from "@/lib/types";
import JobTable from "@/components/JobTable";

function JobsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qParam = params.get("q") ?? "";
  const statusParam = (params.get("status") as Status | null) ?? "all";
  const catParam = params.get("cat") ? Number(params.get("cat")) : null;

  const [q, setQ] = useState(qParam);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fields, setFields] = useState<{ key: string; label: string }[]>([]);
  const [jobs, setJobs] = useState<JobFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("product_categories").select("*").order("sort_order").then(({ data }) => setCategories((data ?? []) as Category[]));
  }, []);

  useEffect(() => {
    if (!catParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFields([]);
      return;
    }
    supabase.from("category_fields").select("key,label").eq("category_id", catParam).order("sort_order")
      .then(({ data }) => setFields((data ?? []) as { key: string; label: string }[]));
  }, [catParam]);

  const load = useCallback(async () => {
    try {
      setJobs(await fetchJobs({ q: qParam, status: statusParam, category: catParam, limit: 300 }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [qParam, statusParam, catParam]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load();
    const ch = supabase
      .channel("jobs-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_cards" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  function go(nextQ: string, nextStatus: string, nextCat: number | null) {
    const sp = new URLSearchParams();
    if (nextQ.trim()) sp.set("q", nextQ.trim());
    if (nextStatus !== "all") sp.set("status", nextStatus);
    if (nextCat) sp.set("cat", String(nextCat));
    router.push(`/jobs${sp.toString() ? `?${sp}` : ""}`);
  }

  const catName = categories.find((c) => c.id === catParam)?.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Jobs and search</h1>
        <Link href="/inward" className="btn btn-primary">New inward</Link>
      </div>

      <div role="tablist" aria-label="Product type" className="flex flex-wrap gap-1.5">
        {[{ id: null as number | null, name: "All products" }, ...categories].map((c) => {
          const on = (c.id ?? null) === catParam;
          return (
            <button
              key={c.id ?? "all"}
              role="tab"
              aria-selected={on}
              onClick={() => go(q, statusParam, c.id)}
              className={`rounded-md border px-3.5 py-1.5 text-sm transition-colors ${
                on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-slate-400"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q, statusParam, catParam);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Serial no / customer name / phone / job no"
          aria-label="Search jobs"
          className="min-w-72 flex-1 field"
        />
        <select value={statusParam} onChange={(e) => go(q, e.target.value, catParam)} aria-label="Status" className="field">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button className="btn btn-primary">Search</button>
      </form>

      {(qParam || catName) && (
        <p className="text-sm text-slate-600">
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
          {catName ? ` in ${catName}` : ""}
          {qParam ? ` matching "${qParam}"` : ""}
        </p>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="text-slate-500">Loading...</p> : <JobTable jobs={jobs} fields={fields} />}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
      <JobsInner />
    </Suspense>
  );
}
