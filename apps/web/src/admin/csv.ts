/**
 * Tiny client-side CSV export. Builds an RFC-4180 quoted CSV from a set of
 * columns and rows, then triggers a browser download. No dependency, no server
 * round-trip — the data is already in the page.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string;
}

function escapeCell(raw: string): string {
  // Quote when the cell contains a comma, quote or newline; double embedded quotes.
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: readonly T[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}

/** Download `content` as a file named `filename` (adds a BOM so Excel reads UTF-8). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** yyyy-mm-dd stamp for filenames. */
export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
