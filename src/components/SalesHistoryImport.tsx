import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { readFileSmart } from "@/lib/csv";
import { parseHistoricalSales } from "@/lib/sales-import";
import { importHistoricalSales } from "@/lib/sales-verification.functions";

export function SalesHistoryImport({ onImported }: { onImported: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ text: string; name: string; summary: ReturnType<typeof parseHistoricalSales> } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const save = useServerFn(importHistoricalSales);
  return <>
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload />Importar conferências</Button>
    <input ref={input} type="file" accept=".csv,text/csv" aria-label="CSV de conferências antigas" className="hidden" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      setError(""); setNotice("");
      try { if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo acima de 10 MB."); const text = await readFileSmart(file); setPending({ text, name: file.name, summary: parseHistoricalSales(text) }); }
      catch (err) { setError(err instanceof Error ? err.message : "Não foi possível ler o CSV."); }
    }} />
    {error && !pending && <span role="alert" className="basis-full rounded bg-card p-2 text-destructive">{error}</span>}
    {notice && <span role="status" className="basis-full rounded bg-card p-2 text-success">{notice}</span>}
    <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open && !busy) setPending(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Importar conferências antigas</DialogTitle><DialogDescription className="break-all">{pending?.name}</DialogDescription></DialogHeader>
      <div className="grid grid-cols-3 gap-3">{[["Conferências", pending?.summary.records.length], ["Balcão", pending?.summary.counter], ["Expedição", pending?.summary.expedition]].map(([label, value]) => <div key={label} className="border-b-2 border-primary py-3"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value?.toLocaleString("pt-BR")}</p></div>)}</div>
      <p className="text-sm">Datas e valores originais serão preservados. Registros já importados serão ignorados; os atuais não serão substituídos.</p>
      <p className="text-sm">A área é identificada pelo nome do conferente ou pelo mesmo código com área explícita no arquivo.</p>
      {!!pending?.summary.unknownSellers && <p className="text-sm text-muted-foreground">{pending.summary.unknownSellers.toLocaleString("pt-BR")} registros sem vendedor identificado permanecerão como NÃO INFORMADO. Tempos de conferência ausentes não entram na média.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>Cancelar</Button><Button disabled={busy} onClick={async () => {
        if (!pending) return; setBusy(true); setError("");
        try { const result = await save({ data: { text: pending.text } }); await onImported(); setPending(null); setNotice(`${result.imported.toLocaleString("pt-BR")} conferências importadas · ${result.skipped.toLocaleString("pt-BR")} já existentes ou repetidas.`); }
        catch (err) { setError(err instanceof Error ? err.message : "Não foi possível importar."); } finally { setBusy(false); }
      }}><Upload />{busy ? "Importando…" : "Confirmar importação"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}