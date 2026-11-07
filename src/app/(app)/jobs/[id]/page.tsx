"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/jobs";
import { fmtDateTime, money, personLabel } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";
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
  type Estimate,
  type VisitLocation,
  type PayMode,
  type Profile,
  type Status,
  type StockItem,
  MODE_LABEL,
} from "@/lib/types";
import { StatusBadge, StatusTrack } from "@/components/JobTable";
import SignaturePad from "@/components/SignaturePad";
import { WA_LABEL, msgEstimate, msgReady, msgTaken, waLink, type WaKind } from "@/lib/whatsapp";

interface LogRow {
  id: number;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
  by: { full_name: string; eng_code: string | null } | null;
}
interface TransferRow {
  id: number;
  note: string | null;
  at: string;
  from: { full_name: string; eng_code: string | null } | null;
  to: { full_name: string; eng_code: string | null } | null;
  by: { full_name: string; eng_code: string | null } | null;
}
interface NotifRow {
  id: number;
  event: string;
  channel: string;
  to_phone: string;
  status: string;
  created_at: string;
}
type CatalogPart = StockItem & { is_head?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

type OutState = {
  open: boolean;
  mode: "cash" | "online" | "credit";
  amount: string;
  ref: string;
  pages: string;
  sign: Blob | null;
  signUrl: string | null;
  signing: boolean;
  skip: boolean;
  busy: boolean;
};
const OUT0: OutState = { open: false, mode: "cash", amount: "0", ref: "", pages: "", sign: null, signUrl: null, signing: false, skip: false, busy: false };
interface FieldDef {
  key: string;
  label: string;
}

const card = "panel p-5";
const input = "w-full field";
const label = "mb-1 block text-xs font-medium text-slate-500";

export default function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [job, setJob] = useState<JobFull | null>(null);
  const [parts, setParts] = useState<JobPart[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [inSign, setInSign] = useState<string | null>(null);
  const [outSign, setOutSign] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [charges, setCharges] = useState({ service_charge: "0", discount: "0" });
  const [payForm, setPayForm] = useState<{ amount: string; mode: PayMode; reference: string }>({ amount: "", mode: "cash", reference: "" });
  const [out, setOut] = useState<OutState>(OUT0);

  // editable fields
  const [edit, setEdit] = useState({
    call_type: "",
    service_type: "",
    warranty_status: "",
    rma_no: "",
    observed_problem: "",
    action_taken: "",
    customer_feedback: "",
    feedback_note: "",
    pages_in: "",
    pages_out: "",
    issue_category_id: "",
    internal_note: "",
  });
  const [issueOpts, setIssueOpts] = useState<{ id: number; name: string; needs_pickup_test: boolean }[]>([]);
  const [history, setHistory] = useState<{ id: string; job_no: string; rma_no: string | null; received_at: string; status: string; reported_problem: string | null; action_taken: string | null }[]>([]);
  const [callInfo, setCallInfo] = useState<Record<string, unknown> | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estNote, setEstNote] = useState("");
  const [locs, setLocs] = useState<VisitLocation[]>([]);
  const [sent, setSent] = useState<{ id: string; kind: string; at: string; by: { full_name: string } | null }[]>([]);
  const [visitForm, setVisitForm] = useState({ open: false, loc: "", addr: "", km: "" });
  const [serialOpts, setSerialOpts] = useState<string[]>([]);

  // new part form
  const [np, setNp] = useState({ kind: "product" as "product" | "service", description: "", part_id: "", part_number: "", qty: "1", unit_price: "0", issue: true, serial: "" });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("job_cards").select(JOB_SELECT).eq("id", id).single();
    if (error || !data) {
      setError(error?.message ?? "Job not found");
      return;
    }
    const j = data as unknown as JobFull;
    setJob(j);
    setEdit({
      call_type: j.call_type ?? "",
      service_type: j.service_type ?? "",
      warranty_status: j.warranty_status ?? "",
      rma_no: j.rma_no ?? "",
      observed_problem: j.observed_problem ?? "",
      action_taken: j.action_taken ?? "",
      customer_feedback: j.customer_feedback ?? "",
      feedback_note: j.feedback_note ?? "",
      pages_in: j.pages_in === null || j.pages_in === undefined ? "" : String(j.pages_in),
      pages_out: j.pages_out === null || j.pages_out === undefined ? "" : String(j.pages_out),
      issue_category_id: j.issue_category_id ? String(j.issue_category_id) : "",
      internal_note: j.internal_note ?? "",
    });
    supabase.from("issue_categories").select("id,name,needs_pickup_test").eq("active", true).order("sort_order")
      .then(({ data }) => setIssueOpts(data ?? []));
    supabase.from("job_cards").select("id,job_no,rma_no,received_at,status,reported_problem,action_taken")
      .eq("device_id", j.device_id).neq("id", id).order("received_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistory((data ?? []) as typeof history));
    supabase.from("job_call_info").select("*").eq("job_id", id).maybeSingle().then(({ data }) => setCallInfo(data as Record<string, unknown> | null));

    setCharges({ service_charge: String(j.service_charge ?? 0), discount: String(j.discount ?? 0) });

    const tr = await supabase
      .from("job_transfers")
      .select("id,note,at, from:profiles!job_transfers_from_engineer_fkey(full_name,eng_code), to:profiles!job_transfers_to_engineer_fkey(full_name,eng_code), by:profiles!job_transfers_by_fkey(full_name,eng_code)")
      .eq("job_id", id)
      .order("at");
    setTransfers((tr.data ?? []) as unknown as TransferRow[]);

    const [p, l, n, e, c, f, pay] = await Promise.all([
      supabase.from("job_parts").select("id,job_id,part_id,description,part_number,qty,unit_price,state,requested_by,requested_at,issued_at,serial_no,head_id,source_type,donor_serial,source_note").eq("job_id", id).order("requested_at"),
      supabase
        .from("job_status_log")
        .select("*, by:profiles(full_name,eng_code)")
        .eq("job_id", id)
        .order("changed_at"),
      supabase.from("notification_log").select("*").eq("job_id", id).order("created_at"),
      supabase.from("profiles").select("*").eq("role", "engineer").eq("active", true).order("full_name"),
      supabase.from("parts").select("id,part_number,description,price,active,stock_qty,min_stock,is_service,track_serial,is_head").eq("active", true).order("description"),
      supabase.from("category_fields").select("key,label").eq("category_id", j.category_id).order("sort_order"),
      supabase.from("job_payments").select("*, by:profiles(full_name)").eq("job_id", id).order("paid_at"),
    ]);
    setPayments((pay.data ?? []) as unknown as Payment[]);
    const [es, vl, ms] = await Promise.all([
      supabase.from("job_estimates").select("*").eq("job_id", id).order("created_at", { ascending: false }),
      supabase.from("visit_locations").select("*").eq("active", true).order("name"),
      supabase.from("job_messages").select("id,kind,at,by:profiles(full_name)").eq("job_id", id).order("at", { ascending: false }),
    ]);
    setEstimates((es.data ?? []) as unknown as Estimate[]);
    setLocs((vl.data ?? []) as unknown as VisitLocation[]);
    setSent((ms.data ?? []) as unknown as typeof sent);
    let costs = new Map<string, number>();
    if (profile?.role === "admin") {
      const cr = await supabase.rpc("admin_job_part_costs", { p_job: id });
      costs = new Map(((cr.data ?? []) as { job_part_id: string; unit_cost: number }[]).map((x) => [x.job_part_id, Number(x.unit_cost)]));
    }
    setParts(((p.data ?? []) as unknown as JobPart[]).map((x) => ({ ...x, unit_cost: costs.get(x.id) ?? 0 })));
    setLog((l.data ?? []) as unknown as LogRow[]);
    setNotifs((n.data ?? []) as NotifRow[]);
    setEngineers((e.data ?? []) as Profile[]);
    setCatalog((c.data ?? []) as unknown as CatalogPart[]);
    setFieldDefs((f.data ?? []) as FieldDef[]);
    setInSign(await signedUrl(j.inward_sign_path));
    setOutSign(await signedUrl(j.outward_sign_path));
  }, [id, profile?.role]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`job-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_cards", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "job_parts", filter: `job_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "job_payments", filter: `job_id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  async function saveDetails() {
    for (const v of [edit.pages_in, edit.pages_out]) {
      if (v.trim() !== "" && !/^\d+$/.test(v.trim())) return setError("Page count must be a whole number");
    }
    const { error } = await supabase
      .from("job_cards")
      .update({
        call_type: edit.call_type || null,
        service_type: edit.service_type || null,
        warranty_status: edit.warranty_status || null,
        rma_no: edit.rma_no || null,
        observed_problem: edit.observed_problem || null,
        action_taken: edit.action_taken || null,
        customer_feedback: edit.customer_feedback || null,
        feedback_note: edit.feedback_note || null,
        pages_in: edit.pages_in.trim() === "" ? null : Number(edit.pages_in),
        pages_out: edit.pages_out.trim() === "" ? null : Number(edit.pages_out),
        issue_category_id: edit.issue_category_id ? Number(edit.issue_category_id) : null,
        internal_note: edit.internal_note.trim() || null,
      })
      .eq("id", id);
    if (error) setError(error.message);
    else {
      setError("");
      flash("Saved");
      load();
    }
  }

  /** Warning only (never blocks): a quotation is still waiting for the customer. */
  function approvalPending(action: string): boolean {
    if (job?.status !== "pending_approval") return true;
    return confirm(`The quotation is still waiting for the customer's approval. ${action} anyway?`);
  }

  async function setStatus(status: Status) {
    if (status === "ready" && !approvalPending("Mark this job Ready")) return;
    const { error } = await supabase.from("job_cards").update({ status }).eq("id", id);
    if (error) setError(error.message);
    else {
      setError("");
      await load();
      if (status === "ready" && confirm("The job is Ready. Open WhatsApp with the 'ready for delivery' message for the customer now?")) {
        sendWa("ready");
      }
    }
  }

  async function unlockJob() {
    const reason = window.prompt("Why are you unlocking this closed job? (optional)", "");
    if (reason === null) return;
    const { error } = await supabase.rpc("unlock_job", { p_job: id, p_reason: reason.trim() || null });
    if (error) setError(error.message);
    else { setError(""); flash("Job unlocked. Remember to lock it again after editing."); load(); }
  }

  async function lockJob() {
    const { error } = await supabase.rpc("lock_job", { p_job: id });
    if (error) setError(error.message);
    else { setError(""); flash("Job locked"); load(); }
  }

  async function startRepair() {
    const { error } = await supabase.rpc("start_repair", { p_job: id });
    if (error) setError(error.message);
    else load();
  }

  async function assignEngineer(engId: string) {
    if (!job) return;
    if (["in_repair", "pending_spares", "pending_tech", "pending_approval"].includes(job.status)) {
      const who = engId ? engineers.find((e) => e.id === engId)?.full_name ?? "naye engineer" : "waiting list";
      const note = window.prompt(`Transfer this job to ${who}. Reason (optional):`, "");
      if (note === null) {
        load();
        return;
      }
      const { error } = await supabase.rpc("transfer_job", { p_job: id, p_to: engId || null, p_note: note });
      if (error) setError(error.message);
      else {
        setError("");
        flash(engId ? "Job transferred. The new engineer must press Start repair." : "Job returned to the waiting list.");
        load();
      }
      return;
    }
    const patch: Record<string, unknown> = { repair_engineer: engId || null };
    if (engId && job.status === "inward") patch.status = "in_repair";
    const { error } = await supabase.from("job_cards").update(patch).eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  async function addPart(e: React.FormEvent) {
    e.preventDefault();
    if (!np.description.trim()) return;
    if ((np.kind === "service" || np.issue) && !approvalPending("Add this item to the bill")) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("job_parts").insert({
      job_id: id,
      part_id: np.kind === "service" ? null : np.part_id || null,
      description: np.description.trim(),
      part_number: np.kind === "service" ? "SERVICE" : np.part_number.trim() || null,
      qty: np.kind === "service" ? 1 : Math.max(1, parseInt(np.qty) || 1),
      unit_price: parseFloat(np.unit_price) || 0,
      state: np.kind === "service" || np.issue ? "issued" : "requested",
      serial_no: np.kind === "service" ? null : np.serial.trim() || null,
      requested_by: u.user?.id,
    });
    if (error) setError(error.message);
    else {
      setError("");
      setNp({ kind: np.kind, description: "", part_id: "", part_number: "", qty: "1", unit_price: "0", issue: true, serial: "" });
      setSerialOpts([]);
      load();
    }
  }

  function pickCatalog(desc: string) {
    const c = catalog.find((x) => x.description === desc && !x.is_service);
    if (c) {
      setNp((s) => ({ ...s, description: c.description, part_id: c.id, part_number: c.part_number ?? "", unit_price: String(c.price), serial: "" }));
      setSerialOpts([]);
      if (c.track_serial) {
        supabase.from("part_serials").select("serial_no").eq("part_id", c.id).eq("status", "in_stock").order("serial_no")
          .then(({ data }) => setSerialOpts((data ?? []).map((x) => x.serial_no as string)));
      }
    } else {
      setNp((s) => ({ ...s, description: desc, part_id: "", serial: "" }));
      setSerialOpts([]);
    }
  }

  async function updatePart(pid: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("job_parts").update(patch).eq("id", pid);
    if (error) setError(error.message);
    else {
      setError("");
      load();
    }
  }

  async function linkToStock(p: JobPart, stockId: string) {
    const item = catalog.find((x) => x.id === stockId);
    if (!item) return;
    await updatePart(p.id, { part_id: item.id, part_number: item.part_number, unit_price: item.price });
  }

  async function removePart(pid: string) {
    if (!confirm("Remove this part line? If it was issued, the stock goes back.")) return;
    const { error } = await supabase.from("job_parts").delete().eq("id", pid);
    if (error) setError(error.message);
    else load();
  }

  async function saveCharges() {
    const { error } = await supabase
      .from("job_cards")
      .update({ service_charge: Math.max(0, Number(charges.service_charge) || 0), discount: Math.max(0, Number(charges.discount) || 0) })
      .eq("id", id);
    if (error) setError(error.message);
    else {
      setError("");
      flash("Charges saved");
      load();
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(payForm.amount);
    if (!(amount > 0)) return setError("Enter the amount");
    const { error } = await supabase.from("job_payments").insert({
      job_id: id,
      amount,
      mode: payForm.mode,
      reference: payForm.reference.trim() || null,
    });
    if (error) return setError(error.message);
    setError("");
    setPayForm({ amount: "", mode: "cash", reference: "" });
    flash("Payment saved");
    load();
  }

  async function deleteJob() {
    if (!confirm("This will permanently delete the job card, its parts and payments. Are you sure?")) return;
    if (!confirm("Final confirmation: delete this job?")) return;
    const { error } = await supabase.from("job_cards").delete().eq("id", id);
    if (error) return setError(error.message);
    router.replace("/jobs");
  }

  async function deletePayment(pid: string) {
    if (!confirm("Delete this payment entry?")) return;
    const { error } = await supabase.from("job_payments").delete().eq("id", pid);
    if (error) setError(error.message);
    else load();
  }

  async function setPickup(v: boolean) {
    const { error } = await supabase.from("job_cards").update({ pickup_test_done: v }).eq("id", id);
    if (error) setError(error.message);
    else { setError(""); load(); }
  }

  async function saveVisit() {
    if (!visitForm.loc && !visitForm.addr.trim()) return setError("Choose the visit location or enter the visit address");
    const { error } = await supabase.rpc("set_visit", {
      p_job: id,
      p_location: visitForm.loc || null,
      p_address: visitForm.addr.trim() || null,
      p_km: visitForm.km.trim() !== "" && !isNaN(Number(visitForm.km)) ? Number(visitForm.km) : null,
    });
    if (error) return setError(error.message);
    setError(""); setVisitForm({ open: false, loc: "", addr: "", km: "" }); flash("Site visit saved"); load();
  }

  async function removeVisit() {
    if (!confirm("Remove the site visit details and mark this job as carry-in?")) return;
    const { error } = await supabase.rpc("clear_visit", { p_job: id });
    if (error) setError(error.message); else { setError(""); load(); }
  }

  async function createEstimate() {
    const { error } = await supabase.rpc("create_estimate", { p_job: id, p_note: estNote.trim() || null });
    if (error) return setError(error.message);
    setError(""); setEstNote(""); flash("Estimate created. The job is now Pending for approval; share the estimate with the customer."); load();
  }

  async function decideEstimate(eid: string, status: "approved" | "rejected") {
    const note = window.prompt(status === "approved" ? "Approval note (optional):" : "Reason for not approving (optional):", "");
    if (note === null) return;
    const { error } = await supabase.rpc("decide_estimate", { p_estimate: eid, p_status: status, p_note: note.trim() || null });
    if (error) return setError(error.message);
    setError("");
    flash(status === "approved" ? "Approved. The job is back with the engineer for repair." : "Declined. Parts were cancelled and the job is ready for pickup. Add a checking charge below if you want to bill one, then do the outward.");
    load();
  }

  async function sendWa(kind: WaKind, e?: Estimate) {
    if (!job) return;
    const text = kind === "taken" ? msgTaken(job) : kind === "ready" ? msgReady(job, Math.max(0, due)) : msgEstimate(job, e!);
    window.open(waLink(job.customer.whatsapp_phone || job.customer.phone, text), "_blank", "noopener");
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("job_messages").insert({ job_id: id, kind, sent_by: u.user?.id });
    load();
  }

  function openOutward(dueNow: number) {
    setOut({ ...OUT0, open: true, mode: dueNow > 0 ? "cash" : "credit", amount: String(Math.max(0, dueNow)) });
  }

  async function confirmOutward(dueNow: number) {
    const amt = out.mode === "credit" ? 0 : Math.min(Number(out.amount) || 0, dueNow);
    if (dueNow > 0 && out.mode !== "credit" && !(amt > 0)) return setError("Enter the amount, or choose 'Credit (pay later)'");
    if (!out.sign && !out.skip) return setError("Capture the customer signature, or tick 'Customer signed on paper'");
    if (out.pages.trim() !== "" && !/^\d+$/.test(out.pages.trim())) return setError("Page count must be a whole number");
    setError("");
    setOut((o) => ({ ...o, busy: true }));
    try {
      let path: string | null = null;
      if (out.sign) {
        path = `${id}/outward-${Date.now()}.png`;
        const up = await supabase.storage.from("job-files").upload(path, out.sign, { contentType: "image/png" });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("outward_job", {
        p_job: id,
        p_sign: path,
        p_mode: amt > 0 ? out.mode : null,
        p_amount: amt,
        p_ref: out.ref.trim() || null,
        p_pages: out.pages.trim() === "" ? null : Number(out.pages),
      });
      if (error) throw error;
      setOut(OUT0);
      flash("Outward done. Call closed.");
      load();
    } catch (e) {
      setError((e as Error).message);
      setOut((o) => ({ ...o, busy: false }));
    }
  }

  if (!job) {
    return <div className="text-slate-500">{error || "Loading..."}</div>;
  }

  const issuedParts = parts.filter((p) => p.state === "issued");
  const partsTotal = r2(issuedParts.reduce((s, p) => s + p.qty * Number(p.unit_price), 0));
  const partsCost = r2(issuedParts.reduce((s, p) => s + p.qty * Number(p.unit_cost), 0));
  const waitingTotal = r2(parts.filter((p) => p.state === "requested").reduce((s, p) => s + p.qty * Number(p.unit_price), 0));
  const service = Number(job.service_charge ?? 0);
  const discount = Number(job.discount ?? 0);
  const grand = r2(partsTotal + service - discount);
  const paidTotal = r2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const due = r2(grand - paidTotal);
  const payLabel =
    grand === 0 ? { t: "No charge", c: "bg-slate-100 text-slate-700" }
    : due <= 0 ? { t: "Paid", c: "bg-emerald-100 text-emerald-800" }
    : job.on_credit ? { t: "On credit", c: "bg-red-100 text-red-800" }
    : paidTotal > 0 ? { t: "Part paid", c: "bg-amber-100 text-amber-800" }
    : { t: "Not paid yet", c: "bg-amber-100 text-amber-800" };
  const c = job.customer;
  const d = job.device;
  const closed = job.status === "outward";
  const editable = !closed || (isAdmin && !!job.unlocked_at);

  const payFormEl =
    due > 0 ? (
      <form onSubmit={addPayment} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <label className="text-xs text-slate-600">Amount
          <input type="number" min={0} step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder={String(due)} className="field mono mt-1 w-32" />
        </label>
        <label className="text-xs text-slate-600">Mode
          <select value={payForm.mode} onChange={(e) => setPayForm({ ...payForm, mode: e.target.value as PayMode })} className="field mt-1">
            <option value="cash">Cash</option>
            <option value="online">Online / UPI</option>
          </select>
        </label>
        {payForm.mode === "online" && (
          <label className="text-xs text-slate-600">Reference
            <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="field mono mt-1 w-40" />
          </label>
        )}
        <button className="btn btn-primary btn-sm">Receive payment</button>
        <button type="button" onClick={() => setPayForm({ ...payForm, amount: String(due) })} className="btn btn-ghost btn-sm">Full {money(due)}</button>
      </form>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/jobs" className="text-sm text-blue-700 hover:underline">
            &larr; All jobs
          </Link>
          <h1 className="mono mt-1 flex flex-wrap items-center gap-3 text-2xl font-medium tracking-tight text-ink">
            {job.job_no} <span className="font-sans"><StatusBadge status={job.status} /></span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {job.customer.name} - {[d.brand, d.model_no].filter(Boolean).join(" ") || job.category?.name}
          </p>
        </div>
        <div className="flex gap-2">
          {d.serial_no && (
            <Link
              href={`/jobs?q=${encodeURIComponent(d.serial_no)}`}
              className="btn btn-ghost"
            >
              Device history
            </Link>
          )}
          <Link
            href={`/jobs/${id}/print`}
            target="_blank"
            className="btn btn-primary"
          >
            Print report
          </Link>
          <Link href={`/jobs/${id}/bill`} target="_blank" className="btn btn-ghost">
            Print bill
          </Link>
          {isAdmin && (
            <button onClick={deleteJob} className="btn btn-ghost text-red-700">Delete job</button>
          )}
        </div>
      </div>

      <StatusTrack job={job} />

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {msg && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</p>}

      {job.repair_declined && (
        <p className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          The customer declined the quotation, so no repair was done. Add a checking charge if you want to bill one, then hand the product over (outward).
        </p>
      )}
      {closed && !job.unlocked_at && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
          <span>This call is <b>closed and locked</b>. Nothing can be edited{isAdmin ? "" : "; only an admin can unlock it"}. Payments for a credit balance can still be added.</span>
          {isAdmin && <button onClick={unlockJob} className="btn btn-sm">Unlock for editing</button>}
        </div>
      )}
      {closed && job.unlocked_at && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            <b>Unlocked for editing</b> on {fmtDateTime(job.unlocked_at)}{job.unlock_reason ? ` - ${job.unlock_reason}` : ""}.
            {isAdmin ? " Lock it again when you finish." : " Only an admin can edit it now."}
          </span>
          {isAdmin && <button onClick={lockJob} className="btn btn-sm btn-primary">Lock again</button>}
        </div>
      )}

      <fieldset disabled={!editable} className="m-0 block min-w-0 space-y-5 border-0 p-0">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Customer */}
        <div className={card}>
          <h2 className="mb-3 font-medium">Customer</h2>
          <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
            <dt className="text-slate-500">Name</dt>
            <dd>{c.name}</dd>
            <dt className="text-slate-500">Company</dt>
            <dd>{c.company || "-"}</dd>
            <dt className="text-slate-500">Contact person</dt>
            <dd>{c.contact_person || "-"}</dd>
            <dt className="text-slate-500">Phone</dt>
            <dd>{c.phone}</dd>
            <dt className="text-slate-500">WhatsApp</dt>
            <dd>{c.whatsapp_phone || c.phone}</dd>
            <dt className="text-slate-500">Email</dt>
            <dd>{c.email || "-"}</dd>
            <dt className="text-slate-500">Address</dt>
            <dd>{[c.address, c.city, c.pincode].filter(Boolean).join(", ") || "-"}</dd>
          </dl>
        </div>

        {/* Device */}
        <div className={card}>
          <h2 className="mb-3 font-medium">Product ({job.category?.name})</h2>
          <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
            <dt className="text-slate-500">Brand / Model</dt>
            <dd>{[d.brand, d.model_no].filter(Boolean).join(" ") || "-"}</dd>
            <dt className="text-slate-500">Serial no</dt>
            <dd>{d.serial_no || "-"}</dd>
            <dt className="text-slate-500">Purchase date</dt>
            <dd>{d.purchase_date || "-"}</dd>
            {fieldDefs.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-slate-500">{f.label}</dt>
                <dd>{job.extra_fields?.[f.key] || "-"}</dd>
              </div>
            ))}
            <dt className="text-slate-500">Accessories received</dt>
            <dd>{job.accessories?.length ? job.accessories.join(", ") : "-"}</dd>
            <dt className="text-slate-500">Reported problem</dt>
            <dd className="whitespace-pre-wrap">{job.reported_problem || "-"}</dd>
          </dl>
          {inSign && (
            <div className="mt-3">
              <div className="text-xs text-slate-500">Customer signature (inward)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inSign} alt="Inward signature" className="mt-1 h-20 rounded border bg-white" />
            </div>
          )}
        </div>
      </div>

      {/* Workflow */}
      <div className={card}>
        <h2 className="mb-3 font-medium">Repair details</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className={label}>Repair engineer</label>
            <select
              value={job.repair_engineer ?? ""}
              onChange={(e) => assignEngineer(e.target.value)}
              className={input}
            >
              <option value="">{["in_repair", "pending_spares", "pending_tech", "pending_approval"].includes(job.status) ? "- back to waiting list -" : "- not assigned -"}</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} {e.eng_code ? `(${e.eng_code})` : ""}
                </option>
              ))}
            </select>
            {job.repair_engineer && (
              <div className="mt-1.5 text-xs text-slate-600">
                Accepted {fmtDateTime(job.accepted_at)}
                <br />
                {job.repair_started_at ? (
                  <>Repair started {fmtDateTime(job.repair_started_at)}</>
                ) : ["in_repair", "pending_spares", "pending_tech", "pending_approval"].includes(job.status) ? (
                  <>
                    <span className="font-medium text-amber-700">Repair not started yet</span>{" "}
                    <button onClick={startRepair} className="text-bench underline">Start repair</button>
                  </>
                ) : null}
              </div>
            )}
          </div>
          <div>
            <label className={label}>Call type</label>
            <select value={edit.call_type} onChange={(e) => setEdit({ ...edit, call_type: e.target.value })} className={input}>
              <option value="">-</option>
              {Object.entries(CALL_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Service type</label>
            <select value={edit.service_type} onChange={(e) => setEdit({ ...edit, service_type: e.target.value })} className={input}>
              <option value="">-</option>
              {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Warranty status</label>
            <select value={edit.warranty_status} onChange={(e) => setEdit({ ...edit, warranty_status: e.target.value })} className={input}>
              <option value="">-</option>
              {Object.entries(WARRANTY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>RMA no</label>
            <input value={edit.rma_no} onChange={(e) => setEdit({ ...edit, rma_no: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Page count - inward</label>
            <input inputMode="numeric" value={edit.pages_in} onChange={(e) => setEdit({ ...edit, pages_in: e.target.value })} className={`${input} mono`} placeholder="Counter reading" />
          </div>
          <div>
            <label className={label}>Page count - outward</label>
            <input inputMode="numeric" value={edit.pages_out} onChange={(e) => setEdit({ ...edit, pages_out: e.target.value })} className={`${input} mono`} placeholder="Counter reading" />
          </div>
          <div>
            <label className={label}>Issue category</label>
            <select value={edit.issue_category_id} onChange={(e) => setEdit({ ...edit, issue_category_id: e.target.value })} className={input}>
              <option value="">-</option>
              {issueOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">Press Save details after changing it.</span>
          </div>
          <div className="md:col-span-3">
            <label className={label}>Private note <span className="font-normal text-slate-400">(staff only, never printed or sent to the customer)</span></label>
            <textarea value={edit.internal_note} onChange={(e) => setEdit({ ...edit, internal_note: e.target.value })} rows={2} className={input} />
          </div>
          {job.issue?.needs_pickup_test && (
            <div className="md:col-span-2">
              <label className={label}>Paper pickup test</label>
              <label className="flex items-start gap-2 rounded-md border border-line bg-slate-50 p-2.5 text-sm">
                <input type="checkbox" className="mt-0.5" checked={job.pickup_test_done} disabled={job.status === "outward"} onChange={(e) => setPickup(e.target.checked)} />
                <span>
                  Paper pickup tested with 50 to 60 pages and working correctly
                  <span className="block text-xs text-slate-500">
                    {job.pickup_test_done ? `Confirmed ${fmtDateTime(job.pickup_test_at)}` : "Required before the job can be marked Ready."}
                  </span>
                </span>
              </label>
            </div>
          )}
          <div className="md:col-span-3">
            <label className={label}>Customer feedback</label>
            <div className="flex gap-2">
              <select value={edit.customer_feedback} onChange={(e) => setEdit({ ...edit, customer_feedback: e.target.value })} className={input}>
                <option value="">-</option>
                {Object.entries(FEEDBACK_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                placeholder="Feedback note"
                value={edit.feedback_note}
                onChange={(e) => setEdit({ ...edit, feedback_note: e.target.value })}
                className={input}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={label}>Observed problem</label>
            <textarea rows={3} value={edit.observed_problem} onChange={(e) => setEdit({ ...edit, observed_problem: e.target.value })} className={input} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>Action taken / rectification</label>
            <textarea rows={3} value={edit.action_taken} onChange={(e) => setEdit({ ...edit, action_taken: e.target.value })} className={input} />
          </div>
        </div>
        <button onClick={saveDetails} className="mt-4 btn btn-primary">
          Save details
        </button>

        <div className="mt-5 border-t pt-4">
          <div className="mb-2 text-xs font-medium text-slate-500">Change status</div>
          <div className="flex flex-wrap gap-2">
            {(["in_repair", "pending_spares", "pending_tech", "ready"] as Status[]).map((s) => (
              <button
                key={s}
                disabled={job.status === s || job.status === "outward"}
                onClick={() => setStatus(s)}
                className="btn btn-ghost btn-sm disabled:opacity-40"
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
            <button
              disabled={job.status !== "ready" || out.open}
              onClick={() => openOutward(due)}
              className="btn btn-go btn-sm disabled:opacity-40"
            >
              Mark outward (customer took it)
            </button>
          </div>
          {out.open && (
            <div className="mt-4 max-w-2xl rounded-md border border-line bg-slate-50 p-4">
              <div className="text-sm font-medium text-ink">Hand over to customer</div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Bill total</dt><dd className="mono">{money(grand)}</dd></div>
                <div><dt className="text-xs text-slate-500">Paid so far</dt><dd className="mono">{money(paidTotal)}</dd></div>
                <div><dt className="text-xs text-slate-500">To collect</dt><dd className="mono font-medium">{money(Math.max(0, due))}</dd></div>
              </dl>

              {due > 0 ? (
                <fieldset className="mt-4">
                  <legend className="text-xs font-medium text-slate-600">How is the customer paying?</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([["cash", "Cash"], ["online", "Online / UPI"], ["credit", "Credit (pay later)"]] as const).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={out.mode === k}
                        onClick={() => setOut({ ...out, mode: k, amount: k === "credit" ? "0" : String(due) })}
                        className={`rounded-full border px-3 py-1.5 text-sm ${out.mode === k ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-slate-400"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {out.mode !== "credit" && (
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="text-xs text-slate-600">Amount received now
                        <input type="number" min={0} max={due} step="0.01" value={out.amount} onChange={(e) => setOut({ ...out, amount: e.target.value })} className="field mono mt-1 w-40" />
                      </label>
                      {out.mode === "online" && (
                        <label className="text-xs text-slate-600">UPI / transaction reference
                          <input value={out.ref} onChange={(e) => setOut({ ...out, ref: e.target.value })} className="field mono mt-1 w-56" />
                        </label>
                      )}
                      {Number(out.amount) > 0 && Number(out.amount) < due && (
                        <span className="pb-2 text-xs font-medium text-red-700">{money(r2(due - Number(out.amount)))} will stay on credit</span>
                      )}
                    </div>
                  )}
                  {out.mode === "credit" && <p className="mt-3 text-sm text-red-700">{money(due)} will be marked as credit for this customer.</p>}
                </fieldset>
              ) : (
                <p className="mt-3 text-sm text-slate-600">{grand === 0 ? "No charge for this job." : "Fully paid. Nothing to collect."}</p>
              )}

              <label className="mt-4 block text-xs text-slate-600">Page count at outward (optional)
                <input inputMode="numeric" value={out.pages} onChange={(e) => setOut({ ...out, pages: e.target.value })} className="field mono mt-1 w-48" placeholder="Counter reading" />
              </label>

              <div className="mt-4">
                <div className="text-xs font-medium text-slate-600">Customer signature</div>
                {out.signUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={out.signUrl} alt="Outward signature" className="my-2 h-16 rounded border border-line bg-white" />
                )}
                {out.signing ? (
                  <SignaturePad
                    onCancel={() => setOut({ ...out, signing: false })}
                    onSave={(b) => setOut({ ...out, sign: b, signUrl: URL.createObjectURL(b), signing: false, skip: false })}
                  />
                ) : (
                  <button type="button" onClick={() => setOut({ ...out, signing: true })} className="btn btn-ghost btn-sm mt-1">{out.sign ? "Sign again" : "Take signature"}</button>
                )}
                {!out.sign && (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={out.skip} onChange={(e) => setOut({ ...out, skip: e.target.checked })} /> Customer signed on paper
                  </label>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button disabled={out.busy || out.signing} onClick={() => confirmOutward(due)} className="btn btn-go">{out.busy ? "Saving" : "Confirm outward"}</button>
                <button onClick={() => setOut(OUT0)} className="btn btn-ghost">Cancel</button>
              </div>
            </div>
          )}
          {outSign && (
            <div className="mt-3">
              <div className="text-xs text-slate-500">Outward done by <b className="text-ink">{personLabel(job.outwarder)}</b> on {fmtDateTime(job.outward_at)}</div>
              <div className="mt-2 text-xs text-slate-500">Customer signature (outward)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={outSign} alt="Outward signature" className="mt-1 h-20 rounded border bg-white" />
            </div>
          )}
        </div>
      </div>

      {/* Site visit */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Carry-in / site visit</h2>
          {job.service_type === "onsite" ? (
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">Site visit</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Carry-in</span>
          )}
        </div>
        {job.service_type === "onsite" ? (
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
            <div><div className="text-xs text-slate-500">Location</div>{locs.find((l) => l.id === job.visit_location_id)?.name ?? "-"}</div>
            <div className="md:col-span-2"><div className="text-xs text-slate-500">Visit address</div>{job.visit_address || c.address || "-"}</div>
            <div>
              <div className="text-xs text-slate-500">Km (set by CRM / Admin)</div>
              {job.visit_km === null || job.visit_km === undefined ? <span className="text-amber-700">Km pending</span> : <span className="mono">{Number(job.visit_km).toFixed(1)} km</span>}
            </div>
            <div className="md:col-span-4 text-xs text-slate-500">Visited {fmtDateTime(job.visited_at)}</div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">The customer brought the product in. If an engineer visits the customer location, record it here so the km is counted in reports.</p>
        )}
        {visitForm.open ? (
          <div className="mt-4 grid max-w-3xl gap-3 md:grid-cols-[1fr_1fr_7rem_auto] md:items-end">
            <label className="text-xs text-slate-600">Visit location
              <select value={visitForm.loc} onChange={(e) => setVisitForm({ ...visitForm, loc: e.target.value })} className={`${input} mt-1`}>
                <option value="">Select location</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name} - {Number(l.km).toFixed(1)} km</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">Visit address
              <input value={visitForm.addr} onChange={(e) => setVisitForm({ ...visitForm, addr: e.target.value })} className={`${input} mt-1`} />
            </label>
            {(profile?.role === "crm" || isAdmin) ? (
              <label className="text-xs text-slate-600">Km override
                <input inputMode="decimal" value={visitForm.km} onChange={(e) => setVisitForm({ ...visitForm, km: e.target.value })} className={`${input} mono mt-1`} placeholder="optional" />
              </label>
            ) : <span />}
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={saveVisit}>Save visit</button>
              <button className="btn" onClick={() => setVisitForm({ open: false, loc: "", addr: "", km: "" })}>Cancel</button>
            </div>
          </div>
        ) : job.status !== "outward" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => setVisitForm({ open: true, loc: job.visit_location_id ?? "", addr: job.visit_address ?? "", km: "" })}>
              {job.service_type === "onsite" ? "Change visit details" : "Engineer visited the customer location"}
            </button>
            {job.service_type === "onsite" && <button className="btn btn-sm" onClick={removeVisit}>Mark as carry-in</button>}
          </div>
        )}
      </div>

      {/* Earlier calls on this product */}
      {history.length > 0 && (
        <div className={card}>
          <h2 className="mb-2 font-medium">Earlier calls on this product ({history.length})</h2>
          <ul className="divide-y divide-line text-sm">
            {history.map((h) => (
              <li key={h.id} className="py-2">
                <Link href={`/jobs/${h.id}`} className="font-medium text-blue-700 underline">{h.job_no}</Link>
                {h.rma_no && <span className="mono ml-2 text-xs text-slate-600">RMA {h.rma_no}</span>}
                <span className="ml-2 text-xs text-slate-500">{fmtDateTime(h.received_at)} - {STATUS_LABEL[h.status as keyof typeof STATUS_LABEL] ?? h.status}</span>
                {h.reported_problem && <div className="text-xs text-slate-600">Problem: {h.reported_problem}</div>}
                {h.action_taken && <div className="text-xs text-slate-600">Action: {h.action_taken}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(callInfo || profile?.role === "crm" || isAdmin) && (
        <CallInfoCard jobId={id} info={callInfo} canEdit={(profile?.role === "crm" || isAdmin) && editable} onSaved={() => { flash("Saved"); load(); }} onError={setError} />
      )}

      {/* Parts */}
      <div className={card}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Parts</h2>
          {waitingTotal > 0 && <span className="text-xs text-slate-500">{money(waitingTotal)} of requested parts is not in the bill until issued</span>}
        </div>
        {parts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Part</th>
                  <th className="pr-3">Qty</th>
                  <th className="pr-3">Selling price</th>
                  <th className="pr-3 text-right">Amount</th>
                  {isAdmin && <th className="pr-3 text-right">Cost</th>}
                  <th className="pr-3">State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => (
                  <tr key={p.id} className={`border-b border-line last:border-0 ${p.state === "cancelled" ? "opacity-50" : ""}`}>
                    <td className="py-2 pr-3">
                      <div>{p.description}</div>
                      {p.part_number === "SERVICE" ? (
                        <span className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">Service</span>
                      ) : (
                        <div className="mono text-xs text-slate-500">{p.part_number || "no part no"}{p.serial_no ? ` - S/N ${p.serial_no}` : ""}</div>
                      )}
                      {!p.part_id && p.part_number !== "SERVICE" && p.state === "requested" && catalog.some((c) => !c.is_service) && (
                        <select
                          aria-label="Link to stock item"
                          defaultValue=""
                          onChange={(e) => e.target.value && linkToStock(p, e.target.value)}
                          className="field field-sm mt-1 max-w-56 text-xs"
                        >
                          <option value="">Link to stock item...</option>
                          {catalog.filter((c) => !c.is_service).map((c) => (
                            <option key={c.id} value={c.id}>{c.description} (stock {c.stock_qty})</option>
                          ))}
                        </select>
                      )}
                      {!p.part_id && p.part_number !== "SERVICE" && p.state === "issued" && <div className="text-xs text-slate-400">Not from stock</div>}
                      {p.state === "issued" && p.part_number !== "SERVICE" && (
                        <PartSource p={p} isHead={!!catalog.find((c) => c.id === p.part_id)?.is_head} onSaved={() => { flash("Saved"); load(); }} onError={setError} />
                      )}
                    </td>
                    <td className="pr-3">{p.part_number === "SERVICE" ? "-" : p.qty}</td>
                    <td className="pr-3">
                      <input
                        type="number"
                        defaultValue={p.unit_price}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          if (v !== Number(p.unit_price)) updatePart(p.id, { unit_price: v });
                        }}
                        className="field field-sm mono w-24"
                      />
                    </td>
                    <td className="mono pr-3 text-right">{money(p.qty * Number(p.unit_price))}</td>
                    {isAdmin && <td className="mono pr-3 text-right text-slate-500">{p.state === "issued" && p.part_id ? money(p.qty * Number(p.unit_cost)) : "-"}</td>}
                    <td className="pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          p.state === "issued" ? "bg-emerald-100 text-emerald-800"
                          : p.state === "cancelled" ? "bg-slate-200 text-slate-600"
                          : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {p.state === "issued" ? "Issued" : p.state === "cancelled" ? "Cancelled" : "Requested"}
                      </span>
                    </td>
                    <td className="space-x-2 whitespace-nowrap text-right text-xs">
                      {p.state === "requested" && (
                        <button onClick={() => approvalPending("Issue this part") && updatePart(p.id, { state: "issued" })} className="text-emerald-700 underline">Issue</button>
                      )}
                      {p.state !== "cancelled" && (
                        <button onClick={() => updatePart(p.id, { state: "cancelled" })} className="text-slate-600 underline">Cancel</button>
                      )}
                      <button onClick={() => removePart(p.id)} className="text-red-600 underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 inline-flex rounded-md border border-line p-0.5 text-sm" role="group" aria-label="What are you adding">
          {(["product", "service"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={np.kind === k}
              onClick={() => setNp({ ...np, kind: k, part_id: "", part_number: "", description: "", issue: true })}
              className={`rounded px-4 py-1.5 font-medium ${np.kind === k ? "bg-ink text-white" : "text-slate-600 hover:text-ink"}`}
            >
              {k === "product" ? "Product / part" : "Service"}
            </button>
          ))}
        </div>
        <form onSubmit={addPart} className={`mt-3 grid items-end gap-2 ${np.kind === "service" ? "md:grid-cols-[2fr_160px_auto]" : serialOpts.length > 0 ? "md:grid-cols-[2fr_150px_80px_120px_auto_auto]" : "md:grid-cols-[2fr_80px_120px_auto_auto]"}`}>
          <label className="text-xs text-slate-600">{np.kind === "service" ? "Service name" : "Add a part"}
            <input
              list={np.kind === "service" ? "catalog_svc" : "catalog"}
              placeholder={np.kind === "service" ? "e.g. Software installation, Cleaning" : "Pick from stock or type a name"}
              value={np.description}
              onChange={(e) => {
                if (np.kind !== "service") return pickCatalog(e.target.value);
                const svc = catalog.find((x) => x.is_service && x.description === e.target.value);
                setNp({ ...np, description: e.target.value, unit_price: svc ? String(svc.price) : np.unit_price });
              }}
              className={`${input} mt-1`}
            />
          </label>
          <datalist id="catalog_svc">
            {catalog.filter((c) => c.is_service).map((c) => (
              <option key={c.id} value={c.description}>{`₹${c.price}`}</option>
            ))}
          </datalist>
          <datalist id="catalog">
            {catalog.filter((c) => !c.is_service).map((c) => (
              <option key={c.id} value={c.description}>{`stock ${c.stock_qty}`}</option>
            ))}
          </datalist>
          {np.kind === "product" && serialOpts.length > 0 && (
            <label className="text-xs text-slate-600">Serial no
              <select value={np.serial} onChange={(e) => setNp({ ...np, serial: e.target.value, qty: e.target.value ? "1" : np.qty })} className={`${input} mono mt-1`}>
                <option value="">Select serial</option>
                {serialOpts.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          )}
          {np.kind === "product" && (
            <label className="text-xs text-slate-600">Qty
              <input type="number" min={1} value={np.qty} onChange={(e) => setNp({ ...np, qty: e.target.value })} className={`${input} mono mt-1`} />
            </label>
          )}
          <label className="text-xs text-slate-600">{np.kind === "service" ? "Service charge" : "Selling price"}
            <input type="number" min={0} step="0.01" value={np.unit_price} onChange={(e) => setNp({ ...np, unit_price: e.target.value })} className={`${input} mono mt-1`} />
          </label>
          {np.kind === "product" && (
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={np.issue} onChange={(e) => setNp({ ...np, issue: e.target.checked })} /> Issue now</label>
          )}
          <button className="btn btn-primary">{np.kind === "service" ? "Add service" : "Add part"}</button>
        </form>
        {np.kind === "product" && np.part_id && (() => {
          const it = catalog.find((x) => x.id === np.part_id);
          if (!it) return null;
          const short = np.issue && (parseInt(np.qty) || 1) > it.stock_qty;
          return (
            <p className={`mt-2 text-xs ${short ? "font-medium text-red-700" : "text-slate-500"}`}>
              In stock: {it.stock_qty}{short ? ". Not enough stock to issue this quantity." : ""}
            </p>
          );
        })()}
      </div>

      {/* Estimate and WhatsApp */}
      <div className={card}>
        <h2 className="mb-1 font-medium">Estimate and WhatsApp</h2>
        <p className="mb-3 text-xs text-slate-500">
          The estimate is built from the parts and services added on this job (including those added from the engineer app) plus the service charge.
          WhatsApp opens with the message ready; press Send there.
        </p>
        {job.quotation_requested_at && job.status !== "pending_approval" && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
            The engineer asked for a quotation on {fmtDateTime(job.quotation_requested_at)}{job.quotation_note ? `: "${job.quotation_note}"` : "."}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <input value={estNote} onChange={(e) => setEstNote(e.target.value)} placeholder="Note for the customer (optional)" className="field w-72" />
          <button className="btn btn-primary" disabled={job.status === "outward"} onClick={createEstimate}>Generate estimate</button>
        </div>

        {estimates.length > 0 && (
          <div className="mt-4 space-y-2">
            {estimates.map((e) => (
              <div key={e.id} className={`rounded-md border p-3 text-sm ${e.status === "superseded" ? "border-line opacity-60" : "border-line bg-slate-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mono font-medium">{money(Number(e.total))}</span>{" "}
                    <span className="text-xs text-slate-500">{fmtDateTime(e.created_at)} - {e.lines.length} item(s){Number(e.service_charge) > 0 ? " + service charge" : ""}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    e.status === "approved" ? "bg-emerald-100 text-emerald-800"
                    : e.status === "rejected" ? "bg-red-100 text-red-800"
                    : e.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"}`}>
                    {e.status === "approved" ? "Approved" : e.status === "rejected" ? "Not approved" : e.status === "pending" ? "Waiting for approval" : "Replaced"}
                  </span>
                </div>
                {e.note && <div className="mt-1 text-xs text-slate-600">Note: {e.note}</div>}
                {e.decided_at && <div className="mt-1 text-xs text-slate-600">Decision recorded {fmtDateTime(e.decided_at)}{e.decision_note ? ` - ${e.decision_note}` : ""}</div>}
                {e.status !== "superseded" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/jobs/${id}/estimate?e=${e.id}`} target="_blank" className="btn btn-sm">Print estimate</Link>
                    <button className="btn btn-sm" onClick={() => sendWa("estimate", e)}>Send on WhatsApp</button>
                    {e.status === "pending" && (
                      <>
                        <button className="btn btn-go btn-sm" onClick={() => decideEstimate(e.id, "approved")}>Customer approved</button>
                        <button className="btn btn-sm text-red-700" onClick={() => decideEstimate(e.id, "rejected")}>Not approved</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 text-xs font-medium text-slate-500">WhatsApp to {c.name} ({c.whatsapp_phone || c.phone})</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => sendWa("taken")}>Taken for repair</button>
            <button className="btn btn-sm" onClick={() => sendWa("ready")}>Ready for delivery</button>
          </div>
          {sent.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-slate-500">
              {sent.slice(0, 6).map((m) => (
                <li key={m.id}>{WA_LABEL[m.kind as WaKind] ?? m.kind} opened in WhatsApp by {m.by?.full_name ?? "-"} on {fmtDateTime(m.at)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bill and payment */}
      <div className={card}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-medium">Bill and payment</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${payLabel.c}`}>{payLabel.t}</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
              <dt className="text-slate-600">Parts issued</dt><dd className="mono text-right">{money(partsTotal)}</dd>
              <dt className="self-center text-slate-600">Service charge</dt>
              <dd className="text-right"><input type="number" min={0} step="0.01" value={charges.service_charge} onChange={(e) => setCharges({ ...charges, service_charge: e.target.value })} aria-label="Service charge" className="field field-sm mono w-28 text-right" /></dd>
              <dt className="self-center text-slate-600">Discount</dt>
              <dd className="text-right"><input type="number" min={0} step="0.01" value={charges.discount} onChange={(e) => setCharges({ ...charges, discount: e.target.value })} aria-label="Discount" className="field field-sm mono w-28 text-right" /></dd>
              <dt className="border-t border-line pt-2 font-medium">Bill total</dt><dd className="mono border-t border-line pt-2 text-right font-medium">{money(grand)}</dd>
              <dt className="text-slate-600">Paid</dt><dd className="mono text-right">{money(paidTotal)}</dd>
              <dt className="font-medium">{due > 0 ? "Balance due" : "Balance"}</dt>
              <dd className={`mono text-right text-base font-medium ${due > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(due)}</dd>
              {isAdmin && (
                <>
                  <dt className="text-xs text-slate-500">Profit on this job (bill minus part cost {money(partsCost)})</dt>
                  <dd className="mono text-right text-xs text-slate-600">{money(r2(grand - partsCost))}</dd>
                </>
              )}
            </dl>
            <button onClick={saveCharges} className="btn btn-ghost btn-sm mt-3">Save charges</button>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-slate-600">Payments received</div>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">No payment yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="mono font-medium">{money(Number(p.amount))} <span className="font-sans text-xs font-normal text-slate-500">{MODE_LABEL[p.mode]}{p.reference ? `, ${p.reference}` : ""}</span></div>
                      <div className="text-xs text-slate-500">{fmtDateTime(p.paid_at)} by {p.by?.full_name ?? "-"}</div>
                    </div>
                    {profile?.role === "admin" && <button onClick={() => deletePayment(p.id)} className="text-xs text-red-600 underline">Delete</button>}
                  </li>
                ))}
              </ul>
            )}
            {editable && payFormEl}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Timeline */}
        <div className={card}>
          <h2 className="mb-3 font-medium">Timeline</h2>
          <ol className="space-y-3 text-sm">
            {log.map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 pl-3">
                <div className="font-medium">{STATUS_LABEL[l.to_status]}</div>
                <div className="text-xs text-slate-500">
                  {fmtDateTime(l.changed_at)} &middot; {personLabel(l.by)}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid grid-cols-[130px_1fr] gap-y-1 text-xs text-slate-600">
            <span>Received by</span><span>{personLabel(job.received)}</span>
            <span>Repair engineer</span><span>{personLabel(job.repair)}</span>
            <span>Received</span><span>{fmtDateTime(job.received_at)}</span>
            <span>Accepted</span><span>{fmtDateTime(job.accepted_at)}</span>
            <span>Repair started</span><span>{fmtDateTime(job.repair_started_at)}</span>
            <span>Ready</span><span>{fmtDateTime(job.ready_at)}</span>
            <span>Outward</span><span>{fmtDateTime(job.outward_at)}</span>
            <span>Outward by</span><span>{personLabel(job.outwarder)}</span>
          </div>
          {transfers.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Transfers</h3>
              <ul className="space-y-2 text-xs text-slate-600">
                {transfers.map((t) => (
                  <li key={t.id}>
                    <b className="text-ink">{t.from ? personLabel(t.from) : "Waiting list"}</b> to <b className="text-ink">{t.to ? personLabel(t.to) : "Waiting list"}</b>
                    <br />
                    {fmtDateTime(t.at)} &middot; by {personLabel(t.by)}{t.note ? ` · "${t.note}"` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className={card}>
          <h2 className="mb-3 font-medium">SMS / WhatsApp messages</h2>
          {notifs.length === 0 ? (
            <p className="text-sm text-slate-500">No messages sent yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notifs.map((n) => (
                <li key={n.id} className="flex justify-between gap-2">
                  <span>
                    {n.event} &middot; {n.channel} &middot; {n.to_phone}
                  </span>
                  <span className="text-xs text-slate-500">
                    {n.status} &middot; {fmtDateTime(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </fieldset>
      {!editable && payFormEl && (
        <div className={card}>
          <h2 className="font-medium">Collect the remaining balance</h2>
          <p className="text-xs text-slate-500">Balance due {money(due)}. Payments can still be recorded on a closed job.</p>
          {payFormEl}
        </div>
      )}
    </div>
  );
}


/** Where an issued part came from: stock, a DOA printer, or another product. Private - never printed. */
function PartSource({ p, isHead, onSaved, onError }: {
  p: JobPart; isHead: boolean; onSaved: () => void; onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [headId, setHeadId] = useState(p.head_id ?? "");
  const [src, setSrc] = useState<string>(p.source_type ?? "stock");
  const [ser, setSer] = useState(p.donor_serial ?? "");
  const [model, setModel] = useState("");
  const [note, setNote] = useState(p.source_note ?? "");
  const missing = isHead && !(p.head_id ?? "").trim();
  const save = async () => {
    const { error } = await supabase.rpc("set_part_source", {
      p_job_part: p.id, p_head_id: headId, p_source: src, p_donor_serial: ser, p_note: note, p_donor_model: model,
    });
    if (error) onError(error.message);
    else { onError(""); setOpen(false); onSaved(); }
  };
  const summary = [
    p.head_id ? `Head ID ${p.head_id}` : "",
    p.source_type === "doa_printer" ? `from DOA printer S/N ${p.donor_serial}` : p.source_type === "other_asset" ? `taken from S/N ${p.donor_serial}` : "",
  ].filter(Boolean).join(" - ");
  return (
    <div className="mt-1 text-xs">
      {summary && <div className="text-slate-600">{summary}</div>}
      {missing && <div className="font-medium text-amber-700">Head ID is required before the job can be marked Ready</div>}
      {!open ? (
        <button type="button" className="text-blue-700 underline" onClick={() => setOpen(true)}>
          {summary || isHead ? "Edit head ID / source" : "Add source details (private)"}
        </button>
      ) : (
        <div className="mt-1 space-y-2 rounded border border-line bg-slate-50 p-2">
          {isHead && (
            <input value={headId} onChange={(e) => setHeadId(e.target.value)} placeholder="Head ID of the new head" className="field field-sm mono w-full" />
          )}
          <select value={src} onChange={(e) => setSrc(e.target.value)} className="field field-sm w-full">
            <option value="stock">New part from stock</option>
            <option value="doa_printer">Taken from a DOA printer</option>
            <option value="other_asset">Taken from another product</option>
          </select>
          {src !== "stock" && (
            <>
              <input value={ser} onChange={(e) => setSer(e.target.value)} placeholder="Serial number of that printer / product" className="field field-sm mono w-full" />
              {src === "doa_printer" && <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model of the DOA printer (optional)" className="field field-sm w-full" />}
            </>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note (not printed)" className="field field-sm w-full" />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}


const INFO_FIELDS: [string, string][] = [
  ["area_code", "Area code"], ["incoming_source", "Incoming source"], ["service_center", "Service centre"],
  ["assigned_to_name", "Assigned to"], ["rma_hold_status", "RMA hold status"], ["sr_no", "SR number"],
  ["jr_no", "JR number"], ["courier", "Courier"], ["docket_no", "Docket number"],
];

/** RMA / OEM call details (area, SR / JR numbers, courier, docket...). CRM and Admin edit; everyone can read. */
function CallInfoCard({ jobId, info, canEdit, onSaved, onError }: {
  jobId: string; info: Record<string, unknown> | null; canEdit: boolean; onSaved: () => void; onError: (m: string) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const v: Record<string, string> = {};
    for (const [k] of INFO_FIELDS) v[k] = ((info?.[k] as string | null) ?? "");
    setVals(v);
  }, [info]);
  const hasAny = INFO_FIELDS.some(([k]) => (info?.[k] as string | null));
  if (!canEdit && !hasAny && !info) return null;
  const save = async () => {
    const row: Record<string, unknown> = { job_id: jobId };
    for (const [k] of INFO_FIELDS) row[k] = vals[k]?.trim() || null;
    const { error } = await supabase.from("job_call_info").upsert(row);
    if (error) onError(error.message); else { onError(""); onSaved(); }
  };
  const extra: [string, string][] = [];
  if (info?.running_status) extra.push(["Running status", String(info.running_status)]);
  if (info?.concurrent_status) extra.push(["Concurrent status", String(info.concurrent_status)]);
  if (info?.hold_from) extra.push(["Hold from", fmtDateTime(String(info.hold_from))]);
  if (info?.hold_to) extra.push(["Hold to", fmtDateTime(String(info.hold_to))]);
  const sched = (info?.schedule as string[] | undefined) ?? [];
  if (sched.length) extra.push(["Repair scheduled", sched.map((x) => fmtDateTime(x)).join(", ")]);
  return (
    <div className="panel p-5">
      <h2 className="mb-3 font-medium">RMA / call details</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {INFO_FIELDS.map(([k, lbl]) => (
          <label key={k} className="block text-xs text-slate-600">{lbl}
            <input value={vals[k] ?? ""} disabled={!canEdit} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} className="field field-sm mt-1 w-full" />
          </label>
        ))}
      </div>
      {extra.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs md:grid-cols-2">
          {extra.map(([k, v]) => (<div key={k} className="flex gap-2"><dt className="text-slate-500">{k}:</dt><dd>{v}</dd></div>))}
        </dl>
      )}
      {canEdit && <button type="button" className="btn btn-primary btn-sm mt-3" onClick={save}>Save call details</button>}
    </div>
  );
}
