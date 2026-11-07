const TZ = "Asia/Kolkata";

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ts));
}

export function fmtDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ts));
}

export function money(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

export function personLabel(p: { full_name: string; eng_code: string | null } | null): string {
  if (!p) return "-";
  return p.eng_code ? `${p.full_name} (${p.eng_code})` : p.full_name;
}

/** Whole days between a timestamp and now. */
export function daysSince(ts: string | null | undefined): number {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}

/** Colour for how long a job has been sitting. */
export function ageTone(days: number): string {
  if (days >= 7) return "bg-red-100 text-red-800";
  if (days >= 3) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function ageText(days: number): string {
  return days === 0 ? "Today" : `${days}d`;
}
