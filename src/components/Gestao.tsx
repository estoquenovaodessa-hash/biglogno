import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Minus, Package, ArchiveX, ArrowDownCircle, BatteryLow, Repeat, ImageDown } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ImportRecord } from "@/lib/types";
import { fmtInt, fmtDateTimeBR } from "@/lib/format";
import { computarCards, gerarJpegCards, baixarJpegCards } from "@/lib/jpegAnalisar";
import { cn } from "@/lib/utils";

// Arredonda meio para cima: 3,5 vira 4; 3,4 vira 3; 0,4 vira 0.
const f0 = (n: number) => Math.round(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

type Metric = {
  label: string;
  hint: string;
  icon: typeof Package;
  get: (h: ImportRecord) => number;
  lowerIsBetter: boolean | null;
};

const METRICS: Metric[] = [
  { label: "Itens movimentados", hint: "Total de itens em cada importação", icon: Package, get: (h) => h.totalItens, lowerIsBetter: null },
  { label: "Itens zerados", hint: "Sem saldo em estoque", icon: ArchiveX, get: (h) => h.zerados, lowerIsBetter: true },
  { label: "Itens negativos", hint: "Saldo abaixo de zero", icon: ArrowDownCircle, get: (h) => h.negativos, lowerIsBetter: true },
  { label: "Estoque baixo", hint: "Saldo de 1 a 2 unidades", icon: BatteryLow, get: (h) => h.ruptura, lowerIsBetter: true },
];

export function Gestao({ history }: { history: ImportRecord[] }) {
  // history[0] = mais recente
  const ultima = history[0];
  const anteriores = history.slice(1);
  const [gerando, setGerando] = useState(false);

  const cards = useMemo(() => computarCards(history, METRICS), [history]);

  const ranking = useMemo(() => {
    const m = new Map<string, { d: string; n: number }>();
    for (const h of history) {
      const vistos = new Set<string>();
      for (const it of h.movidos ?? []) {
        if (vistos.has(it.c)) continue;
        vistos.add(it.c);
        const cur = m.get(it.c) ?? { d: it.d, n: 0 };
        cur.n += 1;
        m.set(it.c, cur);
      }
    }
    return [...m.entries()]
      .map(([c, v]) => ({ c, ...v }))
      .filter((x) => x.n > 1)
      .sort((a, b) => b.n - a.n || a.c.localeCompare(b.c))
      .slice(0, 10);
  }, [history]);
  const comItens = history.filter((h) => h.movidos).length;
  const maxN = ranking[0]?.n ?? 1;

  const gerarJpeg = async () => {
    try {
      setGerando(true);
      const blob = await gerarJpegCards(
        cards,
        `${history.length} importação(ões) · gerado em ${fmtDateTimeBR(new Date().toISOString())}`,
      );
      const d = new Date();
      const p = (x: number) => String(x).padStart(2, "0");
      baixarJpegCards(blob, `analisar-cards-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jpg`);
      toast.success("JPEG gerado — pronto para enviar ao celular.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o JPEG neste navegador.");
    } finally {
      setGerando(false);
    }
  };

  if (history.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma importação registrada.</p>;

  return (
    <div className="space-y-5">
      {/* Cabeçalho explicativo + botão JPEG */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[52ch]">
          <span className="font-medium text-foreground">Como ler:</span> a média considera todas as {history.length}{" "}
          importação(ões). A comparação mostra se a <span className="font-medium text-foreground">última importação</span>{" "}
          ficou acima ou abaixo da média das anteriores — assim você vê se suas decisões estão melhorando os números.
        </p>
        <Button variant="outline" size="sm" onClick={gerarJpeg} disabled={gerando} className="shrink-0">
          <ImageDown className="h-4 w-4" /> {gerando ? "Gerando…" : "JPEG para celular"}
        </Button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((m, i) => {
          const igual = m.igual;
          const subiu = m.subiu;
          const bom = m.bom;
          const Icon = igual ? Minus : subiu ? TrendingUp : TrendingDown;
          const MIcon = METRICS[i].icon;
          const badgeCls = igual || bom === null
            ? "bg-muted text-muted-foreground"
            : bom
              ? "bg-success/15 text-success"
              : "bg-critical/15 text-critical";
          const badgeText = `${m.rotulo}${!igual ? ` ${m.pctText}` : ""}`;
          return (
            <Card key={m.label} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold leading-tight">{m.label}</div>
                    <div className="text-[11px] text-muted-foreground">{m.hint}</div>
                  </div>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", badgeCls)}>
                  <Icon className="h-3 w-3" />
                  {badgeText}
                </span>
              </div>

              <div className="mt-3 flex items-end gap-6">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Média geral</div>
                  <div className="text-3xl font-bold tabular-nums leading-none">{f0(m.media)}</div>
                </div>
                <div className="border-l border-border pl-6">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Última importação</div>
                  <div className="text-xl font-semibold tabular-nums leading-none">{fmtInt(m.atual)}</div>
                </div>
                {m.temAnterior && (
                  <div className="border-l border-border pl-6">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Média anterior</div>
                    <div className="text-xl font-semibold tabular-nums leading-none text-muted-foreground">{f0(m.base)}</div>
                  </div>
                )}
              </div>

              {!igual && bom !== null && (
                <div className={cn("mt-3 rounded-md px-2.5 py-1.5 text-xs font-medium", badgeCls)}>
                  {bom
                    ? "Impacto positivo — suas decisões estão melhorando este número."
                    : "Impacto negativo — este número piorou na última importação."}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Ranking de recorrência */}
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Itens mais recorrentes nas importações</h4>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Itens que apareceram movimentados em mais de uma importação — indica alto giro, não erro.
          {comItens < history.length && ` Considera ${comItens} importação(ões) recentes; as antigas não guardaram a lista de itens.`}
        </p>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há item repetido. Importe novos relatórios para formar o ranking.</p>
        ) : (
          <ol className="space-y-2">
            {ranking.map((r, i) => (
              <li key={r.c} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </span>
                    <span className={cn("min-w-0 truncate", i === 0 && "font-semibold")}>
                      <span className="font-mono">{r.c}</span> — {r.d}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                    {r.n}× em {history.length} importações
                  </span>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", i === 0 ? "bg-primary" : "bg-primary/50")}
                    style={{ width: `${Math.max(8, (r.n / maxN) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
