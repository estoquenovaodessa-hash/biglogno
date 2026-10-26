import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Delivery } from "@/lib/deliveries";
import { readDeliveryWhatsAppSettings, saveDeliveryWhatsAppContact } from "@/lib/delivery-whatsapp.functions";

const labels: Record<string, string> = {
  pendente: "Aguardando conector",
  em_envio: "Envio iniciado (conferir se travou)",
  enviado: "Enviado pelo WhatsApp Web",
  falha: "Falha",
  cancelado: "Cancelado",
};
const displayTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function DeliveryWhatsAppSettings({ deliveries }: { deliveries: Delivery[] }) {
  const [opened, setOpened] = useState(false);
  const read = useServerFn(readDeliveryWhatsAppSettings);
  const save = useServerFn(saveDeliveryWhatsAppContact);
  const query = useQuery({
    queryKey: ["delivery-whatsapp-settings"],
    queryFn: () => read(),
    enabled: opened,
    refetchInterval: opened ? 15000 : false,
  });
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const clients = [...new Map(deliveries
    .filter(d => d.companyCode && d.company)
    .map(d => [d.companyCode!.replace(/^0+(?=\d)/, ""), d.company])
  )].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const target = clients.find(c => c[0] === code);
  const selected = query.data?.contacts.find(c => c.code === code);
  const choose = (value: string) => {
    setCode(value);
    const existing = query.data?.contacts.find(c => c.code === value);
    setPhone(existing?.phone ?? "");
    setOptedIn(existing?.optedIn ?? false);
    setFeedback("");
  };
  const commit = async () => {
    if (!code || !target) return;
    setSaving(true); setFeedback("");
    try {
      await save({ data: { code, companyName: target[1], phone, optedIn } });
      await query.refetch();
      setFeedback(optedIn
        ? "Contato autorizado cadastrado. As próximas saídas poderão gerar um aviso."
        : "Autorização desativada. Nenhum novo aviso será enviado para este cliente.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Não foi possível salvar o contato.");
    } finally {
      setSaving(false);
    }
  };

  return <details className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm"
    open={opened} onToggle={e => setOpened(e.currentTarget.open)}>
    <summary className="flex cursor-pointer items-center gap-2 text-base font-bold">
      <MessageCircle className="h-5 w-5 text-success" />
      WhatsApp de Entregas — contatos e avisos
    </summary>
    {opened && <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Recurso opcional. Sem telefone autorizado e conector externo conectado, o BigLogno
        não envia mensagens. O cliente deve ter concordado em receber notificações da Bignotto no WhatsApp.
      </p>
      {query.isError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "Falha ao consultar configuração. Execute o SQL dos avisos no Supabase."}
      </p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm font-semibold">
          Cliente
          <select value={code} onChange={e => choose(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Selecione um cliente</option>
            {clients.map(([clientCode, name]) =>
              <option key={clientCode} value={clientCode}>{name} ({clientCode})</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold">
          WhatsApp com DDD
          <Input inputMode="tel" autoComplete="off" placeholder="19 99999-9999"
            maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} />
        </label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-primary"
              checked={optedIn} onChange={e => setOptedIn(e.target.checked)} />
            <ShieldCheck className="h-4 w-4" />
            Cliente autorizou os avisos
          </label>
          <Button disabled={saving || !code || !phone.trim()} onClick={() => { void commit(); }}>
            <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar contato"}
          </Button>
        </div>
      </div>
      {selected && <p className="text-xs text-muted-foreground">Cadastro atual: {selected.name} · {selected.optedIn ? "Autorizado" : "Não autorizado"}.</p>}
      {feedback && <p role="status" className="rounded-md border border-border p-3 text-sm">{feedback}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <h4 className="font-bold">Últimas notificações</h4>
        <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        "Enviado" significa aceito pelo WhatsApp Web; não garante recebimento ou leitura pelo cliente.
        Se uma mensagem ficar "em envio" após desconexão, confira antes de tentar reenviar.
      </p>
      {query.data?.history.length ? <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead><tr className="border-b"><th className="p-2">Horário</th><th className="p-2">Cliente</th><th className="p-2">Situação</th></tr></thead>
          <tbody>{query.data.history.map(h => <tr key={h.id} className="border-b border-border/60">
            <td className="whitespace-nowrap p-2">{displayTime(h.createdAt)}</td>
            <td className="p-2">{h.name}</td>
            <td className="p-2">{labels[h.status] ?? h.status}{h.error ? ` · ${h.error}` : ""}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="text-sm text-muted-foreground">{query.isLoading ? "Carregando notificações…" : "Nenhuma notificação registrada."}</p>}
    </div>}
  </details>;
}
