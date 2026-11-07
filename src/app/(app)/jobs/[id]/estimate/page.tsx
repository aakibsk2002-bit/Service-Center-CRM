"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { JOB_SELECT, type Estimate, type JobFull } from "@/lib/types";

const CENTRE_NAME = process.env.NEXT_PUBLIC_CENTRE_NAME ?? "Service Centre";
const CENTRE_ADDRESS = process.env.NEXT_PUBLIC_CENTRE_ADDRESS ?? "";

function Inner({ id }: { id: string }) {
  const eid = useSearchParams().get("e");
  const [job, setJob] = useState<JobFull | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const j = await supabase.from("job_cards").select(JOB_SELECT).eq("id", id).single();
      if (j.error || !j.data) return setError(j.error?.message ?? "Job not found");
      setJob(j.data as unknown as JobFull);
      let q = supabase.from("job_estimates").select("*").eq("job_id", id).order("created_at", { ascending: false }).limit(1);
      if (eid) q = supabase.from("job_estimates").select("*").eq("job_id", id).eq("id", eid).limit(1);
      const e = await q;
      if (e.error) return setError(e.error.message);
      setEst(((e.data ?? [])[0] as Estimate) ?? null);
    })();
  }, [id, eid]);

  if (!job) return <div className="text-slate-500">{error || "Loading..."}</div>;
  if (!est) return <div className="text-slate-500">{error || "No estimate has been created for this job yet."}</div>;
  const c = job.customer;
  const d = job.device;
  const status = est.status === "approved" ? "Approved by customer" : est.status === "rejected" ? "Not approved by customer" : est.status === "superseded" ? "Replaced by a newer estimate" : "Waiting for customer approval";

  return (
    <div>
      <style>{`@page { size: A4 portrait; margin: 10mm; }`}</style>
      <div className="mb-4 print:hidden"><button onClick={() => window.print()} className="btn btn-primary">Print</button></div>
      <div className="mx-auto w-[190mm] bg-white text-black print:w-full">
        <div className="grid grid-cols-2 border border-black">
          <div className="border-r border-black p-2">
            <div className="text-lg font-bold">Repair Estimate</div>
            <div className="text-[13px] font-semibold">Job No: {job.job_no}</div>
            <div className="text-[11px]">Date: {fmtDate(est.created_at)}</div>
          </div>
          <div className="p-2">
            <div className="text-[13px] font-bold">{CENTRE_NAME}</div>
            <div className="whitespace-pre-line text-[10px]">{CENTRE_ADDRESS}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-x border-b border-black text-[12px]">
          <div className="border-r border-black p-2"><b>Customer:</b> {c.name}{c.company ? ` / ${c.company}` : ""}<br /><b>Phone:</b> {c.phone}</div>
          <div className="p-2"><b>Product:</b> {job.category?.name}<br />{[d.brand, d.model_no].filter(Boolean).join(" ")}{d.serial_no ? ` - S/N ${d.serial_no}` : ""}</div>
        </div>
        <div className="border-x border-b border-black p-2 text-[12px]"><b>Reported problem:</b> {job.reported_problem || "-"}</div>
        <div className="border-x border-b border-black p-2 text-[12px]"><b>Observed problem:</b> {job.observed_problem || "-"}</div>
        <table className="w-full border border-black text-[12px]">
          <thead><tr className="border-b border-black text-left"><th className="p-1.5">#</th><th>Description</th><th>Qty</th><th className="text-right">Price</th><th className="p-1.5 text-right">Amount</th></tr></thead>
          <tbody>
            {est.lines.map((l, i) => (
              <tr key={i}><td className="p-1.5">{i + 1}</td><td>{l.description}</td><td>{l.qty}</td><td className="text-right">{money(Number(l.unit_price))}</td><td className="p-1.5 text-right">{money(Number(l.amount))}</td></tr>
            ))}
            {est.lines.length === 0 && <tr><td colSpan={5} className="p-1.5 text-slate-500">No parts or services listed</td></tr>}
            {Number(est.service_charge) > 0 && <tr><td className="p-1.5" /><td>Service charge</td><td /><td /><td className="p-1.5 text-right">{money(Number(est.service_charge))}</td></tr>}
          </tbody>
          <tfoot><tr className="border-t border-black font-semibold"><td colSpan={4} className="p-1.5 text-right">Estimated total</td><td className="p-1.5 text-right">{money(Number(est.total))}</td></tr></tfoot>
        </table>
        {est.note && <div className="border-x border-b border-black p-2 text-[12px]"><b>Note:</b> {est.note}</div>}
        <div className="border-x border-b border-black p-2 text-[12px]">
          <b>Status:</b> {status}{est.decided_at ? ` on ${fmtDateTime(est.decided_at)}` : ""}
          {est.decision_note ? ` - ${est.decision_note}` : ""}
        </div>
        <div className="mt-2 text-[10px] text-slate-600">This is an estimate. The final bill may vary if additional faults are found; we will inform you before any extra work.</div>
        <div className="mt-10 grid grid-cols-2 gap-10 text-[12px]">
          <div className="border-t border-black pt-1">Customer approval signature</div>
          <div className="border-t border-black pt-1 text-right">For {CENTRE_NAME}</div>
        </div>
      </div>
    </div>
  );
}

export default function EstimatePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
      <Inner id={id} />
    </Suspense>
  );
}
