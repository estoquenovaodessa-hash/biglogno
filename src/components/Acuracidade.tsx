import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  Line,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatCard } from "./StatCard";
import { FileText, CalendarRange } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { buildAcurRecords, resumoAcuracidade, agruparAcuracidade, calcAcuracidade } from "@/lib/acuracidade";
import { gerarRelatorioAcuracidadePDF } from "@/lib/pdfAcuracidade";
import { downloadCSV, shortLinha, nowParts, fmtDateBR } from "@/lib/format";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";


const CORRETO = "hsl(142 71% 40%)";
const DIVERGENTE = "hsl(0 72% 51%)";

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

export function Acuracidade() {
  const { conferencia, zonaSegura, enderecoBase, items } = useStore();
  const [filtro, setFiltro] = useState<"todos" | "Correto" | "Divergente">("todos");
  const [search, setSearch] = useState("");
  const [buscaEndereco, setBuscaEndereco] = useState("");
  const [buscaLinha, setBuscaLinha] = useState("");

  const [dimensao, setDimensao] = useState<"linha" | "grupo">("linha");

  const [periodoOpen, setPeriodoOpen] = useState(false);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const records = useMemo(
    () => buildAcurRecords(conferencia, zonaSegura, enderecoBase, items),
    [conferencia, zonaSegura, enderecoBase, items],
  );

  const resumo = useMemo(
    () => resumoAcuracidade(records, zonaSegura.length),
    [records, zonaSegura.length],
  );

  const porEndereco = useMemo(() => {
    const q = buscaEndereco.trim().toLowerCase();
    const base = q
      ? records.filter(
          (r) =>
            r.grupoEndereco.toLowerCase().includes(q) ||
            r.endereco.toLowerCase().includes(q),
        )
      : records;
    const agrup = agruparAcuracidade(base, (r) => r.grupoEndereco);
    return q ? agrup : agrup.slice(0, 12);
  }, [records, buscaEndereco]);

  const porCurva = useMemo(
    () => agruparAcuracidade(records, (r) => r.curva),
    [records],
  );
  const porLinhaOuGrupo = useMemo(() => {
    const q = buscaLinha.trim().toLowerCase();
    const base = q
      ? records.filter((r) => {
          const alvo = dimensao === "linha" ? r.linha : r.grupo;
          return (alvo || "").toLowerCase().includes(q);
        })
      : records;
    const agrup = agruparAcuracidade(base, (r) =>
      dimensao === "linha" ? shortLinha(r.linha) || "—" : shortLinha(r.grupo) || "—",
    );
    return q ? agrup : agrup.slice(0, 12);
  }, [records, dimensao, buscaLinha]);


  // Evolução da acuracidade GERAL: cada apuração é uma inclusão de lote
  // (conferências registradas no mesmo minuto). Mostra apenas as últimas 5
  // apurações, com a acuracidade geral acumulada até cada inclusão.
  const evolucao = useMemo(() => {
    const lotes = new Map<string, { corretos: number; divergentes: number }>();
    for (const r of records) {
      const ts = r.dataConferencia || "";
      if (!ts) continue;
      const k = ts.slice(0, 16); // agrupa por minuto = mesma inclusão de lote
      const cur = lotes.get(k) ?? { corretos: 0, divergentes: 0 };
      if (r.motivo === "Correto") cur.corretos++;
      else cur.divergentes++;
      lotes.set(k, cur);
    }
    const ordenados = Array.from(lotes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const inicio = Math.max(0, ordenados.length - 5);
    let accCorretos = 0;
    let accTotal = 0;
    let prev: number | null = null;
    const pontos: {
      label: string;
      acuracidade: number;
      corretos: number;
      divergentes: number;
      variacao: number | null;
    }[] = [];
    ordenados.forEach(([k, v], i) => {
      accCorretos += v.corretos;
      accTotal += v.corretos + v.divergentes;
      if (i < inicio) return;
      const geral = +calcAcuracidade(accCorretos, accTotal).toFixed(1);
      pontos.push({
        label: `${fmtDateBR(k.slice(0, 10))} ${k.slice(11, 16)}`,
        acuracidade: geral,
        corretos: v.corretos,
        divergentes: v.divergentes,
        variacao: prev === null ? null : +(geral - prev).toFixed(1),
      });
      prev = geral;
    });
    return pontos;
  }, [records]);

  const pieData = [
    { name: "Corretos", value: resumo.corretos },
    { name: "Divergentes", value: resumo.divergentes },
  ];

  const filtered = useMemo(() => {
    let r = records;
    if (filtro !== "todos") r = r.filter((x) => x.motivo === filtro);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.codigo.toLowerCase().includes(q) ||
          x.descricao.toLowerCase().includes(q) ||
          x.endereco.toLowerCase().includes(q),
      );
    }
    return r;
  }, [records, filtro, search]);

  const exportCSV = () => {
    const header = ["Código", "Descrição", "Endereço", "Linha", "Grupo", "Curva", "Motivo", "Observação"];
    const rows = filtered.map((r) => [
      r.codigo, r.descricao, r.endereco, r.linha, r.grupo, r.curva, r.motivo, r.observacao,
    ]);
    downloadCSV(`acuracidade-${filtro}.csv`, [header, ...rows]);
  };

  const gerarPDFPeriodo = () => {
    if (!periodoInicio || !periodoFim) {
      toast.error("Informe a data inicial e a data final.");
      return;
    }
    if (periodoInicio > periodoFim) {
      toast.error("Data inicial deve ser anterior à data final.");
      return;
    }
    const filtrados = zonaSegura.filter((z) => {
      const d = z.dataCorrecao;
      if (!d) return false;
      return d >= periodoInicio && d <= periodoFim;
    });
    if (filtrados.length === 0) {
      toast.error("Nenhuma inclusão encontrada no período selecionado.");
      return;
    }
    // Motivo real do item: prioriza a conferência (Correto/Divergente),
    // caindo para o status registrado na Zona Segura.
    const motivoDe = (codigo: string, status: string): "Correto" | "Divergente" | "—" => {
      const m = conferencia[codigo]?.motivo;
      if (m === "Correto" || m === "Divergente") return m;
      if (status === "Correto") return "Correto";
      if (status === "Divergente" || status === "Aguardando compra") return "Divergente";
      return "—";
    };
    const linhas = filtrados
      .slice()
      .sort((a, b) =>
        (a.dataCorrecao + a.horaCorrecao).localeCompare(b.dataCorrecao + b.horaCorrecao),
      )
      .map((z) => ({ z, motivo: motivoDe(z.codigo, z.status) }));
    const corretos = linhas.filter((l) => l.motivo === "Correto").length;
    const divergentes = linhas.filter((l) => l.motivo === "Divergente").length;
    const semMotivo = linhas.length - corretos - divergentes;
    const p = nowParts();
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Relatório de Acuracidade por Período — Zona Segura", 14, 14);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Período: ${fmtDateBR(periodoInicio)} a ${fmtDateBR(periodoFim)} · Gerado em ${p.dataBR} ${p.hora}`,
      14,
      20,
    );
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 26,
      head: [[
        "Itens contados no período",
        "Corretos",
        "Divergentes",
        "Sem motivo",
        "Acuracidade",
      ]],
      body: [[
        String(linhas.length),
        String(corretos),
        String(divergentes),
        String(semMotivo),
        `${((corretos / Math.max(1, corretos + divergentes)) * 100).toFixed(1)}%`,
      ]],
      theme: "grid",
      styles: { fontSize: 11, halign: "center" },
      headStyles: { fillColor: [37, 99, 235] },
    });
    // @ts-expect-error lastAutoTable injected
    const y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(12);
    doc.text(
      `Itens contados (${linhas.length}) · ${corretos} corretos · ${divergentes} divergentes`,
      14,
      y,
    );
    autoTable(doc, {
      startY: y + 3,
      head: [["Data", "Hora", "Código", "Descrição", "Endereço", "Motivo", "Status", "Observação"]],
      body: linhas.map(({ z, motivo }) => [
        fmtDateBR(z.dataCorrecao),
        z.horaCorrecao,
        z.codigo,
        (z.descricao || "").slice(0, 40),
        z.endereco || "—",
        motivo,
        z.status || "—",
        (z.observacao || "").slice(0, 40),
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 5) return;
        const val = String(data.cell.raw ?? "");
        if (val === "Divergente") data.cell.styles.textColor = [220, 38, 38];
        else if (val === "Correto") data.cell.styles.textColor = [22, 140, 90];
      },
    });
    doc.save(`acuracidade-periodo-${periodoInicio}_${periodoFim}.pdf`);
    setPeriodoOpen(false);
  };


  if (records.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Nenhum item conferido com motivo <strong>Correto</strong> ou{" "}
        <strong>Divergente</strong> ainda. Defina o motivo na conferência dos itens
        (no Roteiro de Apuração) para alimentar a acuracidade.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Itens Zona Segura" value={resumo.totalZonaSegura} />
        <StatCard label="Conferidos" value={resumo.totalConferidos} />
        <StatCard label="Corretos" value={resumo.corretos} />
        <StatCard label="Divergentes" value={resumo.divergentes} />
        <StatCard label="Acuracidade" value={`${resumo.acuracidade.toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Distribuição geral">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
            >
              <Cell fill={CORRETO} />
              <Cell fill={DIVERGENTE} />
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Acuracidade por endereço (%)
              {buscaEndereco.trim() && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  filtrado: "{buscaEndereco}"
                </span>
              )}
            </h3>
            <Input
              placeholder="Endereço (ex: BR01)"
              value={buscaEndereco}
              onChange={(e) => setBuscaEndereco(e.target.value)}
              className="h-8 max-w-[160px] text-xs"
            />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porEndereco}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                  labelFormatter={(l) => `Endereço ${l}`}
                />
                <Bar dataKey="acuracidade" radius={[4, 4, 0, 0]}>
                  {porEndereco.map((g, i) => (
                    <Cell key={i} fill={g.acuracidade >= 90 ? CORRETO : DIVERGENTE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Variação da acuracidade geral (últimas 5 apurações)</h3>
          {evolucao.length >= 2 && (
            <span className="text-xs text-muted-foreground">
              {evolucao[evolucao.length - 1].variacao === null
                ? "primeira apuração"
                : Math.abs(evolucao[evolucao.length - 1].variacao!) < 0.05
                  ? "estável"
                  : evolucao[evolucao.length - 1].variacao! > 0
                    ? `↑ subiu ${evolucao[evolucao.length - 1].variacao!.toFixed(1)} p.p.`
                    : `↓ caiu ${Math.abs(evolucao[evolucao.length - 1].variacao!).toFixed(1)} p.p.`}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Cada ponto é uma inclusão de lote de conferidos (as últimas 5). A linha mostra a
          acuracidade geral acumulada (todos os conferidos até aquela inclusão) e as barras,
          quantos itens entraram corretos ou divergentes naquele lote.
        </p>
        {evolucao.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sem datas de conferência registradas ainda.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="qtd" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === "Acuracidade" ? `${v.toFixed(1)}%` : String(v)
                  }
                  labelFormatter={(l) => `Apuração ${l}`}
                />
                <Legend />
                <Bar yAxisId="qtd" dataKey="corretos" name="Corretos" stackId="a" fill={CORRETO} />
                <Bar yAxisId="qtd" dataKey="divergentes" name="Divergentes" stackId="a" fill={DIVERGENTE} radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="acuracidade"
                  name="Acuracidade"
                  stroke="hsl(37 92% 50%)"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {evolucao.length >= 2 && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {evolucao.slice(1).map((p, i) => (
              <span
                key={i}
                className={cn(
                  "rounded-md px-2 py-1 font-medium",
                  p.variacao! >= 0 ? "bg-success/15 text-success" : "bg-critical/15 text-critical",
                )}
              >
                {p.label}: {p.variacao! >= 0 ? "+" : ""}
                {p.variacao!.toFixed(1)} p.p.
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Acuracidade por {dimensao === "linha" ? "linha" : "grupo"}
            {buscaLinha.trim() && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                filtrado: "{buscaLinha}"
              </span>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={`Buscar ${dimensao}...`}
              value={buscaLinha}
              onChange={(e) => setBuscaLinha(e.target.value)}
              className="h-8 max-w-[200px] text-xs"
            />
            <div className="flex gap-1.5">
              {([
                { key: "linha", label: "Linha" },
                { key: "grupo", label: "Grupo" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDimensao(key)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium transition-all",
                    dimensao === key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porLinhaOuGrupo}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="corretos" name="Corretos" stackId="a" fill={CORRETO} />
              <Bar dataKey="divergentes" name="Divergentes" stackId="a" fill={DIVERGENTE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <ChartCard title="Corretos x Divergentes por curva operacional">
        <BarChart data={porCurva}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="corretos" name="Corretos" stackId="a" fill={CORRETO} radius={[0, 0, 0, 0]} />
          <Bar dataKey="divergentes" name="Divergentes" stackId="a" fill={DIVERGENTE} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>


      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([
              { key: "todos", label: "Todos" },
              { key: "Correto", label: "Corretos" },
              { key: "Divergente", label: "Divergentes" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                  filtro === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Buscar código, descrição ou endereço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              Exportar CSV
            </Button>
            <Dialog open={periodoOpen} onOpenChange={setPeriodoOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarRange className="mr-1 h-4 w-4" /> Relatório por período
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Relatório de acuracidade por período</DialogTitle>
                  <DialogDescription>
                    Informe as datas para filtrar todas as inclusões na Zona Segura
                    do período selecionado.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Data inicial</label>
                    <Input
                      type="date"
                      value={periodoInicio}
                      onChange={(e) => setPeriodoInicio(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Data final</label>
                    <Input
                      type="date"
                      value={periodoFim}
                      onChange={(e) => setPeriodoFim(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPeriodoOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={gerarPDFPeriodo}>
                    <FileText className="mr-1 h-4 w-4" /> Gerar PDF
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              size="sm"
              onClick={() =>
                gerarRelatorioAcuracidadePDF(records, zonaSegura.length, filtro)
              }
            >
              <FileText className="mr-1 h-4 w-4" /> Relatório PDF
            </Button>
          </div>
        </div>

        <div className="mobile-table-wrap overflow-x-auto rounded-lg border border-border">
          <table className="mobile-table w-full text-sm text-center">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                {["Código", "Descrição", "Endereço", "Linha", "Grupo", "Curva", "Motivo", "Observação"].map((h) => (
                  <th key={h} className="px-2 py-2 text-center font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.codigo}
                  className={cn(
                    "border-t border-border",
                    r.motivo === "Divergente" ? "bg-critical/10" : "bg-success/5",
                  )}
                >
                  <td data-label="Código" className="px-2 py-1.5 font-mono">{r.codigo}</td>
                  <td data-label="Descrição" className="px-2 py-1.5 max-w-[240px] truncate text-left">{r.descricao}</td>
                  <td data-label="Endereço" className="px-2 py-1.5 font-mono">{r.endereco || "—"}</td>
                  <td data-label="Linha" className="px-2 py-1.5 text-xs font-medium text-primary">{shortLinha(r.linha) || "—"}</td>
                  <td data-label="Grupo" className="px-2 py-1.5 text-xs text-muted-foreground">{shortLinha(r.grupo) || "—"}</td>
                  <td data-label="Curva" className="px-2 py-1.5">{r.curva}</td>
                  <td data-label="Motivo" className="px-2 py-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        r.motivo === "Divergente"
                          ? "bg-critical/15 text-critical"
                          : "bg-success/15 text-success",
                      )}
                    >
                      {r.motivo}
                    </span>
                  </td>
                  <td data-label="Observação" className="px-2 py-1.5 max-w-[200px] truncate text-left">{r.observacao || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">
                    Nenhum item para o filtro selecionado.
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
