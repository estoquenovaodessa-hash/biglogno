import type { ReactNode } from "react";
import { ClipboardCheck } from "lucide-react";
import { percentageTone } from "@/lib/sales-verification";

export function Percent({ value }: { value: number | null }) {
  const tones = { destructive: "text-destructive bg-destructive/10", warning: "text-warning bg-secondary/20", success: "text-success bg-success/10" };
  return <span className={`inline-block rounded px-2 py-1 text-lg font-bold tabular-nums ${value === null ? "text-muted-foreground" : tones[percentageTone(value)]}`}>{value === null ? "—" : `${value.toFixed(1)}%`}</span>;
}

export function SalesDataTable({ title, headers, rows, errorTone = false }: { title?: string; headers: string[]; rows: ReactNode[][]; errorTone?: boolean }) {
  return <section className="min-w-0">{title && <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><ClipboardCheck className="h-5 w-5 text-primary" />{title}</h2>}<div className="mobile-table-wrap overflow-x-auto rounded-md border border-border"><table className="mobile-table w-full text-base"><thead className="bg-accent text-accent-foreground"><tr>{headers.map(h => <th key={h} className="px-3 py-3 text-left text-sm font-bold uppercase">{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i} className={`border-t border-border ${errorTone ? "bg-destructive/5" : "bg-card"}`}>{row.map((cell, j) => <td key={j} data-label={headers[j]} className="break-words px-3 py-3 font-medium">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-8 text-center text-muted-foreground">Nenhum registro neste período.</td></tr>}</tbody></table></div></section>;
}