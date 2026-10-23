import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { fmtInt, fmtNum } from "@/lib/format";
import type { AnalyzedItem } from "@/lib/types";

function RankCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; sub: string; value: string }[];
}) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ol className="space-y-1 text-sm">
        {rows.length === 0 && <li className="text-muted-foreground">Sem dados.</li>}
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-border py-1 last:border-0">
            <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
            <span className="flex-1 truncate">
              <span className="font-mono">{r.label}</span>{" "}
              <span className="text-xs text-muted-foreground">{r.sub}</span>
            </span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function Ranking() {
  const { items, zonaSegura } = useStore();

  const top = (sel: (i: AnalyzedItem) => number, filter?: (i: AnalyzedItem) => boolean, fmt = fmtInt) =>
    [...items]
      .filter((i) => (filter ? filter(i) : true))
      .sort((a, b) => sel(b) - sel(a))
      .slice(0, 20)
      .map((i) => ({ label: i.codigo, sub: i.descricao.slice(0, 28), value: fmt(sel(i)) }));

  const enderecoAlertas = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.noRoteiro && i.enderecoStatus === "ok") m.set(i.parsed.enderecoNormalizado, (m.get(i.parsed.enderecoNormalizado) ?? 0) + 1);
    return Array.from(m, ([label, v]) => ({ label, sub: "", value: fmtInt(v) })).sort((a, b) => +b.value - +a.value).slice(0, 20);
  }, [items]);

  const ruaAlertas = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.noRoteiro && i.parsed.valido) { const k = `${i.parsed.bloco}R${String(i.parsed.rua).padStart(2, "0")}`; m.set(k, (m.get(k) ?? 0) + 1); }
    return Array.from(m, ([label, v]) => ({ label, sub: "", value: fmtInt(v) })).sort((a, b) => +b.value - +a.value).slice(0, 20);
  }, [items]);

  const reincRank = useMemo(
    () => [...zonaSegura].filter((z) => z.quantidadeReincidencias > 0).sort((a, b) => b.quantidadeReincidencias - a.quantidadeReincidencias).slice(0, 20).map((z) => ({ label: z.codigo, sub: z.descricao.slice(0, 28), value: fmtInt(z.quantidadeReincidencias) })),
    [zonaSegura],
  );

  const correcoesRank = useMemo(
    () => [...zonaSegura].sort((a, b) => b.quantidadeCorrecoes - a.quantidadeCorrecoes).slice(0, 20).map((z) => ({ label: z.codigo, sub: z.descricao.slice(0, 28), value: fmtInt(z.quantidadeCorrecoes) })),
    [zonaSegura],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RankCard title="Top 20 por quantidade movimentada" rows={top((i) => i.qtdMovimentada, (i) => i.qtdMovimentada > 0)} />
      <RankCard title="Top 20 por giro físico" rows={top((i) => i.giroFisico, (i) => i.giroFisico < 999, (n) => fmtNum(n))} />
      <RankCard title="Top 20 por menor cobertura física" rows={[...items].filter((i) => i.qtdMovimentada > 0).sort((a, b) => a.coberturaFisica - b.coberturaFisica).slice(0, 20).map((i) => ({ label: i.codigo, sub: i.descricao.slice(0, 28), value: fmtNum(i.coberturaFisica) }))} />
      <RankCard title="Top 20 por prioridade operacional" rows={top((i) => i.score)} />
      <RankCard title="Top 20 por estoque negativo" rows={[...items].filter((i) => i.qtdEstoque < 0).sort((a, b) => a.qtdEstoque - b.qtdEstoque).slice(0, 20).map((i) => ({ label: i.codigo, sub: i.descricao.slice(0, 28), value: fmtInt(i.qtdEstoque) }))} />
      <RankCard title="Top 20 por reincidência" rows={reincRank} />
      <RankCard title="Top 20 por frequência de correções" rows={correcoesRank} />
      <RankCard title="Top 20 endereços com mais alertas" rows={enderecoAlertas} />
      <RankCard title="Top 20 ruas com mais alertas" rows={ruaAlertas} />
    </div>
  );
}
