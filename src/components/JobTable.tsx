import Link from "next/link";
import { ageText, ageTone, daysSince, fmtDate, fmtDateTime, personLabel } from "@/lib/format";
import { STATUS_LABEL, type JobFull, type Status } from "@/lib/types";

const PILL: Record<Status, { box: string; dot: string }> = {
  inward: { box: "bg-amber-50 text-amber-900 border-amber-200", dot: "bg-amber-500" },
  in_repair: { box: "bg-blue-50 text-blue-900 border-blue-200", dot: "bg-blue-600" },
  pending_spares: { box: "bg-orange-50 text-orange-900 border-orange-200", dot: "bg-orange-500" },
  pending_tech: { box: "bg-violet-50 text-violet-900 border-violet-200", dot: "bg-violet-500" },
  pending_approval: { box: "bg-yellow-50 text-yellow-900 border-yellow-300", dot: "bg-yellow-500" },
  ready: { box: "bg-emerald-50 text-emerald-900 border-emerald-200", dot: "bg-emerald-600" },
  outward: { box: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
};

export function StatusBadge({ status }: { status: Status }) {
  const p = PILL[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${p.box}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function AgeChip({ job }: { job: JobFull }) {
  if (job.status === "outward") return <span className="text-xs text-slate-500">{fmtDate(job.outward_at)}</span>;
  const d = daysSince(job.received_at);
  return (
    <span className={`mono rounded px-1.5 py-0.5 text-xs font-medium ${ageTone(d)}`} title="Days at the centre">
      {ageText(d)}
    </span>
  );
}

const TRACK: { key: "inward" | "in_repair" | "ready" | "outward"; label: string }[] = [
  { key: "inward", label: "Inward" },
  { key: "in_repair", label: "Under repair" },
  { key: "ready", label: "Ready" },
  { key: "outward", label: "Outward" },
];

/** The four real stages a job moves through, with the time each was reached. */
export function StatusTrack({ job }: { job: JobFull }) {
  const idx =
    job.status === "inward" ? 0 : job.status === "ready" ? 2 : job.status === "outward" ? 3 : 1;
  const when = [job.received_at, job.accepted_at, job.ready_at, job.outward_at];
  const note =
    job.status === "pending_spares"
      ? "Waiting for spares"
      : job.status === "pending_tech"
      ? "Waiting for tech support"
      : job.status === "pending_approval"
      ? "Waiting for customer approval"
      : job.repair_declined && job.status === "ready"
      ? "Quotation declined - no repair"
      : "";
  return (
    <ol className="panel grid grid-cols-4 overflow-hidden">
      {TRACK.map((s, i) => {
        const done = i < idx || (i === idx && job.status === "outward");
        const current = i === idx && !done;
        return (
          <li key={s.key} className={`relative px-4 py-3 ${i > 0 ? "border-l border-line" : ""}`}>
            <span
              className={`absolute inset-x-0 top-0 h-1 ${
                done ? "bg-ink" : current ? "bg-bench" : "bg-transparent"
              }`}
            />
            <div className={`text-sm font-medium ${i > idx ? "text-slate-400" : "text-ink"}`}>{s.label}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {i <= idx && when[i] ? fmtDateTime(when[i]) : "-"}
            </div>
            {current && note && <div className="mt-1 text-xs font-medium text-orange-700">{note}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export default function JobTable({ jobs, fields = [] }: { jobs: JobFull[]; fields?: { key: string; label: string }[] }) {
  if (jobs.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <div className="font-medium text-ink">No jobs match this search</div>
        <p className="mt-1 text-sm text-slate-500">
          Try a serial number, customer name, phone number or job number.
        </p>
      </div>
    );
  }
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th">Job no</th>
            <th className="th">Customer</th>
            <th className="th">Product</th>
            {fields.map((f) => (
              <th key={f.key} className="th">{f.label}</th>
            ))}
            <th className="th">Status</th>
            <th className="th">Age</th>
            <th className="th">Received by / Repair by</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-line last:border-0 hover:bg-slate-50">
              <td className="td">
                <Link href={`/jobs/${j.id}`} className="mono font-medium text-bench hover:underline">
                  {j.job_no}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500">{fmtDate(j.received_at)}</div>
              </td>
              <td className="td">
                <div className="font-medium">{j.customer?.name}</div>
                <div className="mono text-xs text-slate-500">{j.customer?.phone}</div>
              </td>
              <td className="td">
                <div>{[j.device?.brand, j.device?.model_no].filter(Boolean).join(" ") || j.category?.name}</div>
                <div className="mono text-xs text-slate-500">{j.device?.serial_no || "no serial"}</div>
              </td>
              {fields.map((f) => (
                <td key={f.key} className="td text-sm">{j.extra_fields?.[f.key] || <span className="text-slate-400">-</span>}</td>
              ))}
              <td className="td">
                <StatusBadge status={j.status} />
              </td>
              <td className="td">
                <AgeChip job={j} />
              </td>
              <td className="td text-xs">
                <div>{personLabel(j.received)}</div>
                <div className="text-slate-500">{personLabel(j.repair)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
