import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { downloadCSV, fmtInt, shortLinha } from "@/lib/format";
import { StatusBadge, EnderecoCell } from "./badges";
import { ItemDetailModal } from "./ItemDetailModal";
import type { AnalyzedItem } from "@/lib/types";

type SortKey =
  | "endereco"
  | "codigo"
  | "descricao"
  | "qtdEstoque"
  | "qtdMovimentada";

export function ItemsTable({
  items,
  csvName = "export",
  defaultSort = "endereco",
}: {
  items: AnalyzedItem[];
  csvName?: string;
  defaultSort?: SortKey;
}) {
  const { conferencia } = useStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [bloco, setBloco] = useState("all");
  const [extra, setExtra] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<AnalyzedItem | null>(null);

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (i) =>
          i.codigo.toLowerCase().includes(q) ||
          i.descricao.toLowerCase().includes(q) ||
          i.endereco.toLowerCase().includes(q),
      );
    }
    if (status !== "all") r = r.filter((i) => i.status === status);
    if (bloco !== "all")
      r = r.filter((i) => (bloco === "sem" ? !i.parsed.valido : i.parsed.bloco === bloco));
    if (extra === "reincidencia") r = r.filter((i) => i.reincidente);
    if (extra === "tratado") r = r.filter((i) => i.tratadoNoDia);

    const sorted = [...r].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "endereco") {
        av = a.parsed.valido ? `${a.parsed.bloco}${String(a.parsed.rua).padStart(3, "0")}${a.parsed.letra}${a.parsed.nivel}` : "ZZZ";
        bv = b.parsed.valido ? `${b.parsed.bloco}${String(b.parsed.rua).padStart(3, "0")}${b.parsed.letra}${b.parsed.nivel}` : "ZZZ";
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return a.codigo.localeCompare(b.codigo);
    });
    return sorted;
  }, [items, search, status, bloco, extra, sortKey, asc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(true);
    }
  };

  const exportCSV = () => {
    const header = [
      "Código","Descrição","Linha","Grupo","Endereço","Bloco","Rua","Estoque","Qtd Movimentada",
      "Status","Conferência","Reincidência","Motivo Endereço",
    ];
    const rows = filtered.map((i) => {
      const c = conferencia[i.codigo];
      return [
        i.codigo, i.descricao, i.linha ?? "", i.grupo ?? "",
        i.enderecoStatus === "ok" ? i.parsed.enderecoNormalizado : "",
        i.parsed.blocoNome, i.parsed.valido ? String(i.parsed.rua).padStart(2, "0") : "",
        i.qtdEstoque, i.qtdMovimentada,
        i.status, c?.status ?? "Pendente",
        i.reincidente ? "SIM" : "", i.enderecoStatus !== "ok" ? i.enderecoMotivo : "",
      ];
    });
    downloadCSV(`${csvName}.csv`, [header, ...rows]);
  };


  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={cn("cursor-pointer select-none px-2 py-2 text-center font-medium hover:text-foreground", className)}
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center justify-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </span>
    </th>
  );


  const statusOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.status))),
    [items],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar código, descrição ou endereço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: todos</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={bloco} onValueChange={setBloco}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Bloco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Bloco: todos</SelectItem>
            <SelectItem value="A">Bloco A</SelectItem>
            <SelectItem value="B">Bloco B</SelectItem>
            <SelectItem value="sem">Sem endereço</SelectItem>
          </SelectContent>
        </Select>
        <Select value={extra} onValueChange={setExtra}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Filtro" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="reincidencia">Só reincidência</SelectItem>
            <SelectItem value="tratado">Só tratado no dia</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span>{filtered.length} itens</span>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="mobile-table-wrap overflow-x-auto rounded-lg border border-border">
        <table className="mobile-table w-full text-sm text-center">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <Th k="endereco">Endereço</Th>
              <Th k="codigo">Código</Th>
              <th className="px-2 py-2 text-center font-medium">Linha</th>
              <Th k="descricao" className="text-left">Descrição</Th>
              <Th k="qtdEstoque">Estq</Th>
              <Th k="qtdMovimentada">Mov</Th>
              <th className="px-2 py-2 text-center font-medium">Status</th>
              <th className="px-2 py-2 text-center font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const c = conferencia[i.codigo];
              return (
                <tr
                  key={i.codigo}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "cursor-pointer border-t border-border hover:bg-accent/50",
                    i.reincidente && "bg-critical/10 hover:bg-critical/20",
                    i.tratadoNoDia && "opacity-60",
                  )}
                >
                  <td data-label="Endereço" className="px-2 py-1.5"><EnderecoCell item={i} /></td>
                  <td data-label="Código" className="px-2 py-1.5 font-mono">{i.codigo}</td>
                  <td data-label="Linha" className="px-2 py-1.5 text-xs font-medium text-primary">{shortLinha(i.linha) || "—"}</td>
                  <td data-label="Descrição" className="px-2 py-1.5 max-w-[280px] truncate text-left">{i.descricao}</td>
                  <td data-label="Estoque" className={cn("px-2 py-1.5 tabular-nums", i.qtdEstoque < 0 && "text-critical font-bold")}>{fmtInt(i.qtdEstoque)}</td>
                  <td data-label="Movimentação" className={cn("px-2 py-1.5 tabular-nums", i.qtdMovimentada < 0 && "text-reverse font-bold")}>{fmtInt(i.qtdMovimentada)}</td>
                  <td data-label="Status" className="px-2 py-1.5"><StatusBadge status={i.status} /></td>
                  <td data-label="Conferência" className="px-2 py-1.5 text-xs">{c?.status ?? "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      <ItemDetailModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
