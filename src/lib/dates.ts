const TZ = "Asia/Kolkata";

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function firstOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}

export interface Preset {
  key: string;
  label: string;
  range: () => { from: string; to: string };
}

export const PRESETS: Preset[] = [
  { key: "today", label: "Today", range: () => ({ from: todayIST(), to: todayIST() }) },
  { key: "yesterday", label: "Yesterday", range: () => ({ from: addDays(todayIST(), -1), to: addDays(todayIST(), -1) }) },
  { key: "7d", label: "Last 7 days", range: () => ({ from: addDays(todayIST(), -6), to: todayIST() }) },
  { key: "month", label: "This month", range: () => ({ from: firstOfMonth(todayIST()), to: todayIST() }) },
  {
    key: "lastmonth",
    label: "Last month",
    range: () => {
      const first = firstOfMonth(todayIST());
      const lastDay = addDays(first, -1);
      return { from: firstOfMonth(lastDay), to: lastDay };
    },
  },
  {
    key: "fy",
    label: "This financial year",
    range: () => {
      const t = todayIST();
      const y = Number(t.slice(0, 4));
      const startYear = Number(t.slice(5, 7)) >= 4 ? y : y - 1;
      return { from: `${startYear}-04-01`, to: t };
    },
  },
];

export function fmtYmd(ymd: string): string {
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/** YYYY-MM-DD of a timestamp, in India. */
export function ymdOf(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts));
}
