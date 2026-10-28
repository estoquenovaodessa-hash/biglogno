import { z } from "zod";

export type DeliveryStatus = "nao_iniciada" | "em_rota" | "pausada" | "no_destino" | "finalizada";
export interface Delivery {
  id: string;
  position: number;
  createdAt: string;
  document: string;
  company: string;
  value: number;
  source: "conferencia" | "manual" | "coleta";
  /** Coleta avulsa: endereço e contato não dependem da base de clientes. */
  collectionAddress?: string;
  collectionContact?: string;
  /** Programação definida pelo responsável da Expedição. */
  expeditionShift?: "manha" | "tarde";
  /** Data local AAAA-MM-DD, exclusiva de coletas agendadas. */
  scheduledDate?: string;
  /** Forma de pagamento da coleta, independente da entrega. */
  collectionPayment?: "dinheiro" | "faturado";
  status: DeliveryStatus;
  driver?: string;
  driverEmployeeId?: string;
  /** Conferência que originou o pedido: futuro Balcão poderá direcionar para Entrega/Retira. */
  channel?: "balcao" | "expedicao";
  /** Campos legados preservados para compatibilidade; não comandam o status Expedição. */
  preparedAt?: string;
  preparedBy?: string;
  startedAt?: string;
  pausedAt?: string;
  pausedMs?: number;
  arrivedAt?: string;
  finishedAt?: string;
  receiver?: string;
  companyCode?: string;
  onlyDelivery?: boolean;
  separate?: boolean;
}

export const manualDeliverySchema = z.object({
  requestId: z.string().uuid(),
  document: z.string().trim().regex(/^\d{1,20}$/, "Documento deve ser numérico.").optional(),
  companyCode: z.string().trim().regex(/^\d{1,12}$/, "Informe o código da empresa."),
  value: z.number().finite().min(0).max(100000000).optional(),
  onlyDelivery: z.boolean().default(false),
}).superRefine((d, ctx) => {
  if (!d.onlyDelivery && (!d.document || d.value === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe documento e valor." });
});

export const deliveryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), id: z.string().uuid(), driver: z.string().trim().min(1, "Informe o nome do entregador.").max(100) }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
  z.object({ action: z.literal("pause"), id: z.string().uuid() }),
  z.object({ action: z.literal("resume"), id: z.string().uuid() }),
  z.object({ action: z.literal("arrive"), id: z.string().uuid() }),
  z.object({ action: z.literal("finish"), id: z.string().uuid(), receiver: z.string().trim().min(1, "Informe o nome do recebedor.").max(150) }),
  z.object({ action: z.literal("finish_collection"), id: z.string().uuid() }),
  z.object({ action: z.literal("separate"), id: z.string().uuid() }),
  z.object({ action: z.literal("unify"), id: z.string().uuid() }),
]);
export type DeliveryAction = z.infer<typeof deliveryActionSchema>;

const ACTIVE: DeliveryStatus[] = ["em_rota", "no_destino"];
export const isActive = (d: Delivery) => ACTIVE.includes(d.status);

const companyKey = (d: Delivery) => d.company.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");

/** Cliente CONSUMIDOR: cada nota é um pedido independente, mesmo quando
 * o cadastro tem zeros à esquerda (100, 0100, 00100). */
export function isConsumerDelivery(d: Pick<Delivery, "companyCode">): boolean {
  return /^0*100$/.test(String(d.companyCode ?? "").trim());
}

/** Agrupa apenas pedidos na mesma etapa/viagem, nunca inclui um novo pedido em uma viagem já iniciada. */
export function deliveryGroups(all: Delivery[]): Delivery[][] {
  const groups = new Map<string, Delivery[]>();
  for (const d of all) {
    const key = d.source === "coleta" || isConsumerDelivery(d) || d.separate || d.status === "finalizada"
      ? d.id
      : `${companyKey(d)}|${d.status}|${d.expeditionShift ?? ""}|${d.scheduledDate ?? ""}|${d.startedAt ?? ""}|${d.arrivedAt ?? ""}`;
    const group = groups.get(key) ?? []; group.push(d); groups.set(key, group);
  }
  return [...groups.values()];
}
export const activeDeliveryCount = (all: Delivery[]) => deliveryGroups(all.filter(isActive)).length;

/** Uma entrega em rota (ou no destino) trava todas as não realizadas como "Pendente". */
export function isLocked(d: Delivery, all: Delivery[]) {
  return d.status !== "finalizada" && !isActive(d) && activeDeliveryCount(all) >= 2;
}

export function statusLabel(d: Delivery, all: Delivery[]) {
  if (isLocked(d, all)) return "Pendente";
  return { nao_iniciada: "Não iniciada", em_rota: "Em rota", pausada: "Pausada", no_destino: "No destino", finalizada: "Finalizado" }[d.status];
}

/** Aplica a ação e retorna a entrega atualizada, ou lança erro com a regra violada. */
export function applyDeliveryAction(d: Delivery, all: Delivery[], a: DeliveryAction, now: Date): Delivery {
  const iso = now.toISOString();
  const busy = isLocked(d, all);
  switch (a.action) {
    case "start":
      if (d.status !== "nao_iniciada") throw new Error("Entrega já iniciada.");
      if (busy) throw new Error("Já existem duas entregas em andamento.");
      return { ...d, status: "em_rota", driver: a.driver, startedAt: iso, pausedMs: 0, pausedAt: undefined };
    case "cancel":
      if (!["em_rota", "pausada"].includes(d.status)) throw new Error("Só é possível cancelar entregas iniciadas.");
      return { ...d, status: "nao_iniciada", driver: undefined, startedAt: undefined, pausedAt: undefined, pausedMs: 0 };
    case "pause":
      if (d.status !== "em_rota") throw new Error("Só entregas em rota podem ser pausadas.");
      return { ...d, status: "pausada", pausedAt: iso };
    case "resume":
      if (d.status !== "pausada") throw new Error("Entrega não está pausada.");
      if (busy) throw new Error("Já existem duas entregas em andamento.");
      return { ...d, status: "em_rota", pausedMs: (d.pausedMs ?? 0) + (d.pausedAt ? now.getTime() - Date.parse(d.pausedAt) : 0), pausedAt: undefined };
    case "arrive":
      if (d.status !== "em_rota") throw new Error("Entrega não está em rota.");
      return { ...d, status: "no_destino", arrivedAt: iso };
    case "finish":
      if (d.source === "coleta") throw new Error("Coleta não exige recebedor; use a confirmação de coleta.");
      if (d.status !== "no_destino") throw new Error("Pressione \"Cheguei\" antes de informar o recebedor.");
      return { ...d, status: "finalizada", receiver: a.receiver, finishedAt: iso };
    case "finish_collection":
      if (d.source !== "coleta") throw new Error("Ação permitida somente para coletas.");
      if (d.status !== "no_destino") throw new Error("Pressione \"Cheguei ao destino\" antes de confirmar a coleta.");
      return { ...d, status: "finalizada", finishedAt: iso };
    case "separate":
    case "unify":
      if (d.source === "coleta") throw new Error("Coletas não podem ser unificadas.");
      if (isConsumerDelivery(d)) throw new Error("Notas do cliente CONSUMIDOR (100) devem permanecer separadas.");
      if (d.status !== "nao_iniciada") throw new Error("Unifique ou desunifique antes de iniciar a entrega.");
      return { ...d, separate: a.action === "separate" };
  }
}

export function applyDeliveryGroupAction(all: Delivery[], a: DeliveryAction, now: Date): Delivery[] {
  const d = all.find(row => row.id === a.id);
  if (!d) throw new Error("Entrega não encontrada.");
  const members = a.action === "separate" || a.action === "unify" ? [d] : deliveryGroups(all).find(g => g.some(row => row.id === a.id)) ?? [d];
  const ids = new Set(members.map(row => row.id));
  return all.map(row => ids.has(row.id) ? applyDeliveryAction(row, all, a, now) : row);
}

export const canOperateLogistics = (role: string | null) => role === "operador";

/** Tempo de trajeto: início até "Cheguei", descontando pausas. */
export function travelMs(d: Delivery) {
  if (!d.startedAt || !d.arrivedAt) return null;
  return Math.max(0, Date.parse(d.arrivedAt) - Date.parse(d.startedAt) - (d.pausedMs ?? 0));
}
/** Tempo de espera: "Cheguei" até assinatura do recebedor. */
export function waitMs(d: Delivery) {
  if (!d.arrivedAt || !d.finishedAt) return null;
  return Math.max(0, Date.parse(d.finishedAt) - Date.parse(d.arrivedAt));
}
export function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min ${String(s % 60).padStart(2, "0")}s`;
}
export const fmtBrasilia = (iso?: string) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
