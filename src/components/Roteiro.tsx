import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, MapPin, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { ItemsTable } from "./ItemsTable";
import { ItemDetailModal } from "./ItemDetailModal";
import { StatusBadge, EnderecoCell } from "./badges";
import { gerarRelatorioPDF } from "@/lib/pdf";
import { sortByAddress } from "@/lib/analysis";
import { downloadCSV, fmtInt, shortLinha } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnalyzedItem } from "@/lib/types";

// Agrupa itens por subdivisão de endereço (Bloco + Rua), ex: BR01, BR02, AR05.
function grupoEndereco(i: AnalyzedItem): { chave: string; label: string; ordem: number } {
  if (i.parsed.valido) {
    const ruaStr = String(i.parsed.rua).padStart(2, "0");
    const chave = `${i.parsed.bloco}R${ruaStr}`;
    return {
      chave,
      label: `${chave} · ${i.parsed.blocoNome} · Rua ${ruaStr}`,
      ordem: (i.parsed.bloco === "A" ? 0 : 1) * 1000 + i.parsed.rua,
    };
  }
  return { chave: "SEM", label: "Sem endereço definido", ordem: 9_999_999 };
}

export function Roteiro() {
  const { items, zonaSegura, resolvidos, meta, conferencia } = useStore();
  const [selected, setSelected] = useState<AnalyzedItem | null>(null);
  // Inclui itens do roteiro E itens já conferidos (para não precisar conferir de novo).
  const roteiro = sortByAddress(
    items.filter((i) => i.noRoteiro || !!conferencia[i.codigo]),
  );
  const tratadosHoje = meta
    ? resolvidos.filter((r) => r.data === meta.dataImportacao)
    : [];

  // Subdivisões por endereço
  const grupos = (() => {
    const map = new Map<string, { label: string; ordem: number; itens: AnalyzedItem[] }>();
    for (const i of roteiro) {
      const g = grupoEndereco(i);
      const cur = map.get(g.chave);
      if (cur) cur.itens.push(i);
      else map.set(g.chave, { label: g.label, ordem: g.ordem, itens: [i] });
    }
    return Array.from(map.entries())
      .map(([chave, v]) => ({ chave, ...v }))
      .sort((a, b) => a.ordem - b.ordem);
  })();

  const exportRoteiroCSV = () => {
    const header = ["Ordem","Endereço","Bloco","Rua","Linha","Grupo","Código","Descrição","Estoque","Mov","Status","Status Conferência"];
    const rows = roteiro.map((i: AnalyzedItem, idx) => {
      const c = conferencia[i.codigo];
      return [
        idx + 1, i.endereco || i.enderecoMotivo, i.parsed.blocoNome,
        i.parsed.valido ? String(i.parsed.rua).padStart(2, "0") : "",
        i.linha ?? "", i.grupo ?? "",
        i.codigo, i.descricao, i.qtdEstoque, i.qtdMovimentada, i.status,
        c?.status ?? "Pendente",
      ];
    });
    downloadCSV("roteiro-apuracao.csv", [header, ...rows]);
  };



  const gerarPDF = () => {
    gerarRelatorioPDF(
      items,
      zonaSegura,
      tratadosHoje.map((r) => ({ ...r, descricao: r.descricao })),
    );
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-semibold">Roteiro de Apuração Física por Endereço</h2>
          <p className="text-sm text-muted-foreground">
            {fmtInt(roteiro.length)} itens em {grupos.length} subdivisões de endereço (Bloco A → Bloco B).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportRoteiroCSV}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button onClick={gerarPDF}>
            <FileText className="mr-1 h-4 w-4" /> Gerar Relatório PDF
          </Button>
        </div>
      </Card>

      {grupos.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum item no roteiro de apuração.
        </Card>
      )}

      {grupos.map((g) => (
        <Card key={g.chave} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-semibold">{g.chave === "SEM" ? g.label : g.chave}</span>
              <span className="text-xs text-muted-foreground">{g.label}</span>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
            </span>
          </div>
          <div className="mobile-table-wrap overflow-x-auto">
            <table className="mobile-table w-full text-base text-center">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  {["Endereço","Código","Linha","Descrição","Estq","Mov","Status"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-center font-semibold text-sm">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.itens.map((i) => {
                  const c = conferencia[i.codigo];
                  const conferido = !!c;
                  const negativo = i.qtdEstoque < 0;
                  return (
                  <tr
                    key={i.codigo}
                    onClick={() => setSelected(i)}
                    className={cn(
                      "cursor-pointer border-t border-border hover:bg-accent/50",
                      i.reincidente && "bg-critical/10 hover:bg-critical/20",
                      conferido && negativo && "bg-critical/10 hover:bg-critical/20",
                      conferido && !negativo && "bg-success/5 hover:bg-success/10",
                    )}
                  >
                    <td data-label="Endereço" className="px-3 py-2"><EnderecoCell item={i} /></td>
                    <td data-label="Código" className="px-3 py-2 font-mono">{i.codigo}</td>
                    <td data-label="Linha" className="px-3 py-2 text-sm font-medium text-primary">{shortLinha(i.linha) || "—"}</td>
                    <td data-label="Descrição" className="px-3 py-2 max-w-[300px] truncate text-left">{i.descricao}</td>
                    <td data-label="Estoque" className={cn("px-3 py-2 tabular-nums", negativo && "font-bold text-critical")}>{fmtInt(i.qtdEstoque)}</td>
                    <td data-label="Movimentação" className="px-3 py-2 tabular-nums">{fmtInt(i.qtdMovimentada)}</td>
                    <td data-label="Status" className="px-3 py-2">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge status={i.status} />
                        {conferido && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                            <CheckCircle2 className="h-3 w-3" /> Já conferido
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </Card>
      ))}

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
          Ver lista completa com filtros
        </summary>
        <div className="p-4 pt-0">
          <ItemsTable items={roteiro} csvName="roteiro" />
        </div>
      </details>

      {tratadosHoje.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-info">
            Itens já tratados no dia ({tratadosHoje.length})
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Item já conferido/corrigido em importação anterior do mesmo dia — não exige nova conferência.
          </p>
          <div className="mobile-table-wrap overflow-x-auto rounded-lg border border-border">
            <table className="mobile-table w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>{["Código","Descrição","Endereço","Tipo de erro","Horário","Status","Observação"].map((h) => <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {tratadosHoje.map((r) => (
                  <tr key={r.chave} className="border-t border-border bg-info/5">
                    <td data-label="Código" className="px-2 py-1.5 font-mono">{r.codigo}</td>
                    <td data-label="Descrição" className="px-2 py-1.5 max-w-[220px] truncate">{r.descricao}</td>
                    <td data-label="Endereço" className="px-2 py-1.5 font-mono">{r.endereco || "—"}</td>
                    <td data-label="Tipo de erro" className="px-2 py-1.5">{r.tipoErro}</td>
                    <td data-label="Horário" className="px-2 py-1.5">{r.horarioTratamento}</td>
                    <td data-label="Status" className="px-2 py-1.5">{r.status}</td>
                    <td data-label="Observação" className="px-2 py-1.5 max-w-[160px] truncate">{r.observacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ItemDetailModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
