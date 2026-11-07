"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtDateTime, money, personLabel } from "@/lib/format";
import { JOB_SELECT, MODE_LABEL, type JobFull, type JobPart, type Payment } from "@/lib/types";

const CENTRE_NAME = process.env.NEXT_PUBLIC_CENTRE_NAME ?? "Service Centre";
const CENTRE_ADDRESS = process.env.NEXT_PUBLIC_CENTRE_ADDRESS ?? "";

export default function BillPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobFull | null>(null);
  const [parts, setParts] = useState<JobPart[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const j = await supabase.from("job_cards").select(JOB_SELECT).eq("id", id).single();
      if (j.error || !j.data) return setError(j.error?.message ?? "Job not found");
      setJob(j.data as unknown as JobFull);
      const [p, pay] = await Promise.all([
        supabase.from("job_parts").select("id,job_id,part_id,description,part_number,qty,unit_price,state,requested_at,issued_at,serial_no").eq("job_id", id).eq("state", "issued").order("requested_at"),
        supabase.from("job_payments").select("*").eq("job_id", id).order("paid_at"),
      ]);
      setParts((p.data ?? []) as JobPart[]);
      setPays((pay.data ?? []) as unknown as Payment[]);
    })();
  }, [id]);

  if (!job) return <div className="text-slate-500">{error || "Loading..."}</div>;
  const total = parts.reduce((s, p) => s + p.qty * Number(p.unit_price), 0);
  const service = Number(job.service_charge ?? 0);
  const discount = Number(job.discount ?? 0);
  const grand = total + service - discount;
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const due = grand - paid;
  const c = job.customer;
  const d = job.device;

  return (
    <div>
      <style>{`@page { size: A4 portrait; margin: 10mm; }`}</style>
      <div className="mb-4 print:hidden"><button onClick={() => window.print()} className="btn btn-primary">Print</button></div>
      <div className="mx-auto w-[190mm] bg-white text-black print:w-full">
        <div className="grid grid-cols-2 border border-black">
          <div className="border-r border-black p-2">
            <div className="text-lg font-bold">Bill / Receipt</div>
            <div className="text-[13px] font-semibold">Job No: {job.job_no}</div>
            <div className="text-[11px]">Date: {fmtDate(job.outward_at ?? new Date().toISOString())}</div>
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
        {job.repair_declined && <div className="border-x border-b border-black p-2 text-[12px]">Quotation declined by the customer. No repair was carried out.</div>}
        <table className="w-full border-x border-b border-black text-[12px]">
          <thead><tr className="border-b border-black text-left"><th className="p-1.5">#</th><th>Description</th><th>Qty</th><th className="text-right">Price</th><th className="p-1.5 text-right">Amount</th></tr></thead>
          <tbody>
            {parts.map((p, i) => (
              <tr key={p.id}><td className="p-1.5">{i + 1}</td><td>{p.description}{p.serial_no ? ` (S/N ${p.serial_no})` : ""}</td><td>{p.part_number === "SERVICE" ? "" : p.qty}</td><td className="text-right">{money(Number(p.unit_price))}</td><td className="p-1.5 text-right">{money(p.qty * Number(p.unit_price))}</td></tr>
            ))}
            {service > 0 && <tr><td className="p-1.5" /><td>Service charge</td><td /><td /><td className="p-1.5 text-right">{money(service)}</td></tr>}
            {discount > 0 && <tr><td className="p-1.5" /><td>Discount</td><td /><td /><td className="p-1.5 text-right">- {money(discount)}</td></tr>}
            {parts.length === 0 && service === 0 && <tr><td colSpan={5} className="p-1.5 text-slate-500">No charges</td></tr>}
          </tbody>
          <tfoot><tr className="border-t border-black font-semibold"><td colSpan={4} className="p-1.5 text-right">Total</td><td className="p-1.5 text-right">{money(grand)}</td></tr></tfoot>
        </table>
        <div className="border-x border-b border-black p-2 text-[12px]">
          <div className="mb-1 font-semibold">Payments</div>
          {pays.length === 0 ? <div className="text-slate-600">No payment received.</div> : (
            <table className="w-full">
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id}><td>{fmtDateTime(p.paid_at)}</td><td>{MODE_LABEL[p.mode]}{p.reference ? ` (${p.reference})` : ""}</td><td className="text-right">{money(Number(p.amount))}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-2 flex justify-between border-t border-black pt-1 font-semibold">
            <span>{grand === 0 ? "No charge" : due > 0 ? (job.on_credit ? "Balance on credit" : "Balance due") : "Paid in full"}</span>
            <span>{due > 0 ? money(due) : ""}</span>
          </div>
        </div>
        <div className="border-x border-b border-black p-2 text-[11px]">
          Received by {personLabel(job.received)} on {fmtDateTime(job.received_at)}. Handed over{job.outwarder ? ` by ${personLabel(job.outwarder)}` : ""}{job.outward_at ? ` on ${fmtDateTime(job.outward_at)}` : ""}.
        </div>
        <div className="mt-10 grid grid-cols-2 gap-10 text-[12px]">
          <div className="border-t border-black pt-1">Customer signature</div>
          <div className="border-t border-black pt-1 text-right">For {CENTRE_NAME}</div>
        </div>
      </div>
    </div>
  );
}
