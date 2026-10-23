import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { fmtInt, fmtDateBR } from "@/lib/format";
import {
  StatusBadge,
  ReincidenciaBadge,
} from "./badges";
import type { AnalyzedItem, StatusConferencia, MotivoAcuracidade } from "@/lib/types";

const STATUS_OPTS: StatusConferencia[] = [
  "Pendente",
  "Conferido",
  "Divergente",
  "Corrigido no ERP",
  "Aguardando compra",
  "Aguardando devolução",
];

const MOTIVO_OPTS: MotivoAcuracidade[] = ["Correto", "Divergente"];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function ItemDetailModal({
  item,
  onClose,
}: {
  item: AnalyzedItem | null;
  onClose: () => void;
}) {
  const { setConferencia, conferencia, zonaSegura } = useStore();
  const [status, setStatus] = useState<StatusConferencia>("Pendente");
  const [motivo, setMotivo] = useState<MotivoAcuracidade>("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (item) {
      const c = conferencia[item.codigo];
      setStatus(c?.status ?? "Pendente");
      setMotivo(c?.motivo ?? "");
      setObs(c?.observacao ?? "");
    }
  }, [item, conferencia]);

  if (!item) return null;
  const zs = zonaSegura.find((z) => z.codigo === item.codigo);

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono">{item.codigo}</span>
            <span className="text-base font-normal">{item.descricao}</span>
            {item.reincidente && <ReincidenciaBadge />}
          </DialogTitle>
        </DialogHeader>

        {item.reincidente && (
          <div className="rounded-md bg-critical/10 border border-critical p-2 text-sm text-critical">
            Item já estava na Zona Segura e voltou a apresentar erro. Última correção:{" "}
            {fmtDateBR(item.ultimaCorrecao ?? "")} — {item.reincidenciaCount} reincidência(s).
          </div>
        )}

        <div className="grid gap-1 sm:grid-cols-2">
          <Row label="Referência" value={item.referencia || "—"} />
          <Row label="Unidade" value={item.unidade || "—"} />
          <Row label="Linha" value={item.linha || "—"} />
          <Row label="Grupo" value={item.grupo || "—"} />

          <Row
            label="Endereço"
            value={
              item.enderecoStatus === "ok"
                ? item.parsed.enderecoNormalizado
                : item.enderecoMotivo
            }
          />
          <Row label="Bloco / Rua" value={item.parsed.valido ? `${item.parsed.blocoNome} / Rua ${String(item.parsed.rua).padStart(2, "0")}` : "—"} />
          <Row label="Estoque atual" value={fmtInt(item.qtdEstoque)} />
          <Row label="Qtd. movimentada" value={fmtInt(item.qtdMovimentada)} />
          <Row label="Status" value={<StatusBadge status={item.status} />} />
        </div>


        {zs && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="mb-1 font-semibold">Histórico na Zona Segura</div>
            <Row label="Correções" value={fmtInt(zs.quantidadeCorrecoes)} />
            <Row label="Reincidências" value={fmtInt(zs.quantidadeReincidencias)} />
            <Row label="Última reincidência" value={zs.ultimaReincidencia ? fmtDateBR(zs.ultimaReincidencia) : "—"} />
            <Row label="Última observação" value={zs.observacao || "—"} />
          </div>
        )}

        <div className="space-y-2">
          <Label>Status da conferência</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusConferencia)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Motivo (acuracidade)</Label>
          <Select value={motivo || "none"} onValueChange={(v) => setMotivo(v === "none" ? "" : (v as MotivoAcuracidade))}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o motivo..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não informado</SelectItem>
              {MOTIVO_OPTS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Observação</Label>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação manual..." />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              setConferencia(item, status, motivo, obs);
              onClose();
            }}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
