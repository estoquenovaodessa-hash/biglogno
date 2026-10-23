import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";
import { StatCard } from "./StatCard";
import { useStore } from "@/lib/store";
import { fmtInt, fmtDateBR } from "@/lib/format";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </Card>
  );
}

export function IndicesReincidencia() {
  const { zonaSegura, items } = useStore();

  const data = useMemo(() => {
    const reincidentes = zonaSegura.filter((z) => z.quantidadeReincidencias > 0);
    const totalReinc = zonaSegura.reduce((s, z) => s + z.quantidadeReincidencias, 0);
    const corrigidos = zonaSegura.length;
    const falhaPos = corrigidos ? Math.round((reincidentes.length / corrigidos) * 100) : 0;

    const porRua = new Map<string, number>();
    const porEndereco = new Map<string, number>();
    const porTipo = new Map<string, number>();
    const porCurva = new Map<string, number>();
    for (const z of zonaSegura) {
      const w = z.quantidadeReincidencias;
      if (w <= 0) continue;
      const rk = `${z.bloco} ${z.rua}`.trim() || "—";
      porRua.set(rk, (porRua.get(rk) ?? 0) + w);
      porEndereco.set(z.endereco || "—", (porEndereco.get(z.endereco || "—") ?? 0) + w);
      porTipo.set(z.tipoErro, (porTipo.get(z.tipoErro) ?? 0) + w);
      porCurva.set(z.curvaOperacional, (porCurva.get(z.curvaOperacional) ?? 0) + w);
    }
    const toArr = (m: Map<string, number>) =>
      Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);

    const maisCorrigidos = [...zonaSegura]
      .sort((a, b) => b.quantidadeCorrecoes - a.quantidadeCorrecoes)
      .slice(0, 12)
      .map((z) => ({ name: z.codigo, value: z.quantidadeCorrecoes }));

    return {
      totalReinc,
      itensReinc: reincidentes.length,
      falhaPos,
      corrigEfetiva: 100 - falhaPos,
      ruaTop: toArr(porRua)[0]?.name ?? "—",
      endTop: toArr(porEndereco)[0]?.name ?? "—",
      prodTop: reincidentes.sort((a, b) => b.quantidadeReincidencias - a.quantidadeReincidencias)[0]?.codigo ?? "—",
      tipoTop: toArr(porTipo)[0]?.name ?? "—",
      ultima: zonaSegura.map((z) => z.ultimaReincidencia).filter(Boolean).sort().pop() ?? null,
      porRua: toArr(porRua),
      porEndereco: toArr(porEndereco),
      porTipo: toArr(porTipo),
      porCurva: toArr(porCurva),
      maisCorrigidos,
      atuaisReinc: items.filter((i) => i.reincidente).length,
    };
  }, [zonaSegura, items]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total de reincidências" value={fmtInt(data.totalReinc)} tone="critical" />
        <StatCard label="Itens reincidentes" value={fmtInt(data.itensReinc)} tone="critical" />
        <StatCard label="Reincidências na importação atual" value={fmtInt(data.atuaisReinc)} tone="warning" />
        <StatCard label="Rua com mais reincidências" value={data.ruaTop} />
        <StatCard label="Endereço mais reincidente" value={data.endTop} />
        <StatCard label="Produto mais reincidente" value={data.prodTop} />
        <StatCard label="Tipo de erro mais recorrente" value={data.tipoTop} />
        <StatCard label="% correção efetiva" value={`${data.corrigEfetiva}%`} tone="success" />
        <StatCard label="% falha pós-correção" value={`${data.falhaPos}%`} tone="critical" />
        <StatCard label="Última reincidência" value={data.ultima ? fmtDateBR(data.ultima) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Índice de erros por rua">
          <BarChart data={data.porRua}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="var(--chart-5)" radius={4} /></BarChart>
        </ChartCard>
        <ChartCard title="Índice de erros por endereço">
          <BarChart data={data.porEndereco}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="var(--chart-4)" radius={4} /></BarChart>
        </ChartCard>
        <ChartCard title="Itens mais corrigidos">
          <BarChart data={data.maisCorrigidos}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="var(--chart-1)" radius={4} /></BarChart>
        </ChartCard>
        <ChartCard title="Reincidência por tipo de erro">
          <BarChart data={data.porTipo}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="var(--chart-3)" radius={4} /></BarChart>
        </ChartCard>
        <ChartCard title="Reincidência por curva operacional">
          <BarChart data={data.porCurva}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="var(--chart-2)" radius={4} /></BarChart>
        </ChartCard>
      </div>
    </div>
  );
}
