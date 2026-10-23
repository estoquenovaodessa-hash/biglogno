import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnalyzedItem } from "@/lib/types";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Estoque negativo": "bg-critical text-critical-foreground",
    "Sem estoque": "bg-critical text-critical-foreground",
    "Venda/saída com possível ruptura": "bg-warning text-warning-foreground",
    "Estoque baixo": "bg-warning text-warning-foreground",
    "Devolução/Ajuste": "bg-reverse text-reverse-foreground",
    "Logística reversa": "bg-reverse text-reverse-foreground",
    "Estoque parado": "bg-neutral text-neutral-foreground",
    "Estoque adequado": "bg-success text-success-foreground",
  };
  return (
    <span
      className={cn(
        "inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        map[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export function CurvaBadge({ curva }: { curva: string }) {
  const map: Record<string, string> = {
    A: "bg-critical text-critical-foreground",
    B: "bg-warning text-warning-foreground",
    C: "bg-info text-info-foreground",
    "Devolução/Ajuste": "bg-reverse text-reverse-foreground",
  };
  return (
    <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs font-bold", map[curva] ?? "bg-muted")}>
      {curva === "Devolução/Ajuste" ? "Dev" : curva}
    </span>
  );
}

export function PrioridadeBadge({ p, score }: { p: string; score?: number }) {
  const map: Record<string, string> = {
    Crítico: "bg-critical text-critical-foreground",
    "Alta prioridade": "bg-warning text-warning-foreground",
    Monitorar: "bg-info text-info-foreground",
    "Atenção baixa": "bg-muted text-muted-foreground",
    "Sem ação imediata": "bg-secondary text-secondary-foreground",
  };
  return (
    <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", map[p] ?? "bg-muted")}>
      {p}{score != null ? ` (${score})` : ""}
    </span>
  );
}

export function EnderecoCell({ item }: { item: AnalyzedItem }) {
  if (item.enderecoStatus === "ok")
    return <span className="font-mono text-sm">{item.parsed.enderecoNormalizado}</span>;
  return (
    <span className="text-xs text-muted-foreground italic">{item.enderecoMotivo}</span>
  );
}

export function ReincidenciaBadge() {
  return (
    <Badge className="bg-critical text-critical-foreground animate-pulse">REINCIDÊNCIA</Badge>
  );
}
