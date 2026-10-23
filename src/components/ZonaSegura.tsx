import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Download, Trash2, ShieldCheck, PlusCircle, Target, Boxes, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { downloadCSV, fmtDateBR, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConferenciaManual } from "./ConferenciaManual";
import { Acuracidade } from "./Acuracidade";
import { Inventario } from "./Inventario";
import { EvolucaoZonaSegura } from "./EvolucaoZonaSegura";

export function ZonaSegura() {
  const [sub, setSub] = useState<
    "registro" | "incluir" | "acuracidade" | "inventario" | "evolucao"
  >("registro");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {([
          { key: "registro", label: "Registro", icon: ShieldCheck },
          { key: "incluir", label: "Incluir", icon: PlusCircle },
          { key: "acuracidade", label: "Acuracidade", icon: Target },
          { key: "inventario", label: "Inventário", icon: Boxes },
          { key: "evolucao", label: "Evolução", icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              sub === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {sub === "registro" ? (
        <ZonaSeguraRegistro />
      ) : sub === "incluir" ? (
        <ConferenciaManual />
      ) : sub === "acuracidade" ? (
        <Acuracidade />
      ) : sub === "inventario" ? (
        <Inventario />
      ) : (
        <EvolucaoZonaSegura />
      )}
    </div>
  );
}

const PAGE = 200;

function ZonaSeguraRegistro() {
  const { zonaSegura, clearZonaSegura } = useStore();
  const [search, setSearch] = useState("");
  const [onlyReinc, setOnlyReinc] = useState(false);
  const [limite, setLimite] = useState(PAGE);

  const filtered = useMemo(() => {
    let r = zonaSegura;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((z) => z.codigo.toLowerCase().includes(q) || z.descricao.toLowerCase().includes(q));
    }
    if (onlyReinc) r = r.filter((z) => z.quantidadeReincidencias > 0);
    return r;
  }, [zonaSegura, search, onlyReinc]);

  const visiveis = useMemo(() => filtered.slice(0, limite), [filtered, limite]);

  const exportCSV = () => {
    const header = [
      "Data Correção","Hora","Código","Descrição","Endereço","Bloco","Rua","Curva",
      "Categoria","Tipo Erro","Estoque","Qtd Movimentada","Ação","Status","Observação",
      "Correções","Reincidências","Última Reincidência",
    ];
    const rows = filtered.map((z) => [
      z.dataCorrecao, z.horaCorrecao, z.codigo, z.descricao, z.endereco, z.bloco, z.rua,
      z.curvaOperacional, z.categoriaOriginal, z.tipoErro, z.estoqueNaCorrecao,
      z.quantidadeMovimentadaNaCorrecao, z.acaoRealizada, z.status, z.observacao,
      z.quantidadeCorrecoes, z.quantidadeReincidencias, z.ultimaReincidencia ?? "",
    ]);
    downloadCSV("zona-segura.csv", [header, ...rows]);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Registro permanente de itens conferidos/corrigidos. Não é apagado ao importar nova
          planilha nem ao limpar a análise atual.
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar código ou descrição..." value={search} onChange={(e) => { setSearch(e.target.value); setLimite(PAGE); }} className="max-w-xs" />
        <Button variant={onlyReinc ? "default" : "outline"} size="sm" onClick={() => { setOnlyReinc((v) => !v); setLimite(PAGE); }}>
          Só reincidências
        </Button>
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-1 h-4 w-4" /> Limpar Zona Segura
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar Zona Segura?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja apagar o histórico permanente da Zona Segura? Essa
                  ação não poderá ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={clearZonaSegura}>Apagar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mobile-table-wrap overflow-x-auto rounded-lg border border-border">
        <table className="mobile-table w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {["Data","Hora","Código","Descrição","Endereço","Curva","Categoria","Tipo Erro","Estq","Mov","Status","Obs","Corr.","Reinc."].map((h) => (
                <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((z) => (
              <tr key={z.codigo} className={z.quantidadeReincidencias > 0 ? "border-t border-border bg-critical/10" : "border-t border-border"}>
                <td data-label="Data" className="px-2 py-1.5">{fmtDateBR(z.dataCorrecao)}</td>
                <td data-label="Hora" className="px-2 py-1.5">{z.horaCorrecao}</td>
                <td data-label="Código" className="px-2 py-1.5 font-mono">{z.codigo}</td>
                <td data-label="Descrição" className="px-2 py-1.5 max-w-[220px] truncate">{z.descricao}</td>
                <td data-label="Endereço" className="px-2 py-1.5 font-mono">{z.endereco || "—"}</td>
                <td data-label="Curva" className="px-2 py-1.5">{z.curvaOperacional}</td>
                <td data-label="Categoria" className="px-2 py-1.5">{z.categoriaOriginal}</td>
                <td data-label="Tipo de erro" className="px-2 py-1.5">{z.tipoErro}</td>
                <td data-label="Estoque" className="px-2 py-1.5 text-right">{fmtInt(z.estoqueNaCorrecao)}</td>
                <td data-label="Movimentação" className="px-2 py-1.5 text-right">{fmtInt(z.quantidadeMovimentadaNaCorrecao)}</td>
                <td data-label="Status" className="px-2 py-1.5">{z.status}</td>
                <td data-label="Observação" className="px-2 py-1.5 max-w-[160px] truncate">{z.observacao}</td>
                <td data-label="Correções" className="px-2 py-1.5 text-right">{z.quantidadeCorrecoes}</td>
                <td data-label="Reincidências" className="px-2 py-1.5 text-right">{z.quantidadeReincidencias}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={14} className="px-2 py-8 text-center text-muted-foreground">Nenhum item na Zona Segura.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > visiveis.length && (
        <div className="flex items-center justify-center gap-3">
          <p className="text-xs text-muted-foreground">
            Mostrando {visiveis.length} de {filtered.length} registros
          </p>
          <Button variant="outline" size="sm" onClick={() => setLimite((l) => l + PAGE)}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
