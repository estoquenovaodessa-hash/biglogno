import Papa from "papaparse";
import { z } from "zod";
import { canonicalCode, codeSchema, ERROR_REASONS, SELLERS, type VerificationRecord } from "./sales-verification";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
export const historicalRecordSchema = z.object({
  document: z.string().regex(/^\d{4,20}$/), clientCode: codeSchema, verifierCode: codeSchema,
  clientName: z.string().trim().min(1).max(200), verifierName: z.string().trim().min(1).max(200),
  items: z.number().int().min(1).max(100000), value: z.number().finite().min(0).max(100000000),
  correct: z.boolean(), seller: z.enum([...SELLERS, "EXPEDIÇÃO", "NÃO INFORMADO"]),
  channel: z.enum(["balcao", "expedicao"]), observation: z.string().max(4000),
  createdAt: z.string().datetime(), durationSeconds: z.null(), source: z.literal("csv"),
  errorReasons: z.array(z.enum(ERROR_REASONS)).max(3),
}).superRefine((r, ctx) => { if (r.correct && r.errorReasons.length) ctx.addIssue({ code: "custom", message: "Registro certo com motivo de erro." }); });
export type HistoricalRecord = z.infer<typeof historicalRecordSchema>;
export const historicalImportSchema = z.array(historicalRecordSchema).min(1).max(10000);
export function historicalKey(record: Pick<VerificationRecord, "document" | "verifierCode" | "createdAt">) {
  return `${record.document}:${canonicalCode(record.verifierCode)}:${new Date(record.createdAt).toISOString().slice(0, 16)}`;
}
function sourceDate(text: string) {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) throw new Error("Data/hora inválida.");
  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  if (!Number.isFinite(date.getTime()) || new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(date) !== `${day}/${month}/${year}`) throw new Error("Data/hora inválida.");
  return date.toISOString();
}
export function parseHistoricalSales(text: string) {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { delimiter: ";", skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error("CSV malformado. Confira aspas e colunas.");
  const header = parsed.data.findIndex(row => normalize(row[0] ?? "") === "DOCUMENTO");
  if (header < 0) throw new Error("Cabeçalho de conferências não encontrado.");
  const columns = parsed.data[header].map(normalize);
  const names = ["DOCUMENTO", "COD. CONFERENTE", "CONFERENTE", "COD. CLIENTE", "CLIENTE", "QTD ITENS", "VALOR", "SITUACAO", "OBSERVACAO", "DATA/HORA"];
  if (names.some(name => !columns.includes(name))) throw new Error("O CSV deve conter as dez colunas do relatório de conferências.");
  const rows = parsed.data.slice(header + 1);
  const field = (row: string[], name: string) => (row[columns.indexOf(name)] ?? "").trim();
  const explicitChannel = (name: string) => /EXPEDICAO/.test(normalize(name)) ? "expedicao" as const : /BALCAO/.test(normalize(name)) ? "balcao" as const : undefined;
  const channels = new Map<string, Set<"balcao" | "expedicao">>();
  for (const row of rows) {
    const channel = explicitChannel(field(row, "CONFERENTE"));
    if (channel) { const key = canonicalCode(field(row, "COD. CONFERENTE")); const values = channels.get(key) ?? new Set(); values.add(channel); channels.set(key, values); }
  }
  const result = new Map<string, HistoricalRecord>();
  let duplicates = 0;
  rows.forEach((row, index) => {
    try {
      const observation = field(row, "OBSERVACAO"), note = normalize(observation);
      const verifierCode = field(row, "COD. CONFERENTE"), known = channels.get(canonicalCode(verifierCode));
      const channel = explicitChannel(field(row, "CONFERENTE")) ?? (known?.size === 1 ? [...known][0] : undefined) ?? (/^INTERNO\b/.test(note) ? "balcao" : /^EXPEDICAO\b/.test(note) ? "expedicao" : undefined);
      if (!channel) throw new Error("Área do conferente não identificada.");
      const status = normalize(field(row, "SITUACAO"));
      if (!["CERTO", "ERRADO"].includes(status)) throw new Error("Situação deve ser CERTO ou ERRADO.");
      const sellerText = note.split(/\s*[-–—]\s*/).at(-1) ?? "";
      const seller = channel === "expedicao" ? "EXPEDIÇÃO" : SELLERS.find(s => normalize(s).replace(/\./g, "") === sellerText.replace(/\./g, "")) ?? "NÃO INFORMADO";
      const valueText = field(row, "VALOR");
      if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(valueText)) throw new Error("Valor inválido.");
      const record = historicalRecordSchema.parse({ document: field(row, "DOCUMENTO"), verifierCode, verifierName: field(row, "CONFERENTE"), clientCode: field(row, "COD. CLIENTE"), clientName: field(row, "CLIENTE"), items: Number(field(row, "QTD ITENS")), value: Number(valueText.replace(/\./g, "").replace(",", ".")), correct: status === "CERTO", observation, channel, seller, createdAt: sourceDate(field(row, "DATA/HORA")), durationSeconds: null, source: "csv", errorReasons: status === "CERTO" ? [] : ERROR_REASONS.filter(reason => new RegExp(`\\b${reason}\\b`).test(note)) });
      const key = historicalKey(record);
      if (result.has(key)) duplicates++; else result.set(key, record);
    } catch (error) { throw new Error(`Registro ${index + 1}: ${error instanceof z.ZodError ? "campos inválidos." : error instanceof Error ? error.message : "não foi possível ler."}`); }
  });
  const records = historicalImportSchema.parse([...result.values()]);
  return { records, duplicates, counter: records.filter(r => r.channel === "balcao").length, expedition: records.filter(r => r.channel === "expedicao").length, unknownSellers: records.filter(r => r.seller === "NÃO INFORMADO").length };
}