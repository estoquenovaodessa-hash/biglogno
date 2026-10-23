import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useState } from "react";
import { Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Gestao } from "@/components/Gestao";
import { useStore } from "@/lib/store";
import { fmtDateTimeBR, fmtInt } from "@/lib/format";

export function Historico() {
  const { history } = useStore();
  const [gestao, setGestao] = useState(false);
  const chartData = [...history].reverse().map((h) => ({
    name: fmtDateTimeBR(h.data).slice(0, 16),
    Críticos: h.itensCriticos,
    Ruptura: h.ruptura,
    Negativos: h.negativos,
    Zerados: h.zerados,
    Reincidências: h.reincidencias,
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setGestao(true)}>
          <Gauge className="h-4 w-4" /> Analisar
        </Button>
      </div>
      <Dialog open={gestao} onOpenChange={setGestao}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Analisar</DialogTitle>
            <DialogDescription>Médias das importações e tendência dos resultados.</DialogDescription>
          </DialogHeader>
          <Gestao history={history} />
        </DialogContent>
      </Dialog>
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Evolução das importações</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Críticos" stroke="var(--chart-5)" />
              <Line type="monotone" dataKey="Ruptura" stroke="var(--chart-3)" />
              <Line type="monotone" dataKey="Negativos" stroke="var(--chart-1)" />
              <Line type="monotone" dataKey="Zerados" stroke="var(--chart-4)" />
              <Line type="monotone" dataKey="Reincidências" stroke="var(--chart-2)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mobile-table-wrap overflow-x-auto rounded-lg border border-border">
        <table className="mobile-table w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {["Data/Hora","Arquivo","Itens","Críticos","Ruptura","Negativos","Zerados","Devoluções","Sem End.","Reincid."].map((h) => (
                <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td data-label="Data/Hora" className="px-2 py-1.5">{fmtDateTimeBR(h.data)}</td>
                <td data-label="Arquivo" className="px-2 py-1.5 max-w-[200px] truncate">{h.nomeArquivo}</td>
                <td data-label="Itens" className="px-2 py-1.5">{fmtInt(h.totalItens)}</td>
                <td data-label="Críticos" className="px-2 py-1.5">{fmtInt(h.itensCriticos)}</td>
                <td data-label="Ruptura" className="px-2 py-1.5">{fmtInt(h.ruptura)}</td>
                <td data-label="Negativos" className="px-2 py-1.5">{fmtInt(h.negativos)}</td>
                <td data-label="Zerados" className="px-2 py-1.5">{fmtInt(h.zerados)}</td>
                <td data-label="Devoluções" className="px-2 py-1.5">{fmtInt(h.devolucoes)}</td>
                <td data-label="Sem endereço" className="px-2 py-1.5">{fmtInt(h.semEndereco)}</td>
                <td data-label="Reincidências" className="px-2 py-1.5">{fmtInt(h.reincidencias)}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={10} className="px-2 py-8 text-center text-muted-foreground">Nenhuma importação registrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
