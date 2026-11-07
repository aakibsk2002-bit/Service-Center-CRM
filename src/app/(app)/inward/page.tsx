"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Category, VisitLocation } from "@/lib/types";
import { msgReceived, waLink } from "@/lib/whatsapp";
import SignaturePad from "@/components/SignaturePad";
import ProductSearch, { type ProductHit } from "@/components/ProductSearch";
import { useAuth } from "@/components/AuthProvider";

interface FieldDef {
  key: string;
  label: string;
  field_type: string;
  options: string[] | null;
  required: boolean;
}

const WARRANTY = [
  { key: "in_warranty", label: "In warranty", callType: "WAR" },
  { key: "out_of_warranty", label: "Out of warranty", callType: "OW" },
  { key: "amc", label: "AMC", callType: "CP_AMC" },
  { key: "unknown", label: "Not sure", callType: "OW" },
];

const ACCESSORIES = [
  "Power cord", "USB cable", "Adapter", "Ink bottle(s)", "Cartridge", "Cable",
  "Memory card", "Battery", "Remote", "Bag / Box",
];

const digits = (s: string) => s.replace(/\D/g, "");
// crypto.randomUUID only exists on https or localhost; this fallback also works on http://192.168.x.x
const uuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1 block text-xs font-medium text-slate-600">
      {children}
      {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
    </span>
  );
}

export default function InwardPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    supabase.from("profiles").select("id,full_name,role,eng_code").eq("active", true).order("full_name")
      .then(({ data }) => setStaff(data ?? []));
  }, []);
  const [category, setCategory] = useState<Category | null>(null);
  const [defs, setDefs] = useState<FieldDef[]>([]);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [waSame, setWaSame] = useState(true);
  const [waPhone, setWaPhone] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [custNote, setCustNote] = useState("");

  const [serial, setSerial] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [purchase, setPurchase] = useState("");
  const [warranty, setWarranty] = useState("unknown");
  const [serialNote, setSerialNote] = useState("");
  const [pickedCust, setPickedCust] = useState<string | null>(null);
  const [pickedDev, setPickedDev] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ id: number; name: string; needs_pickup_test: boolean }[]>([]);
  const [issueId, setIssueId] = useState("");
  const [privNote, setPrivNote] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});

  const [problem, setProblem] = useState("");
  const [visit, setVisit] = useState(false);
  const [locs, setLocs] = useState<VisitLocation[]>([]);
  const [locId, setLocId] = useState("");
  const [visitAddr, setVisitAddr] = useState("");
  const [pagesIn, setPagesIn] = useState("");
  const [acc, setAcc] = useState<string[]>([]);
  const [accOther, setAccOther] = useState("");
  const [manualNo, setManualNo] = useState("");
  const { profile } = useAuth();
  const [staff, setStaff] = useState<{ id: string; full_name: string; role: string; eng_code: string | null }[]>([]);
  const [recvBy, setRecvBy] = useState("");

  const [sign, setSign] = useState<Blob | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [skipSign, setSkipSign] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: string; job_no: string } | null>(null);

  useEffect(() => {
    supabase.from("product_categories").select("*").order("sort_order").then(({ data }) => setCategories((data ?? []) as Category[]));
    supabase.from("issue_categories").select("id,name,needs_pickup_test").eq("active", true).order("sort_order")
      .then(({ data }) => setIssues(data ?? []));
    supabase.from("visit_locations").select("*").eq("active", true).order("name").then(({ data }) => setLocs((data ?? []) as VisitLocation[]));
  }, []);

  useEffect(() => {
    if (!category) return;
    supabase.from("category_fields").select("*").eq("category_id", category.id).order("sort_order")
      .then(({ data }) => setDefs((data ?? []) as FieldDef[]));
  }, [category]);

  async function lookupCustomer() {
    const p = digits(phone);
    if (p.length < 10 || name) return;
    const { data } = await supabase.from("customers").select("*").eq("phone", p).limit(1);
    const c = data?.[0];
    if (!c) return;
    setName(c.name ?? ""); setCompany(c.company ?? ""); setContact(c.contact_person ?? "");
    setAddress(c.address ?? ""); setCity(c.city ?? ""); setPincode(c.pincode ?? "");
    if (c.whatsapp_phone && c.whatsapp_phone !== c.phone) { setWaSame(false); setWaPhone(c.whatsapp_phone); }
    setCustNote("Existing customer found, details filled in.");
  }

  function pickHit(h: ProductHit) {
    const cat = categories.find((c) => c.id === h.category_id);
    if (cat) setCategory(cat);
    setPickedDev(h.device_id);
    setPickedCust(h.customer_id);
    if (h.customer_id) {
      setPhone(h.phone ?? ""); setName(h.customer_name ?? ""); setCompany(h.company ?? "");
      setAddress(h.address ?? ""); setCity(h.city ?? ""); setPincode(h.pincode ?? "");
      if (h.whatsapp_phone && h.whatsapp_phone !== h.phone) { setWaSame(false); setWaPhone(h.whatsapp_phone); } else { setWaSame(true); setWaPhone(""); }
      setCustNote("Existing customer found, details filled in.");
    }
    setSerial(h.serial_no ?? ""); setBrand(h.brand ?? ""); setModel(h.model_no ?? "");
    setSerialNote(`This product has come before: ${h.jobs_count} earlier call(s)${h.last_rma ? `, last RMA ${h.last_rma}` : ""}.`);
  }

  async function lookupSerial() {
    const sn = serial.trim();
    if (sn.length < 3 || pickedDev) return;
    const { data } = await supabase.rpc("find_products", { p_q: sn, p_limit: 5 });
    const exact = ((data ?? []) as ProductHit[]).filter((h) => (h.serial_no ?? "").trim().toUpperCase() === sn.toUpperCase());
    if (exact.length > 0) pickHit(exact[0]);
    else setSerialNote("");
  }

  function toggleAcc(a: string) {
    setAcc((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  }
  function addOther() {
    const v = accOther.trim();
    if (v && !acc.includes(v)) setAcc([...acc, v]);
    setAccOther("");
  }

  function reset() {
    setCategory(null); setPhone(""); setName(""); setWaSame(true); setWaPhone(""); setCompany(""); setContact("");
    setAddress(""); setCity(""); setPincode(""); setCustNote(""); setSerial(""); setBrand(""); setModel("");
    setPurchase(""); setWarranty("unknown"); setSerialNote(""); setPickedCust(null); setPickedDev(null); setIssueId(""); setPrivNote(""); setExtra({}); setProblem(""); setAcc([]); setVisit(false); setLocId(""); setVisitAddr(""); setPagesIn("");
    setManualNo(""); setSign(null); setSignUrl(null); setSkipSign(false); setError(""); setDone(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setError("");
    const p = digits(phone);
    const wa = waSame ? null : digits(waPhone);
    if (!name.trim()) return setError("Enter the customer name");
    if (p.length < 10) return setError("Enter a valid 10-digit phone number");
    if (wa !== null && wa.length < 10) return setError("WhatsApp number must be 10 digits");
    if (!problem.trim()) return setError("Enter the reported problem");
    if (category.needs_pickup_test && !issueId) return setError("Choose the issue category");
    for (const f of defs) if (f.required && !extra[f.key]?.trim()) return setError(`${f.label} is required`);
    if (!sign && !skipSign) return setError("Capture the customer signature, or tick 'Customer will sign on paper'");
    if (pagesIn.trim() !== "" && !/^\d+$/.test(pagesIn.trim())) return setError("Page count must be a whole number");
    if (visit && !locId && !visitAddr.trim()) return setError("For a site visit, choose the visit location or enter the visit address");
    const mn = manualNo.trim();
    if (mn && !/^\d{4}-\d{2}\/\d{3,}$/.test(mn)) return setError("Job number format must be like 2026-27/001");

    setBusy(true);
    try {
      const jobId = uuid();

      let signPath: string | null = null;
      if (sign) {
        signPath = `${jobId}/inward.png`;
        const up = await supabase.storage.from("job-files").upload(signPath, sign, { contentType: "image/png" });
        if (up.error) throw up.error;
      }

      let customerId: string | null = pickedCust;
      if (customerId && (profile?.role === "crm" || profile?.role === "admin")) {
        await supabase.from("customers").update({
          name: name.trim(), company: company.trim() || null, contact_person: contact.trim() || null, phone: p,
          whatsapp_phone: wa, address: address.trim() || null, city: city.trim() || null, pincode: pincode.trim() || null,
        }).eq("id", customerId);
      }
      const found = customerId ? { data: null } : await supabase.from("customers").select("id").eq("phone", p).ilike("name", name.trim());
      if (found.data && found.data.length > 0) customerId = found.data[0].id;
      if (!customerId) {
        const ins = await supabase.from("customers").insert({
          name: name.trim(), company: company.trim() || null, contact_person: contact.trim() || null,
          phone: p, whatsapp_phone: wa, address: address.trim() || null, city: city.trim() || null, pincode: pincode.trim() || null,
        }).select("id").single();
        if (ins.error) throw ins.error;
        customerId = ins.data.id;
      }

      let deviceId: string | null = pickedDev;
      const sn = serial.trim();
      if (!deviceId && sn) {
        const f = await supabase.from("devices").select("id").eq("category_id", category.id).ilike("serial_no", sn).limit(1);
        if (f.data && f.data.length > 0) deviceId = f.data[0].id;
      }
      if (!deviceId) {
        const ins = await supabase.from("devices").insert({
          category_id: category.id, brand: brand.trim() || null, model_no: model.trim() || null, serial_no: sn || null,
          purchase_date: /^\d{4}-\d{2}-\d{2}$/.test(purchase) ? purchase : null,
        }).select("id").single();
        if (ins.error) throw ins.error;
        deviceId = ins.data.id;
      }

      const w = WARRANTY.find((x) => x.key === warranty)!;
      const row: Record<string, unknown> = {
        id: jobId, customer_id: customerId, device_id: deviceId, category_id: category.id,
        call_type: w.callType, service_type: visit ? "onsite" : "carry_in", call_reason: "BD", warranty_status: warranty,
        received_by: recvBy || profile?.id, reported_problem: problem.trim(), issue_category_id: issueId ? Number(issueId) : null, internal_note: privNote.trim() || null, accessories: acc, extra_fields: extra, inward_sign_path: signPath,
      };
      if (visit) {
        row.visit_location_id = locId || null;
        row.visit_address = visitAddr.trim() || locs.find((l) => l.id === locId)?.address || null;
      }
      if (pagesIn.trim() !== "") row.pages_in = Number(pagesIn.trim());
      if (mn) row.job_no = mn;
      const job = await supabase.from("job_cards").insert(row).select("job_no").single();
      if (job.error) {
        if (/duplicate key|job_cards_job_no_key/i.test(job.error.message)) throw new Error("This job number is already in use");
        throw job.error;
      }
      setDone({ id: jobId, job_no: job.data.job_no });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="panel p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">Inward saved</h1>
          <p className="mt-1 text-sm text-slate-600">Job number</p>
          <div className="mono mt-1 text-3xl font-medium tracking-tight text-ink">{done.job_no}</div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={async () => {
                const prod = [brand.trim(), model.trim()].filter(Boolean).join(" ") || category?.name || "product";
                window.open(waLink((waSame ? phone : waPhone) || phone, msgReceived(name.trim(), prod, done.job_no)), "_blank", "noopener");
                const { data: u } = await supabase.auth.getUser();
                await supabase.from("job_messages").insert({ job_id: done.id, kind: "taken", sent_by: u.user?.id });
              }}
              className="btn btn-go"
            >
              Send details on WhatsApp
            </button>
            <Link href={`/jobs/${done.id}/print`} target="_blank" className="btn btn-primary">Print job slip</Link>
            <Link href={`/jobs/${done.id}`} className="btn btn-ghost">Open job</Link>
            <button onClick={reset} className="btn btn-ghost">New inward</button>
          </div>
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">New inward</h1>
        <p className="mt-0.5 text-sm text-slate-500">What did the customer bring? The form changes for each product type.</p>
        <div className="mt-5"><ProductSearch onPick={pickHit} /></div>
        <p className="mt-5 text-sm text-slate-500">Or start a new one by choosing the product type:</p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(c)} className="panel px-4 py-8 text-center text-base font-medium text-ink transition-colors hover:border-ink">
              {c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">New inward: {category.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">Job number is created automatically when you save.</p>
        </div>
        <button type="button" onClick={() => setCategory(null)} className="btn btn-ghost btn-sm">Change product type</button>
      </div>

      <ProductSearch onPick={pickHit} />

      <section className="panel p-5">
        <h2 className="mb-4 font-semibold text-ink">Customer</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label><Label>Phone number *</Label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={lookupCustomer} inputMode="tel" maxLength={15} className="field mono w-full" autoFocus />
            {custNote && <span className="mt-1 block text-xs text-emerald-700">{custNote}</span>}
          </label>
          <label><Label>Customer name *</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field w-full" />
          </label>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={waSame} onChange={(e) => setWaSame(e.target.checked)} /> WhatsApp number is the same as phone
            </label>
            {!waSame && (
              <label className="mt-3 block max-w-xs"><Label>WhatsApp number</Label>
                <input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} inputMode="tel" maxLength={15} className="field mono w-full" />
              </label>
            )}
          </div>
          <label><Label hint="optional">Company</Label><input value={company} onChange={(e) => setCompany(e.target.value)} className="field w-full" /></label>
          <label><Label hint="optional">Contact person</Label><input value={contact} onChange={(e) => setContact(e.target.value)} className="field w-full" /></label>
          <label className="md:col-span-2"><Label>Address</Label><input value={address} onChange={(e) => setAddress(e.target.value)} className="field w-full" /></label>
          <label><Label>City</Label><input value={city} onChange={(e) => setCity(e.target.value)} className="field w-full" /></label>
          <label><Label>Pincode</Label><input value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" maxLength={6} className="field mono w-full" /></label>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 font-semibold text-ink">Product</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label><Label>Serial number</Label>
            <input value={serial} onChange={(e) => { setSerial(e.target.value); setPickedDev(null); }} onBlur={lookupSerial} className="field mono w-full" />
            {serialNote && <span className="mt-1 block text-xs font-medium text-amber-700">{serialNote}</span>}
          </label>
          <label><Label>Purchase date</Label><input type="date" value={purchase} onChange={(e) => setPurchase(e.target.value)} className="field w-full" /></label>
          <label><Label>Brand</Label><input value={brand} onChange={(e) => setBrand(e.target.value)} className="field w-full" /></label>
          <label><Label>Model number</Label><input value={model} onChange={(e) => setModel(e.target.value)} className="field w-full" /></label>
          <div className="md:col-span-2">
            <Label>Warranty status</Label>
            <div className="flex flex-wrap gap-2">
              {WARRANTY.map((w) => <Chip key={w.key} on={warranty === w.key} onClick={() => setWarranty(w.key)}>{w.label}</Chip>)}
            </div>
          </div>
          {defs.map((f) =>
            f.field_type === "select" && f.options ? (
              <div key={f.key} className="md:col-span-2">
                <Label>{f.label}{f.required ? " *" : ""}</Label>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => <Chip key={o} on={extra[f.key] === o} onClick={() => setExtra({ ...extra, [f.key]: o })}>{o}</Chip>)}
                </div>
              </div>
            ) : (
              <label key={f.key}><Label>{f.label}{f.required ? " *" : ""}</Label>
                <input value={extra[f.key] ?? ""} onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })} type={f.field_type === "number" ? "number" : "text"} className="field w-full" />
              </label>
            )
          )}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 font-semibold text-ink">How was the call received?</h2>
        <div className="flex flex-wrap gap-2">
          <Chip on={!visit} onClick={() => setVisit(false)}>Carry-in (customer brought it)</Chip>
          <Chip on={visit} onClick={() => setVisit(true)}>Site visit (engineer went to the customer)</Chip>
        </div>
        {visit && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block"><Label>Visit location (km is set by CRM / Admin)</Label>
              <select value={locId} onChange={(e) => setLocId(e.target.value)} className="field w-full">
                <option value="">Select location</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name} - {Number(l.km).toFixed(1)} km</option>)}
              </select>
            </label>
            <label className="block"><Label>Visit address</Label>
              <input value={visitAddr} onChange={(e) => setVisitAddr(e.target.value)} className="field w-full" placeholder="Customer site address" />
            </label>
          </div>
        )}
        <label className="mt-4 block max-w-xs"><Label>Page count at inward (optional)</Label>
          <input value={pagesIn} onChange={(e) => setPagesIn(e.target.value)} inputMode="numeric" className="field mono w-full" placeholder="Printer counter reading" />
        </label>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 font-semibold text-ink">Problem and accessories</h2>
        <label className="block"><Label>Reported problem *</Label>
          <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} className="field w-full" />
        </label>
        <label className="mt-4 block max-w-sm"><Label hint={category.needs_pickup_test ? undefined : "optional"}>Issue category{category.needs_pickup_test ? " *" : ""}</Label>
          <select value={issueId} onChange={(e) => setIssueId(e.target.value)} className="field w-full">
            <option value="">Select...</option>
            {issues.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {issues.find((i) => String(i.id) === issueId)?.needs_pickup_test && (
            <span className="mt-1 block text-xs text-amber-700">The paper pickup test (50-60 pages) will be compulsory before this job can be marked Ready.</span>
          )}
        </label>
        <label className="mt-4 block"><Label hint="staff only, never printed">Private note</Label>
          <textarea value={privNote} onChange={(e) => setPrivNote(e.target.value)} rows={2} className="field w-full" />
        </label>
        <div className="mt-4">
          <Label>Accessories received with the product</Label>
          <div className="flex flex-wrap gap-2">
            {[...ACCESSORIES, ...acc.filter((a) => !ACCESSORIES.includes(a))].map((a) => (
              <Chip key={a} on={acc.includes(a)} onClick={() => toggleAcc(a)}>{a}</Chip>
            ))}
          </div>
          <div className="mt-3 flex max-w-sm gap-2">
            <input value={accOther} onChange={(e) => setAccOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }} placeholder="Other item" aria-label="Other accessory" className="field flex-1" />
            <button type="button" onClick={addOther} className="btn btn-ghost">Add</button>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 font-semibold text-ink">Signature and job number</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Label>Customer signature</Label>
            {signUrl && <img src={signUrl} alt="Customer signature" className="mb-2 h-20 rounded border border-line bg-white" />}
            {signing ? (
              <SignaturePad
                onCancel={() => setSigning(false)}
                onSave={(b) => { setSign(b); setSignUrl(URL.createObjectURL(b)); setSigning(false); setSkipSign(false); }}
              />
            ) : (
              <button type="button" onClick={() => setSigning(true)} className="btn btn-ghost">{sign ? "Sign again" : "Take signature"}</button>
            )}
            {!sign && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipSign} onChange={(e) => setSkipSign(e.target.checked)} /> Customer will sign on paper
              </label>
            )}
          </div>
          <label className="block"><Label hint="who is taking this product in">Received by</Label>
            <select value={recvBy || profile?.id || ""} onChange={(e) => setRecvBy(e.target.value)} className="field w-full">
              {staff.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.full_name}{x.eng_code ? ` (${x.eng_code})` : ""} - {x.role === "admin" ? "Admin" : x.role === "crm" ? "CRM" : "Engineer"}
                </option>
              ))}
            </select>
          </label>
          <label className="block"><Label hint="leave empty for automatic">Job number</Label>
            <input value={manualNo} onChange={(e) => setManualNo(e.target.value)} placeholder="2026-27/001" className="field mono w-full" />
            <span className="mt-1 block text-xs text-slate-500">Only fill this if you must use a specific number. Format: 2026-27/001</span>
          </label>
        </div>
      </section>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn btn-go px-6 py-2.5">{busy ? "Saving" : "Save inward"}</button>
        <button type="button" onClick={reset} className="btn btn-ghost">Start over</button>
      </div>
    </form>
  );
}
