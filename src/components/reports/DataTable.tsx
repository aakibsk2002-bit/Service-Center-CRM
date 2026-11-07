"use client";

import { useMemo, useState } from "react";
import { downloadCsv, type Cell } from "@/lib/csv";
import { money } from "@/lib/format";

export interface Col<T> {
  key: string;
  label: string;
  /** Raw value used for sorting, totals and CSV. */
  value: (r: T) => string | number | null;
  /** What to show on screen (defaults to the value). */
  render?: (r: T) => React.ReactNode;
  kind?: "money" | "number" | "text";
  /** Add this column up in the footer. */
  sum?: boolean;
  align?: "right";
  mono?: boolean;
}

function cmp(a: string | number | null, b: string | number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

export default function DataTable<T>({
  rows,
  cols,
  rowKey,
  defaultSort,
  filename,
  empty = "Nothing found for this period.",
  pageSize = 200,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  filename: string;
  empty?: string;
  pageSize?: number;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [limit, setLimit] = useState(pageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    const out = [...rows].sort((a, b) => cmp(c.value(a), c.value(b)));
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, cols, sort]);

  const shown = sorted.slice(0, limit);
  const hasSum = cols.some((c) => c.sum);

  function toggle(key: string, numeric: boolean) {
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: numeric ? "desc" : "asc" }));
  }

  function exportCsv() {
    downloadCsv(
      filename,
      cols.map((c) => c.label),
      sorted.map((r) => cols.map((c) => c.value(r) as Cell))
    );
  }

  const fmt = (c: Col<T>, v: number) => (c.kind === "money" ? money(v) : String(Math.round(v * 100) / 100));

  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 print:hidden">
        <span className="text-sm text-slate-600">{rows.length} row{rows.length === 1 ? "" : "s"}</span>
        <button onClick={exportCsv} disabled={rows.length === 0} className="btn btn-ghost btn-sm">Download CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {cols.map((c) => {
                const numeric = c.kind === "money" || c.kind === "number";
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} className={`th whitespace-nowrap ${c.align === "right" || numeric ? "text-right" : ""}`} aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button onClick={() => toggle(c.key, numeric)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.label}
                      <span aria-hidden className={on ? "text-ink" : "text-slate-300"}>{on ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} className="border-b border-line last:border-0 hover:bg-slate-50">
                {cols.map((c) => {
                  const numeric = c.kind === "money" || c.kind === "number";
                  const v = c.value(r);
                  return (
                    <td key={c.key} className={`td ${c.align === "right" || numeric ? "text-right" : ""} ${c.mono || numeric ? "mono whitespace-nowrap" : ""}`}>
                      {c.render ? c.render(r) : c.kind === "money" && typeof v === "number" ? money(v) : v ?? <span className="text-slate-400">-</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-slate-500">{empty}</td></tr>
            )}
          </tbody>
          {hasSum && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line bg-slate-50 font-medium">
                {cols.map((c, i) => (
                  <td key={c.key} className={`td ${c.kind === "money" || c.kind === "number" ? "mono text-right" : ""}`}>
                    {c.sum ? fmt(c, rows.reduce((s, r) => s + (Number(c.value(r)) || 0), 0)) : i === 0 ? `Total (${rows.length})` : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {sorted.length > limit && (
        <div className="border-t border-line p-3 text-center print:hidden">
          <button onClick={() => setLimit((l) => l + 500)} className="btn btn-ghost btn-sm">Show more ({sorted.length - limit} left)</button>
        </div>
      )}
    </div>
  );
}
