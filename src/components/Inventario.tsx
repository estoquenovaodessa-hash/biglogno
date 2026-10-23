import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { shortLinha, downloadCSV } from "@/lib/format";
import { CheckCircle2, Download } from "lucide-react";

interface InvRow {
  codigo: string;
  descricao: string;
  endereco: string;
  linha: string;
  grupo: string;
  conferido: boolean;
  motivo: string;
}

const PAGE = 200;

export function Inventario() {
  const { enderecoBase, items, zonaSegura, conferencia } = useStore();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "conferidos" | "pendentes">("todos");
  const [limite, setLimite] = useState(PAGE);

  const rows = useMemo<InvRow[]>(() => {
    const map = new Map<string, InvRow>();

    const put = (
      codigo: string,
      descricao: string,
      endereco: string,
      linha: string,
      grupo: string,
    ) => {
      if (!codigo) return;
      const conf = conferencia[codigo];
      const isConferido = !!conf && conf.status !== "Pendente";
      const ex = map.get(codigo);
      if (ex) {
        ex.descricao = ex.descricao || descricao;
        ex.endereco = ex.endereco || endereco;
        ex.linha = ex.linha || linha;
        ex.grupo = ex.grupo || grupo;
      } else {
        map.set(codigo, {
          codigo,
          descricao,
          endereco,
          linha,
          grupo,
          conferido: isConferido,
          motivo: conf?.motivo || "",
        });
      }
    };

    for (const r of Object.values(enderecoBase.registros)) {
      put(r.codigo, r.descricao, r.endereco, r.linha || "", r.grupo || "");
    }
    for (const it of items) {
      put(it.codigo, it.descricao, it.endereco, it.linha || "", it.grupo || "");
    }
    for (const z of zonaSegura) {
      put(z.codigo, z.descricao, z.endereco, z.linha || "", z.grupo || "");
    }

    return Array.from(map.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo),
    );
  }, [enderecoBase, items, zonaSegura, conferencia]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filtro === "conferidos") r = r.filter((x) => x.conferido);
    if (filtro === "pendentes") r = r.filter((x) => !x.conferido);
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (x) =>
          x.codigo.toLowerCase().includes(q) ||
          x.descricao.toLowerCase().includes(q) ||
          x.endereco.toLowerCase().includes(q) ||
          (x.linha || "").toLowerCase().includes(q) ||
          (x.grupo || "").toLowerCase().includes(q),
      );
    }
    return r;
  }, [rows, search, filtro]);

  const visiveis = useMemo(() => filtered.slice(0, limite), [filtered, limite]);

  const totais = useMemo(() => {
    const conferidos = rows.filter((r) => r.conferido).length;
    return { total: rows.length, conferidos, pendentes: rows.length - conferidos };
  }, [rows]);

  const exportCSV = () => {
    const header = ["Código", "Descrição", "Endereço", "Linha", "Grupo", "Status", "Motivo"];
    const data = filtered.map((r) => [
      r.codigo, r.descricao, r.endereco, r.linha, r.grupo,
      r.conferido ? "Conferido" : "Pendente", r.motivo,
    ]);
    downloadCSV("inventario.csv", [header, ...data]);
  };

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Nenhum item no inventário. Importe uma base de endereços ou uma planilha de
        movimentação para começar.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{totais.total}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Conferidos</p>
          <p className="text-2xl font-bold text-success">{totais.conferidos}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Pendentes</p>
          <p className="text-2xl font-bold">{totais.pendentes}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([
              { key: "todos", label: "Todos" },
              { key: "conferidos", label: "Conferidos" },
              { key: "pendentes", label: "Pendentes" },
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
            placeholder="Buscar código, descrição, endereço, linha ou grupo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimite(PAGE);
            }}
            className="max-w-sm"
          />
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </div>
        </div>

        <div className="mobile-table-wrap overflow-x-auto rounded-lg border border-border">
          <table className="mobile-table w-full text-sm text-center">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                {["Código", "Descrição", "Endereço", "Linha", "Grupo", "Status"].map((h) => (
                  <th key={h} className="px-2 py-2 text-center font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => (
                <tr
                  key={r.codigo}
                  className={cn(
                    "border-t border-border",
                    r.conferido && "bg-success/5",
                  )}
                >
                  <td data-label="Código" className="px-2 py-1.5 font-mono">{r.codigo}</td>
                  <td data-label="Descrição" className="px-2 py-1.5 max-w-[280px] truncate text-left">{r.descricao || "—"}</td>
                  <td data-label="Endereço" className="px-2 py-1.5 font-mono">{r.endereco || "—"}</td>
                  <td data-label="Linha" className="px-2 py-1.5 text-xs font-medium text-primary">{shortLinha(r.linha) || "—"}</td>
                  <td data-label="Grupo" className="px-2 py-1.5 text-xs text-muted-foreground">{shortLinha(r.grupo) || "—"}</td>
                  <td data-label="Status" className="px-2 py-1.5">
                    {r.conferido ? (
                      <span className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-xs font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" /> Conferido
                        {r.motivo && ` · ${r.motivo}`}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    Nenhum item para o filtro selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > visiveis.length && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <p className="text-xs text-muted-foreground">
              Mostrando {visiveis.length} de {filtered.length} itens
            </p>
            <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + PAGE)}>
              Carregar mais
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
