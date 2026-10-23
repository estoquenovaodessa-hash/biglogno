import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "./StatCard";
import { useStore } from "@/lib/store";
import { fmtDateBR, fmtInt } from "@/lib/format";

type Motivo = "Zerado" | "Negativo" | "Estoque baixo";

const MOTIVO_POR_TIPO: Record<string, Motivo> = {
  ESTOQUE_ZERADO: "Zerado",
  ESTOQUE_NEGATIVO: "Negativo",
  ESTOQUE_BAIXO: "Estoque baixo",
  Z: "Zerado",
  N: "Negativo",
  B: "Estoque baixo",
};

const TONE: Record<Motivo, string> = {
  Zerado: "bg-warning/15 text-warning border-warning/40",
  Negativo: "bg-critical/15 text-critical border-critical/40",
  "Estoque baixo": "bg-info/15 text-info border-info/40",
};

interface Ocorrencia {
  data: string;
  motivo: Motivo;
  corrigidoEm: string | null;
}

interface Linha {
  codigo: string;
  descricao: string;
  endereco: string;
  ultimaCorrecao: string | null;
  aparicoes: number;
  ocorrencias: Ocorrencia[];
  porMotivo: Record<Motivo, number>;
}

const PAGE = 200;
const dia = (s: string | null | undefined) => (s ? s.slice(0, 10) : "");
const fmt = (s: string | null) => (s ? fmtDateBR(s) : "—");

export function Estoque() {
  const { history, zonaSegura, resolvidos, items } = useStore();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Motivo | "Todos">("Todos");
  const [limite, setLimite] = useState(PAGE);
  const [aberto, setAberto] = useState<Linha | null>(null);

  const linhas = useMemo(() => {
    const info = new Map<string, { descricao: string; endereco: string }>();
    const ocorr = new Map<string, Map<string, Motivo>>(); // codigo -> "data|motivo"
    const correcoes = new Map<string, Set<string>>();
    const aparicoes = new Map<string, Set<string>>();

    const addInfo = (c: string, d?: string, e?: string) => {
      const cur = info.get(c) ?? { descricao: "", endereco: "" };
      if (d && !cur.descricao) cur.descricao = d;
      if (e && !cur.endereco) cur.endereco = e;
      info.set(c, cur);
    };
    const addOc = (c: string, data: string, tipo: string) => {
      const m = MOTIVO_POR_TIPO[tipo];
      if (!m || !data) return;
      if (!ocorr.has(c)) ocorr.set(c, new Map());
      ocorr.get(c)!.set(`${data}|${m}`, m);
    };
    const addCor = (c: string, data: string) => {
      if (!data) return;
      if (!correcoes.has(c)) correcoes.set(c, new Set());
      correcoes.get(c)!.add(data);
    };

    for (const i of items) addInfo(i.codigo, i.descricao, i.endereco);
    for (const h of history) {
      const d = dia(h.dataRef ?? h.data);
      for (const m of h.movidos ?? []) {
        addInfo(m.c, m.d);
        if (!aparicoes.has(m.c)) aparicoes.set(m.c, new Set());
        aparicoes.get(m.c)!.add(h.id);
      }
      for (const e of h.erros ?? []) {
        addOc(e.c, d, e.t);
        if (!aparicoes.has(e.c)) aparicoes.set(e.c, new Set());
        aparicoes.get(e.c)!.add(h.id);
      }
    }
    for (const r of resolvidos) {
      addInfo(r.codigo, r.descricao, r.endereco);
      addOc(r.codigo, dia(r.data), r.tipoErro);
      addCor(r.codigo, dia(r.data));
    }
    for (const z of zonaSegura) {
      addInfo(z.codigo, z.descricao, z.endereco);
      addOc(z.codigo, dia(z.dataImportacaoOriginal || z.dataCorrecao), z.tipoErro);
      addCor(z.codigo, dia(z.dataCorrecao));
    }

    const out: Linha[] = [];
    for (const [codigo, mapa] of ocorr) {
      const cors = [...(correcoes.get(codigo) ?? [])].sort();
      const ocorrencias: Ocorrencia[] = [...mapa.entries()]
        .map(([k, motivo]) => {
          const data = k.split("|")[0];
          return { data, motivo, corrigidoEm: cors.find((c) => c >= data) ?? null };
        })
        .sort((a, b) => b.data.localeCompare(a.data));
      const porMotivo: Record<Motivo, number> = { Zerado: 0, Negativo: 0, "Estoque baixo": 0 };
      for (const o of ocorrencias) porMotivo[o.motivo]++;
      const inf = info.get(codigo) ?? { descricao: "", endereco: "" };
      out.push({
        codigo,
        descricao: inf.descricao,
        endereco: inf.endereco,
        ultimaCorrecao: cors[cors.length - 1] ?? null,
        aparicoes: Math.max(aparicoes.get(codigo)?.size ?? 0, ocorrencias.length),
        ocorrencias,
        porMotivo,
      });
    }
    return out.sort((a, b) => b.ocorrencias.length - a.ocorrencias.length || b.aparicoes - a.aparicoes);
  }, [history, zonaSegura, resolvidos, items]);

  const totais = useMemo(() => {
    const t: Record<Motivo, number> = { Zerado: 0, Negativo: 0, "Estoque baixo": 0 };
    for (const l of linhas) for (const k of Object.keys(t) as Motivo[]) t[k] += l.porMotivo[k];
    return t;
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (l) =>
        (filtro === "Todos" || l.porMotivo[filtro] > 0) &&
        (!q || l.codigo.toLowerCase().includes(q) || l.descricao.toLowerCase().includes(q) || l.endereco.toLowerCase().includes(q)),
    );
  }, [linhas, busca, filtro]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Itens com erro registrado" value={fmtInt(linhas.length)} tone="info" />
        <StatCard label="Ocorrências de zerado" value={fmtInt(totais.Zerado)} tone="warning" />
        <StatCard label="Ocorrências de negativo" value={fmtInt(totais.Negativo)} tone="critical" />
        <StatCard label="Ocorrências de estoque baixo" value={fmtInt(totais["Estoque baixo"])} tone="neutral" />
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Estoque — itens com mais erros</h2>
            <p className="text-xs text-muted-foreground">Clique em uma linha para ver todas as ocorrências e correções.</p>
          </div>
          <Input
            placeholder="Buscar código, descrição ou endereço"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setLimite(PAGE); }}
            className="w-full sm:max-w-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["Todos", "Zerado", "Negativo", "Estoque baixo"] as const).map((m) => (
            <Button key={m} size="sm" variant={filtro === m ? "default" : "outline"} onClick={() => { setFiltro(m); setLimite(PAGE); }}>
              {m}
            </Button>
          ))}
        </div>

        <div className="mobile-table-wrap overflow-x-auto rounded-md border border-border">
          <table className="mobile-table w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-center">Código</th>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-center">Endereço</th>
                <th className="px-3 py-2 text-center">Motivos</th>
                <th className="px-3 py-2 text-center">Última correção</th>
                <th className="px-3 py-2 text-center">Aparições</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, limite).map((l) => (
                <tr key={l.codigo} onClick={() => setAberto(l)} className="cursor-pointer border-t border-border hover:bg-accent/50">
                  <td data-label="Código" className="px-3 py-2 text-center font-mono font-semibold">{l.codigo}</td>
                  <td data-label="Descrição" className="px-3 py-2">{l.descricao || "—"}</td>
                  <td data-label="Endereço" className="px-3 py-2 text-center">{l.endereco || "—"}</td>
                  <td data-label="Motivos" className="px-3 py-2 text-center">
                    <div className="flex flex-wrap justify-center gap-1">
                      {(Object.keys(l.porMotivo) as Motivo[]).filter((m) => l.porMotivo[m] > 0).map((m) => (
                        <Badge key={m} variant="outline" className={TONE[m]}>{m} ×{l.porMotivo[m]}</Badge>
                      ))}
                    </div>
                  </td>
                  <td data-label="Última correção" className="px-3 py-2 text-center">{fmt(l.ultimaCorrecao)}</td>
                  <td data-label="Aparições" className="px-3 py-2 text-center font-semibold">{l.aparicoes}</td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhum item encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtradas.length > limite && (
          <div className="text-center">
            <Button variant="outline" onClick={() => setLimite((v) => v + PAGE)}>Carregar mais ({filtradas.length - limite} restantes)</Button>
          </div>
        )}
      </Card>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {aberto && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{aberto.codigo}</DialogTitle>
                <DialogDescription>{aberto.descricao || "—"} · Endereço: {aberto.endereco || "—"}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(aberto.porMotivo) as Motivo[]).map((m) => (
                  <div key={m} className={`rounded-md border p-2 text-center ${TONE[m]}`}>
                    <div className="text-xl font-bold">{aberto.porMotivo[m]}</div>
                    <div className="text-xs">{m}</div>
                  </div>
                ))}
              </div>
              <div className="mobile-table-wrap rounded-md border border-border">
                <table className="mobile-table w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-center">Motivo</th>
                      <th className="px-3 py-2 text-center">Data de aparição</th>
                      <th className="px-3 py-2 text-center">Corrigido em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aberto.ocorrencias.map((o, i) => (
                      <tr key={i} className="border-t border-border">
                        <td data-label="Motivo" className="px-3 py-2 text-center"><Badge variant="outline" className={TONE[o.motivo]}>{o.motivo}</Badge></td>
                        <td data-label="Data de aparição" className="px-3 py-2 text-center">{fmt(o.data)}</td>
                        <td data-label="Corrigido em" className="px-3 py-2 text-center">{fmt(o.corrigidoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
