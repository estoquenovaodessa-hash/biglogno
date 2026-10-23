import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, MapPin, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtInt, fmtDateTimeBR, fmtDateBR } from "@/lib/format";
import { parseAddress } from "@/lib/address";

export function UploadPanel() {
  const { importMovimento, importEnderecos, clearCurrent, enderecoBase, meta, movimentos } =
    useStore();
  const movRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const baseStats = (() => {
    const regs = Object.values(enderecoBase.registros);
    let comEnd = 0;
    let invalido = 0;
    for (const r of regs) {
      const e = (r.endereco ?? "").trim();
      if (!e) continue;
      if (parseAddress(e).valido) comEnd++;
      else invalido++;
    }
    return {
      total: regs.length,
      comEnd,
      semEnd: regs.length - comEnd - invalido,
      invalido,
    };
  })();

  const handle = async (file: File | undefined, fn: (f: File) => Promise<void>) => {
    if (!file) return;
    setBusy(true);
    try {
      await fn(file);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="min-w-0 border-t-4 border-primary bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Relatório de Movimentação</h2>
        </div>
        <input
          ref={movRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0], importMovimento)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => movRef.current?.click()} disabled={busy}>
            <Upload className="mr-2 h-4 w-4" /> Importar relatório
          </Button>
          {meta && (
            <Button variant="outline" onClick={clearCurrent}>
              <Trash2 className="mr-2 h-4 w-4" /> Limpar análise atual
            </Button>
          )}
        </div>
        {meta && (
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <div><strong>{meta.nomeArquivo}</strong></div>
            <div className="text-muted-foreground">
              {fmtInt(movimentos.length)} itens • importado em {fmtDateTimeBR(meta.data)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Data de referência:{" "}
              <strong>{fmtDateBR(meta.dataImportacao)}</strong>{" "}
              {meta.dataReferenciaOrigem === "arquivo"
                ? "(detectada no nome do arquivo)"
                : "(nome sem data — usando data da importação)"}
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 border-t-4 border-brand-gold bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Base de Endereços</h2>
        </div>
        <input
          ref={endRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0], importEnderecos)}
        />
        <Button onClick={() => endRef.current?.click()} disabled={busy} variant="secondary">
          <Upload className="mr-2 h-4 w-4" /> Importar / atualizar base
        </Button>
        {baseStats.total > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
            <div className="border-b border-border pb-3"><p className="text-muted-foreground">Total de itens</p><strong className="text-3xl tabular-nums">{fmtInt(baseStats.total)}</strong></div>
            <div className="border-b border-border pb-3"><p className="text-muted-foreground">Com endereço</p><strong className="text-3xl tabular-nums text-success">{fmtInt(baseStats.comEnd)}</strong></div>
            <div><p className="text-muted-foreground">Sem endereço</p><strong className="text-3xl tabular-nums">{fmtInt(baseStats.semEnd)}</strong></div>
            <div><p className="text-muted-foreground">Inválidos</p><strong className="text-3xl tabular-nums text-critical">{fmtInt(baseStats.invalido)}</strong></div>
          </div>
        )}
      </section>
    </div>
  );
}
