import { useMemo, useState } from "react";
import {
  PackageX,
  TrendingDown,
  PackageCheck,
  PackageMinus,
  RotateCcw,
  ClipboardList,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { coletarEContar } from "@/lib/coletar";
import { listarParados, exportarLoteParados } from "@/lib/parados";
import { useStore } from "@/lib/store";
import { ItemsTable } from "./ItemsTable";
import { cn } from "@/lib/utils";
import { isZerado, isBaixo, isAdequado, isNegativo, isDevolucao } from "@/lib/analysis";

const VIEWS = [
  { key: "zerado", label: "Estoque Zerado", icon: PackageX, csv: "estoque-zerado", filtro: isZerado },
  { key: "baixo", label: "Estoque Baixo", icon: TrendingDown, csv: "estoque-baixo", filtro: isBaixo },
  { key: "adequado", label: "Estoque Adequado", icon: PackageCheck, csv: "estoque-adequado", filtro: isAdequado },
  { key: "negativo", label: "Estoque Negativo", icon: PackageMinus, csv: "estoque-negativo", filtro: isNegativo },
  { key: "devolucao", label: "Devoluções", icon: RotateCcw, csv: "devolucoes", filtro: isDevolucao },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export function AnalisesOperacoes() {
  const { items, zonaSegura, enderecoBase, movimentos, conferencia } = useStore();
  const [view, setView] = useState<ViewKey>("zerado");
  const [lote, setLote] = useState<number>(() => {
    if (typeof window === "undefined") return 200;
    return Number(localStorage.getItem("monitor-abc-lote-parados")) || 200;
  });
  const parados = useMemo(
    () => listarParados(enderecoBase, movimentos, zonaSegura, conferencia),
    [enderecoBase, movimentos, zonaSegura, conferencia],
  );
  const nuncaContados = parados.filter((p) => !p.ultimaContagem).length;

  // Data de apuração = data em que o item entrou na Zona Segura.
  const datasApuracao: Record<string, string> = {};
  for (const z of zonaSegura) {
    const d = String(z.dataCorrecao ?? "");
    if (d && (!datasApuracao[z.codigo] || d > datasApuracao[z.codigo])) datasApuracao[z.codigo] = d;
  }

  const active = VIEWS.find((v) => v.key === view)!;
  const filtered = items.filter(active.filtro);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const count = items.filter(v.filtro).length;
          const isActive = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "group flex flex-col gap-1 rounded-xl border p-3 text-left transition-all",
                isActive
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent",
              )}
            >
              <div className="flex items-center justify-between">
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </div>
              <span
                className={cn(
                  "text-xs font-medium leading-tight",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {v.label}
              </span>
            </button>
          );
        })}
      </div>

      <ItemsTable items={filtered} csvName={active.csv} />
    </div>
  );
}
