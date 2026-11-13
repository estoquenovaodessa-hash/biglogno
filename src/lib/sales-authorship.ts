import { z } from "zod";
import { canonicalCode, SELLERS, salesMetrics, type VerificationRecord } from "./sales-verification";

/**
 * Crédito consultivo da autoria comercial de uma conferência REAL da Expedição.
 * A atribuição NÃO insere/duplica registros em sales_verification_records e
 * jamais participa de totais, indicadores, relatórios ou porcentagens globais.
 */
export const EXPEDITION_AUTHORSHIP_PREFIX = "sales-expedition-authorship:";
export const expeditionAuthorshipSchema = z.object({
  seller: z.enum(SELLERS),
  assignedAt: z.string().datetime(),
  assignedBy: z.literal("gestor"),
});
export type ExpeditionAuthorship = z.infer<typeof expeditionAuthorshipSchema>;
export type ExpeditionAuthorshipMap = Record<string, ExpeditionAuthorship>;

export const changeExpeditionAuthorshipSchema = z.object({
  recordId: z.string().uuid(),
  /** null remove a autoria comercial sem excluir a conferência original. */
  seller: z.enum(SELLERS).nullable(),
});

export function isExpeditionAuthorshipEligible(record: VerificationRecord): boolean {
  return record.source !== "csv" && (
    record.channel === "expedicao" ||
    canonicalCode(record.verifierCode ?? "") === "102" ||
    record.seller === "EXPEDIÇÃO"
  );
}

/** Um crédito por documento/registro, no máximo um vendedor designado.
 * O período sempre se baseia na data da conferência ORIGINAL. */
export function creditedExpeditionRecords(
  records: VerificationRecord[],
  authorships: ExpeditionAuthorshipMap,
  seller: string,
): VerificationRecord[] {
  if (!SELLERS.includes(seller as typeof SELLERS[number])) return [];
  return records.filter(record =>
    isExpeditionAuthorshipEligible(record) && authorships[record.id]?.seller === seller
  );
}

/** Só a coluna Conferências do DESEMPENHO por vendedor soma créditos.
 * Não soma itens, acertos, erros, valor, porcentagem nem cobertura.
 * As conferências reais permanecem na Expedição e nos KPIs globais. */
export function sellerPerformanceWithAuthorship(
  records: VerificationRecord[],
  authorships: ExpeditionAuthorshipMap,
  seller: string,
) {
  const actual = records.filter(r => r.seller === seller);
  const metrics = salesMetrics(actual);
  const credits = creditedExpeditionRecords(records, authorships, seller);
  return {
    ...metrics,
    count: metrics.count + credits.length,
    realCount: metrics.count,
    authorshipCount: credits.length,
    creditedRecords: credits,
  };
}
