import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useStore } from "@/lib/store";
import { fmtDateBR } from "@/lib/format";

function toBR(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function EvolucaoZonaSegura() {
  const { zonaSegura } = useStore();

  // Range padrão: últimos 30 dias com base nas datas presentes.
  const { minData, maxData } = useMemo(() => {
    const datas = zonaSegura.map((z) => z.dataCorrecao).filter(Boolean).sort();
    return {
      minData: datas[0] ?? "",
      maxData: datas[datas.length - 1] ?? "",
    };
  }, [zonaSegura]);

  const [inicio, setInicio] = useState<string>("");
  const [fim, setFim] = useState<string>("");

  const de = inicio || minData;
  const ate = fim || maxData;

  const filtrados = useMemo(() => {
    return zonaSegura.filter((z) => {
      const d = z.dataCorrecao;
      if (!d) return false;
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return true;
    });
  }, [zonaSegura, de, ate]);

  const porDia = useMemo(() => {
    const map = new Map<string, number>();
    for (const z of filtrados) {
      map.set(z.dataCorrecao, (map.get(z.dataCorrecao) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, total]) => ({ data, label: toBR(data), total }));
  }, [filtrados]);

  const totalInclusoes = filtrados.length;
  const diasComInclusoes = porDia.length;
  const mediaDia = diasComInclusoes > 0 ? totalInclusoes / diasComInclusoes : 0;
  const corretos = filtrados.filter((z) => z.status === "Correto").length;
  const divergentes = filtrados.filter((z) => z.status === "Divergente").length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Evolução de inclusões</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe o volume de itens incluídos na Zona Segura por dia. Filtre
              por período para explorar os dados. O relatório em PDF do intervalo
              está disponível na aba <strong>Acuracidade</strong>.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Data inicial</label>
            <Input
              type="date"
              value={inicio}
              min={minData || undefined}
              max={maxData || undefined}
              onChange={(e) => setInicio(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Data final</label>
            <Input
              type="date"
              value={fim}
              min={minData || undefined}
              max={maxData || undefined}
              onChange={(e) => setFim(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setInicio("");
              setFim("");
            }}
          >
            Limpar
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total no período</div>
              <div className="text-lg font-semibold">{totalInclusoes}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Dias c/ inclusões</div>
              <div className="text-lg font-semibold">{diasComInclusoes}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Média/dia</div>
              <div className="text-lg font-semibold">{mediaDia.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Corretos</div>
              <div className="text-lg font-semibold text-success">{corretos}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Divergentes</div>
              <div className="text-lg font-semibold text-critical">{divergentes}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Inclusões por dia</h3>
        {porDia.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma inclusão no período selecionado.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porDia} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip
                  formatter={(v: number) => [v, "Inclusões"]}
                  labelFormatter={(l) => `Data: ${l}`}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Detalhamento ({filtrados.length})
        </h3>
        <div className="mobile-table-wrap max-h-96 overflow-y-auto rounded-lg border border-border">
          <table className="mobile-table w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                {["Data", "Hora", "Código", "Descrição", "Endereço", "Motivo"].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados
                .slice()
                .sort((a, b) =>
                  (b.dataCorrecao + b.horaCorrecao).localeCompare(
                    a.dataCorrecao + a.horaCorrecao,
                  ),
                )
                .map((z) => (
                  <tr key={z.codigo + z.dataCorrecao + z.horaCorrecao} className="border-t border-border">
                    <td data-label="Data" className="px-2 py-1.5">{fmtDateBR(z.dataCorrecao)}</td>
                    <td data-label="Hora" className="px-2 py-1.5">{z.horaCorrecao}</td>
                    <td data-label="Código" className="px-2 py-1.5 font-mono">{z.codigo}</td>
                    <td data-label="Descrição" className="px-2 py-1.5 max-w-[260px] truncate">{z.descricao}</td>
                    <td data-label="Endereço" className="px-2 py-1.5 font-mono">{z.endereco || "—"}</td>
                    <td data-label="Motivo" className="px-2 py-1.5">{z.status}</td>
                  </tr>
                ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    Nenhum item no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
