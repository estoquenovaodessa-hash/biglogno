import { useMemo } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { StatCard } from "./StatCard";
import { useStore } from "@/lib/store";
import { fmtInt } from "@/lib/format";
import {
  isBaixo,
  isAdequado,
  isZerado,
  isNegativo,
  isDevolucao,
  isRupturaConferida,
} from "@/lib/analysis";
import { buildResumoTexto, ruaComMaisAlertas } from "@/lib/narrative";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { items, zonaSegura, resolvidos, meta, conferencia } = useStore();

  const stats = useMemo(() => {
    const zerado = items.filter(isZerado).length;
    const baixo = items.filter(isBaixo).length;
    const devolucao = items.filter(isDevolucao).length;
    return {
      total: items.length,
      adequado: items.filter(isAdequado).length,
      baixo,
      zerado,
      negativo: items.filter(isNegativo).length,
      devolucao,
      // Ruptura = apenas itens já conferidos que continuam negativos.
      ruptura: items.filter((i) => isRupturaConferida(i, conferencia)).length,
      // Atenção = zerados + baixo + devoluções.
      atencao: zerado + baixo + devolucao,
      roteiro: items.filter((i) => i.noRoteiro).length,
      comEnd: items.filter((i) => i.enderecoStatus === "ok").length,
      semEnd: items.filter((i) => i.enderecoStatus !== "ok").length,
      reincidencias: items.filter((i) => i.reincidente).length,
      tratados: items.filter((i) => i.tratadoNoDia).length,
      corrigidos: zonaSegura.length,
    };
  }, [items, zonaSegura, conferencia]);

  const statusData = [
    { name: "Adequado", value: stats.adequado },
    { name: "Baixo", value: stats.baixo },
    { name: "Zerado", value: stats.zerado },
    { name: "Negativo", value: stats.negativo },
    { name: "Devolução", value: stats.devolucao },
  ];

  const situacaoData = [
    { name: "Ruptura (conferidos negativos)", value: stats.ruptura },
    { name: "Atenção (zerado + baixo + devolução)", value: stats.atencao },
    { name: "Adequado", value: stats.adequado },
  ];

  const topMov = useMemo(
    () =>
      [...items]
        .filter((i) => i.qtdMovimentada > 0)
        .sort((a, b) => b.qtdMovimentada - a.qtdMovimentada)
        .slice(0, 10)
        .map((i) => ({ name: i.codigo, value: i.qtdMovimentada })),
    [items],
  );

  const alertasRua = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      if (!i.noRoteiro || !i.parsed.valido) continue;
      const k = `${i.parsed.bloco}R${String(i.parsed.rua).padStart(2, "0")}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [items]);

  if (!meta) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Nenhum relatório importado ainda. Vá até a aba <strong>Importação</strong> para começar.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Produtos movimentados" value={fmtInt(stats.total)} tone="info" />
        <StatCard label="Estoque adequado" value={fmtInt(stats.adequado)} tone="success" />
        <StatCard label="Estoque baixo" value={fmtInt(stats.baixo)} tone="warning" />
        <StatCard label="Estoque zerado" value={fmtInt(stats.zerado)} tone="critical" />
        <StatCard label="Estoque negativo" value={fmtInt(stats.negativo)} tone="critical" />
        <StatCard label="Devoluções/Ajustes" value={fmtInt(stats.devolucao)} tone="reverse" />
        <StatCard label="Ruptura (conferidos negativos)" value={fmtInt(stats.ruptura)} tone="critical" />
        <StatCard label="Atenção" value={fmtInt(stats.atencao)} tone="warning" />
        <StatCard label="No Roteiro de Apuração" value={fmtInt(stats.roteiro)} tone="warning" />
        <StatCard label="Com endereço" value={fmtInt(stats.comEnd)} tone="success" />
        <StatCard label="Sem endereço" value={fmtInt(stats.semEnd)} tone="neutral" />
        <StatCard label="Reincidências" value={fmtInt(stats.reincidencias)} tone="critical" />
        <StatCard label="Tratados no dia" value={fmtInt(stats.tratados)} tone="neutral" />
        <StatCard label="Corrigidos (Zona Segura)" value={fmtInt(stats.corrigidos)} tone="success" />
        <StatCard label="Rua com mais alertas" value={ruaComMaisAlertas(items)} />
      </div>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Análise automática</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {buildResumoTexto(items, zonaSegura, resolvidos.filter((r) => r.data === meta.dataImportacao).length)}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Distribuição por status de estoque">
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90} label>
              {statusData.map((_, idx) => (
                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>

        <ChartCard title="Situação operacional (ruptura x atenção)">
          <BarChart data={situacaoData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--chart-1)" radius={4} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Top itens por quantidade movimentada">
          <BarChart data={topMov}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="var(--chart-2)" radius={4} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Alertas por rua (roteiro)">
          <BarChart data={alertasRua}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="var(--chart-5)" radius={4} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}
