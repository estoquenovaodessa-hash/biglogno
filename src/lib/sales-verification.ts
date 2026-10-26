import { z } from "zod";
import Papa from "papaparse";

export const codeSchema = z.string().trim().regex(/^\d{1,12}$/, "Informe um código numérico.");
export const clientSchema = z.object({ code: codeSchema, name: z.string().trim().min(1).max(200) });
export const verifierSchema = clientSchema.extend({ expedition: z.boolean().default(false) });
export type SalesClient = z.infer<typeof clientSchema>;
export type Verifier = z.infer<typeof verifierSchema>;
export const SELLERS = ["Arthur B.", "Arthur E.", "Carlos", "José", "Helton", "Daniel", "Leo", "Caique"] as const;
export const ERROR_REASONS = ["MATERIAL", "QUANTIDADE", "CPF"] as const;
export type ErrorReason = typeof ERROR_REASONS[number];
export const verificationSchema = z.object({
  requestId: z.string().uuid(), document: z.string().trim().regex(/^\d{4,20}$/, "Documento deve ter de 4 a 20 dígitos."),
  items: z.number().int().min(1).max(100000), clientCode: codeSchema, verifierCode: codeSchema,
  value: z.number().finite().min(0).max(100000000), correct: z.boolean(),
  seller: z.enum([...SELLERS, "EXPEDIÇÃO"]), durationSeconds: z.number().int().min(0).max(86400),
  errorReason: z.enum(ERROR_REASONS).optional(),
  errorReasons: z.array(z.enum(ERROR_REASONS)).max(3).optional(),
  forDelivery: z.boolean().optional(),
  /** Encaminhamento opcional exclusivo do Balcão: sem seleção = somente Conferência. */
  balcaoDestination: z.enum(["entrega", "retira"]).optional(),
}).superRefine((record, ctx) => {
  const reasons = record.errorReasons?.length || record.errorReason;
  if (!record.correct && !reasons) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["errorReasons"], message: "Selecione MATERIAL, QUANTIDADE ou CPF." });
  if (record.correct && reasons) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["errorReasons"], message: "Uma conferência certa não pode ter motivo de erro." });
});
export type VerificationInput = z.infer<typeof verificationSchema>;
export type VerificationRecord = Omit<VerificationInput, "seller" | "durationSeconds"> & { seller: VerificationInput["seller"] | "NÃO INFORMADO"; durationSeconds: number | null; id: string; createdAt: string; clientName: string; verifierName: string; employeeId?: string; channel?: "balcao" | "expedicao"; observation?: string; source?: "csv" };
export function verificationChannel(record: Pick<VerificationRecord, "seller" | "channel">) { return record.channel ?? (record.seller === "EXPEDIÇÃO" ? "expedicao" : "balcao"); }
export function canonicalCode(code: string) { return code.replace(/^0+(?=\d)/, ""); }
/** "27" → 27; "360" → 360; "27,5" → 27.5; "1.234,56" → 1234.56. Sem vírgula = reais inteiros. */
export function parseMoneyInput(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s.replace(/\./g, ""));
}
export function formatMoneyInput(raw: string): string {
  const n = parseMoneyInput(raw);
  return Number.isFinite(n) ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : raw;
}
export function documentPrefix(document: string) { return document.slice(0, 4); }
export function lastVerificationFields(record?: Pick<VerificationInput, "document" | "clientCode" | "verifierCode">) {
  return { prefix: record ? documentPrefix(record.document) : "", clientCode: record?.clientCode ?? "", verifierCode: record?.verifierCode ?? "" };
}
export function errorComment(record: Pick<VerificationRecord, "correct" | "errorReason" | "errorReasons" | "seller" | "channel" | "observation" | "source">) {
  if (record.correct) return "—";
  if (record.source === "csv" && record.observation) return record.observation;
  const area = verificationChannel(record) === "expedicao" ? "Expedição" : "Interno";
  const reasons = [...new Set([...(record.errorReasons ?? []), ...(record.errorReason ? [record.errorReason] : [])])];
  return `${area} — ${reasons.length ? reasons.join(" / ") : record.observation || "Motivo não informado"} - ${record.seller}`;
}
export function parseClients(text: string): SalesClient[] {
  const rows = Papa.parse<string[]>(text, { delimiter: ";", skipEmptyLines: true }).data;
  const header = rows.findIndex(row => row.some(cell => cell.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() === "NOME DO CLIENTE"));
  if (header < 0) throw new Error("Cabeçalho CÓDIGO / NOME DO CLIENTE não encontrado.");
  const columns = rows[header].map(cell => cell.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase());
  const codeIndex = columns.indexOf("CODIGO"), nameIndex = columns.indexOf("NOME DO CLIENTE");
  if (codeIndex < 0) throw new Error("Coluna CÓDIGO não encontrada.");
  const result = new Map<string, SalesClient>();
  for (const row of rows.slice(header + 1)) {
    if (!row[codeIndex]?.trim()) continue;
    const parsed = clientSchema.safeParse({ code: row[codeIndex], name: row[nameIndex] });
    if (!parsed.success) continue;
    result.set(canonicalCode(parsed.data.code), parsed.data);
  }
  if (!result.size) throw new Error("Nenhum cliente válido encontrado.");
  return [...result.values()];
}
export function salesMetrics(records: VerificationRecord[]) {
  const correct = records.filter(r => r.correct).length;
  const timed = records.filter(r => r.durationSeconds !== null);
  return { count: records.length, items: records.reduce((s, r) => s + r.items, 0), correct, errors: records.length - correct,
    accuracy: records.length ? correct / records.length * 100 : 0, value: records.reduce((s, r) => s + r.value, 0),
    minutes: timed.length ? timed.reduce((s, r) => s + (r.durationSeconds ?? 0), 0) / timed.length / 60 : 0 };
}

export function percentageTone(value: number) {
  return value < 70 ? "destructive" : value <= 95 ? "warning" : "success";
}
export function canManageSales(role: string | null) { return role === "gestor"; }
export const sellerSalesSchema = z.object({ period: z.string().regex(/^(all|\d{4}-\d{2}(?:-\d{2})?)$/), seller: z.enum([...SELLERS, "EXPEDIÇÃO"]), count: z.number().int().min(0).max(100000000) });
export function sellerCountKey(period: string, seller: string) { return `sales-seller-count:${period}:${seller}`; }
export function sellerMetrics(records: VerificationRecord[], seller: string, sales: number) {
  const list = records.filter(r => r.seller === seller);
  const errors = [...ERROR_REASONS, "NÃO INFORMADO"].map(reason => ({ reason, count: list.filter(r => {
    if (r.correct) return false;
    const reasons = new Set([...(r.errorReasons ?? []), ...(r.errorReason ? [r.errorReason] : [])]);
    return reason === "NÃO INFORMADO" ? reasons.size === 0 : reasons.has(reason as ErrorReason);
  }).length })).sort((a, b) => b.count - a.count);
  return { ...salesMetrics(list), coverage: sales > 0 ? list.length / sales * 100 : null, errorsByReason: errors };
}