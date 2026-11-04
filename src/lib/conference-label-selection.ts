import { verificationDestination, type VerificationRecord } from "./sales-verification";
import { salesDay } from "./sales-weekly";

export type ConferenceLabelKind = "entrega" | "retira";

/** O destino é a decisão registrada na conferência, não uma inferência
 * pelo nome do cliente, sufixo da nota ou situação atual da Expedição. */
export function conferenceLabelKind(
  record: Pick<VerificationRecord, "verifierCode" | "forDelivery" | "balcaoDestination" | "source">,
): ConferenceLabelKind | null {
  // CSV histórico não representa um pedido operacional identificado.
  if (record.source === "csv") return null;
  const destination = verificationDestination(record);
  return destination === "deliveries" ? "entrega"
    : destination === "pickups" ? "retira" : null;
}

export function eligibleConferenceLabelRecords(records: VerificationRecord[]): VerificationRecord[] {
  return records.filter(record => conferenceLabelKind(record) !== null);
}

export function conferenceLabelsForDay(records: VerificationRecord[], day: string): VerificationRecord[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return eligibleConferenceLabelRecords(records).filter(record =>
    record.createdAt && Number.isFinite(Date.parse(record.createdAt))
      && salesDay(record.createdAt) === day);
}

export type ConferenceLabelFilters = {
  from?: string;
  to?: string;
  kind?: "all" | ConferenceLabelKind;
  query?: string;
};

/** Consulta datas do histórico sem depender dos filtros do painel do gestor. */
export function filterConferenceLabelRecords(
  records: VerificationRecord[], filters: ConferenceLabelFilters,
): VerificationRecord[] {
  const search = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("pt-BR");
  const query = search(filters.query || "");
  return eligibleConferenceLabelRecords(records).filter(record => {
    if (!record.createdAt || !Number.isFinite(Date.parse(record.createdAt))) return false;
    const day = salesDay(record.createdAt);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    if (filters.kind && filters.kind !== "all" && conferenceLabelKind(record) !== filters.kind)
      return false;
    return !query || search([record.document, record.clientName,
      record.verifierName, record.clientCode, record.verifierCode].join(" ")).includes(query);
  });
}
