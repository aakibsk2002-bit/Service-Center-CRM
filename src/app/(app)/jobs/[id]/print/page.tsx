"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/jobs";
import { fmtDate, fmtDateTime, money, personLabel } from "@/lib/format";
import {
  CALL_TYPE_LABEL,
  FEEDBACK_LABEL,
  JOB_SELECT,
  SERVICE_TYPE_LABEL,
  STATUS_LABEL,
  WARRANTY_LABEL,
  type JobFull,
  type JobPart,
  type Payment,
  MODE_LABEL,
} from "@/lib/types";

const CENTRE_NAME = process.env.NEXT_PUBLIC_CENTRE_NAME ?? "Service Centre";
const CENTRE_ADDRESS = process.env.NEXT_PUBLIC_CENTRE_ADDRESS ?? "";

function Cell({
  label,
  children,
  className = "",
  small = false,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  small?: boolean;
}) {
  return (
    <div className={`border border-black px-1.5 py-1 ${className}`} style={{ breakInside: "avoid" }}>
      <div className="text-[8px] uppercase leading-tight text-slate-600">{label}</div>
      <div className={`leading-tight ${small ? "text-[9.5px]" : "text-[11px]"}`}>{children || "-"}</div>
    </div>
  );
}

export default function PrintReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobFull | null>(null);
  const [parts, setParts] = useState<JobPart[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fields, setFields] = useState<{ key: string; label: string }[]>([]);
  const [inSign, setInSign] = useState<string | null>(null);
  const [outSign, setOutSign] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("job_cards").select(JOB_SELECT).eq("id", id).single();
      if (error || !data) {
        setError(error?.message ?? "Not found");
        return;
      }
      const j = data as unknown as JobFull;
      setJob(j);
      const [p, f, pay] = await Promise.all([
        supabase.from("job_parts").select("id,job_id,part_id,description,part_number,qty,unit_price,state,requested_at,issued_at,serial_no").eq("job_id", id).eq("state", "issued").order("requested_at"),
        supabase.from("category_fields").select("key,label").eq("category_id", j.category_id).order("sort_order"),
        supabase.from("job_payments").select("*").eq("job_id", id).order("paid_at"),
      ]);
      setPayments((pay.data ?? []) as unknown as Payment[]);
      setParts((p.data ?? []) as JobPart[]);
      setFields((f.data ?? []) as { key: string; label: string }[]);
      setInSign(await signedUrl(j.inward_sign_path));
      setOutSign(await signedUrl(j.outward_sign_path));
    })();
  }, [id]);

  if (!job) return <div className="text-slate-500">{error || "Loading..."}</div>;

  const c = job.customer;
  const d = job.device;
  const total = parts.reduce((s, p) => s + p.qty * Number(p.unit_price), 0);
  const service = Number(job.service_charge ?? 0);
  const discount = Number(job.discount ?? 0);
  const grand = total + service - discount;
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const due = grand - paid;
  const byMode = (m: string) => payments.filter((p) => p.mode === m).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <button onClick={() => window.print()} className="btn btn-primary">
          Print
        </button>
      </div>

      <style>{`@page { size: A4 portrait; margin: 7mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto w-[196mm] bg-white p-0 text-black print:w-full">
        <div className="grid grid-cols-[1fr_1fr] border border-black">
          <div className="border-r border-black px-2 py-1.5">
            <div className="text-base font-bold leading-tight">Customer Service Report</div>
            <div className="text-[12px] font-semibold">Job No: {job.job_no}</div>
            <div className="text-[10px]">Status: {STATUS_LABEL[job.status]}</div>
          </div>
          <div className="px-2 py-1.5">
            <div className="text-[12px] font-bold">{CENTRE_NAME}</div>
            <div className="whitespace-pre-line text-[9px] leading-tight">{CENTRE_ADDRESS}</div>
          </div>
        </div>

        <div className="grid grid-cols-6">
          <Cell label="Customer / Company" className="col-span-2">{[c.name, c.company].filter(Boolean).join(" / ")}</Cell>
          <Cell label="Contact person" className="col-span-2">{c.contact_person}</Cell>
          <Cell label="Phone" small>{c.phone}</Cell>
          <Cell label="WhatsApp" small>{c.whatsapp_phone || c.phone}</Cell>
          <Cell label="Address" className="col-span-3">
            {[c.address, c.city, c.pincode].filter(Boolean).join(", ")}
          </Cell>
          <Cell label="Email" className="col-span-2" small>{c.email}</Cell>
          <Cell label="Purchase date" small>{d.purchase_date}</Cell>
        </div>

        <div className="grid grid-cols-4">
          <Cell label="Call received" small>{fmtDateTime(job.received_at)}</Cell>
          <Cell label="Call attended" small>{fmtDateTime(job.accepted_at)}</Cell>
          <Cell label="Call completed" small>{fmtDateTime(job.ready_at)}</Cell>
          <Cell label="Outward" small>{fmtDateTime(job.outward_at)}</Cell>
          <Cell label="Call type" small>{job.call_type ? CALL_TYPE_LABEL[job.call_type] : ""}</Cell>
          <Cell label="Service type" small>{job.service_type ? SERVICE_TYPE_LABEL[job.service_type] : ""}</Cell>
          <Cell label="Warranty" small>{job.warranty_status ? WARRANTY_LABEL[job.warranty_status] : ""}</Cell>
          <Cell label="RMA no" small>{job.rma_no}</Cell>
        </div>

        <div className="grid grid-cols-4">
          <Cell label="Page count - inward" small>{job.pages_in ?? ""}</Cell>
          <Cell label="Page count - outward" small>{job.pages_out ?? ""}</Cell>
          <Cell label="Paper pickup test (50-60 pages)" small>
            {(job.issue?.needs_pickup_test || job.pickup_test_done) ? (job.pickup_test_done ? "Tested - OK" : "Not recorded") : "Not applicable"}
          </Cell>
          <Cell label={job.service_type === "onsite" ? "Site visit" : "Carry-in"} small>
            {job.service_type === "onsite"
              ? [job.visit_address, job.visit_km !== null && job.visit_km !== undefined ? `${Number(job.visit_km).toFixed(1)} km` : ""].filter(Boolean).join(" - ")
              : "Customer brought the product"}
          </Cell>
        </div>

        <div className="grid grid-cols-4">
          <Cell label="Product">{job.category?.name}</Cell>
          <Cell label="Brand / Model" className="col-span-2" small>{[d.brand, d.model_no].filter(Boolean).join(" ")}</Cell>
          <Cell label="Serial no" small>{d.serial_no}</Cell>
          {fields.map((f) => (
            <Cell key={f.key} label={f.label} small>
              {job.extra_fields?.[f.key]}
            </Cell>
          ))}
          <Cell label="Accessories received" className="col-span-4" small>
            {job.accessories?.join(", ")}
          </Cell>
        </div>

        <div className="grid grid-cols-2">
          <Cell label="Reported problem" small>
            <div className="min-h-5 whitespace-pre-wrap">{job.reported_problem}</div>
          </Cell>
          <Cell label="Observed problem" small>
            <div className="min-h-5 whitespace-pre-wrap">{job.observed_problem}</div>
          </Cell>
        </div>
        <Cell label="Action taken / rectification details" small>
          <div className="min-h-6 whitespace-pre-wrap">{job.action_taken}</div>
        </Cell>

        <div className="border border-black px-1.5 py-1">
          <div className="text-[8px] uppercase leading-tight text-slate-600">Spares and services</div>
          <table className="mt-0.5 w-full text-[9.5px] leading-tight">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="w-5">#</th>
                <th>Description</th>
                <th>Part no</th>
                <th className="w-8">Qty</th>
                <th className="w-16 text-right">Price</th>
                <th className="w-20 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => (
                <tr key={p.id} style={{ breakInside: "avoid" }}>
                  <td>{i + 1}</td>
                  <td>{p.description}</td>
                  <td>{p.part_number}{p.serial_no ? ` S/N ${p.serial_no}` : ""}</td>
                  <td>{p.qty}</td>
                  <td className="text-right">{money(Number(p.unit_price))}</td>
                  <td className="text-right">{money(p.qty * Number(p.unit_price))}</td>
                </tr>
              ))}
              {parts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-0.5 text-slate-500">
                    No parts used
                  </td>
                </tr>
              )}
            </tbody>
            {parts.length > 0 && (
              <tfoot>
                <tr className="border-t border-black font-semibold">
                  <td colSpan={5} className="text-right">Total</td>
                  <td className="text-right">{money(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="grid grid-cols-3">
          <div className="border border-black px-1.5 py-1 text-[9.5px] leading-tight" style={{ breakInside: "avoid" }}>
            <div className="text-[8px] uppercase text-slate-600">Bill</div>
            <table className="mt-0.5 w-full">
              <tbody>
                <tr><td>Parts</td><td className="text-right">{money(total)}</td></tr>
                <tr><td>Service charge</td><td className="text-right">{money(service)}</td></tr>
                {discount > 0 && <tr><td>Discount</td><td className="text-right">- {money(discount)}</td></tr>}
                <tr className="border-t border-black font-semibold"><td>Total</td><td className="text-right">{money(grand)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="border border-black px-1.5 py-1 text-[9.5px] leading-tight" style={{ breakInside: "avoid" }}>
            <div className="text-[8px] uppercase text-slate-600">Payment</div>
            <table className="mt-0.5 w-full">
              <tbody>
                {byMode("cash") > 0 && <tr><td>{MODE_LABEL.cash}</td><td className="text-right">{money(byMode("cash"))}</td></tr>}
                {byMode("online") > 0 && <tr><td>{MODE_LABEL.online}</td><td className="text-right">{money(byMode("online"))}</td></tr>}
                <tr className="border-t border-black font-semibold">
                  <td>{grand === 0 ? "No charge" : due > 0 ? (job.on_credit ? "On credit, due" : "Balance due") : "Paid in full"}</td>
                  <td className="text-right">{due > 0 ? money(due) : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Cell label="Customer feedback" small>
            {job.customer_feedback ? FEEDBACK_LABEL[job.customer_feedback] : ""}
            {job.feedback_note ? ` - ${job.feedback_note}` : ""}
          </Cell>
        </div>

        <div className="grid grid-cols-4">
          <Cell label="Receive engineer (inward)" small>
            {personLabel(job.received)} <span className="block text-[8.5px]">{fmtDateTime(job.received_at)}</span>
          </Cell>
          <Cell label="Repair engineer" small>
            {personLabel(job.repair)} <span className="block text-[8.5px]">accepted {fmtDateTime(job.accepted_at)}</span>
            {job.repair_started_at && <span className="block text-[8.5px]">started {fmtDateTime(job.repair_started_at)}</span>}
          </Cell>
          <Cell label="Outward by" small>
            {job.outward_by ? personLabel(job.outwarder) : ""}
            {job.outward_by && <span className="block text-[8.5px]">{fmtDateTime(job.outward_at)}</span>}
          </Cell>
          <Cell label="Printed on" small>{fmtDate(new Date().toISOString())}</Cell>
        </div>

        <div className="grid grid-cols-2" style={{ breakInside: "avoid" }}>
          {[
            { label: "Customer signature - inward", src: inSign, by: personLabel(job.received), at: job.received_at },
            { label: "Customer signature - outward", src: outSign, by: job.outward_by ? personLabel(job.outwarder) : "", at: job.outward_at },
          ].map((b) => (
            <div key={b.label} className="border border-black px-1.5 py-1">
              <div className="text-[8px] uppercase leading-tight text-slate-600">{b.label}</div>
              <div className="flex h-[30mm] items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.src && <img src={b.src} alt="Customer signature" className="max-h-full max-w-full object-contain" />}
              </div>
              <div className="border-t border-slate-400 pt-0.5 text-[8px] text-slate-600">
                {b.src ? `${c.name}${b.at ? " - " + fmtDateTime(b.at) : ""}` : "Not signed"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
