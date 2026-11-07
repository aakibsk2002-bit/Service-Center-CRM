import { downloadCsv, type Cell } from "./csv";

export type Row = Record<string, string>;

/** Header names are matched loosely: "Part Number", "part_number" and "PART-NUMBER" are the same column. */
const norm = (h: unknown) =>
  String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      out.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out;
}

function toObjects(matrix: string[][]): Row[] {
  const nonEmpty = matrix.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (nonEmpty.length < 2) return [];
  const head = nonEmpty[0].map(norm);
  return nonEmpty.slice(1).map((r) => {
    const o: Row = {};
    head.forEach((h, i) => {
      if (h) o[h] = String(r[i] ?? "").trim();
    });
    return o;
  });
}

/** Read a .csv or .xlsx file chosen by the user into rows keyed by column name. */
export async function readTable(file: File): Promise<Row[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const m: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = row.getCell(c).value as unknown;
        if (v === null || v === undefined) vals.push("");
        else if (v instanceof Date) vals.push(v.toISOString());
        else if (typeof v === "object") {
          const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
          vals.push(o.richText ? o.richText.map((t) => t.text).join("") : String(o.text ?? o.result ?? ""));
        } else vals.push(String(v));
      }
      m.push(vals);
    });
    return toObjects(m);
  }
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported. Save the sheet as .xlsx or .csv and try again.");
  return toObjects(parseCsv(await file.text()));
}

export async function downloadXlsx(filename: string, header: string[], rows: Cell[][]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(header).font = { bold: true };
  rows.forEach((r) => ws.addRow(r.map((v) => (v === undefined ? null : v))));
  ws.columns.forEach((c, i) => {
    const w = Math.max(String(header[i] ?? "").length, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length));
    c.width = Math.min(Math.max(w + 2, 10), 45);
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadTable(filename: string, header: string[], rows: Cell[][], fmt: "csv" | "xlsx") {
  if (fmt === "xlsx") return downloadXlsx(filename.replace(/\.csv$/i, "") + ".xlsx", header, rows);
  downloadCsv(filename.replace(/\.xlsx$/i, "") + ".csv", header, rows);
}
