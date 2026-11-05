import { verificationDestination, type VerificationRecord } from "./sales-verification";
import { salesDay } from "./sales-weekly";

export type ConferenceLabelKind = "entrega" | "retira";

/** Dados mínimos necessários para impressão, sem vendas, valores ou comentários. */
export type ConferenceLabelEntry=Pick<VerificationRecord,
  "id"|"createdAt"|"document"|"clientName"|"clientCode"|"items"
  |"verifierCode"|"verifierName"|"forDelivery"|"balcaoDestination"|"source">;

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

export function eligibleConferenceLabelRecords<T extends ConferenceLabelEntry>(records: T[]): T[] {
  return records.filter(record => conferenceLabelKind(record) !== null);
}

export function conferenceLabelsForDay<T extends ConferenceLabelEntry>(records: T[], day: string): T[] {
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
export function filterConferenceLabelRecords<T extends ConferenceLabelEntry>(
  records: T[], filters: ConferenceLabelFilters,
): T[] {
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
