import { z } from "zod";
import type { EnderecoBase, EnderecoRecord } from "./types";

export type ReverseStage = "em_tratativa" | "aguardando_coleta" | "coletado" | "resolvido" | "devolvido";
export type ReverseWorkflowStage = "em_contagem" | "em_tratativa" | "aguardando_coleta" | "coletado" | "resolvido";
export const REVERSE_CONTACT_STEP_LABELS = [
  { key:"informedItems", label:"Foi informada ao fornecedor a relação dos itens" },
  { key:"mirrorApproved", label:"O espelho de NFDev foi emitido e aprovado" },
  { key:"finalInvoiceRequested", label:"Foi solicitada a NF-e definitiva de devolução" },
  { key:"pickupScheduled", label:"A coleta foi agendada com o fornecedor" },
] as const;
export const reverseContactSchema = z.object({
  informedItems:z.boolean(), mirrorApproved:z.boolean(),
  finalInvoiceRequested:z.boolean(), pickupScheduled:z.boolean(),
});
export type ReverseContactChecklist = z.infer<typeof reverseContactSchema>;
export const emptyReverseChecklist = (): ReverseContactChecklist => ({
  informedItems:false,mirrorApproved:false,finalInvoiceRequested:false,pickupScheduled:false,
});
export function allReverseContactStepsDone(steps?:ReverseContactChecklist):boolean {
  return !!steps && REVERSE_CONTACT_STEP_LABELS.every(({key})=>steps[key]===true);
}
export const reverseSupplierDetailsSchema=z.object({
  name:z.string().trim().min(2,"Informe o nome do fornecedor.").max(180),
  brands:z.array(z.string().trim().min(1).max(100)).min(1,"Informe ao menos uma marca.").max(100)
    .refine(values=>new Set(values.map(v=>v.toLocaleUpperCase("pt-BR"))).size===values.length,"Marcas repetidas."),
  contactName:z.string().trim().max(120).default(""),
  phone:z.string().trim().max(30).default(""),
  email:z.union([z.literal(""),z.string().trim().email("E-mail inválido.")]).default(""),
  cnpj:z.string().trim().max(24).default(""),
});
export type ReverseSupplierDetails=z.infer<typeof reverseSupplierDetailsSchema>;
export type ReverseSupplier=ReverseSupplierDetails&{
  id:string;version:number;createdAt:string;updatedAt:string;
};
export const reverseSupplierSaveSchema=reverseSupplierDetailsSchema.extend({
  id:z.string().uuid().optional(), version:z.number().int().positive().optional(),
});
export const reverseCycleSupplierSchema=z.object({
  supplierId:z.string().uuid(),brand:z.string().trim().min(1).max(100),
});
export const reverseCreateSchema=z.object({
  groups:z.array(z.string().min(1).max(500)).min(1).max(200),
  supplierId:z.string().uuid(),
  brand:z.string().trim().min(1).max(100),
});
export const reverseContactProgressSchema=z.object({
  id:z.string().uuid(),version:z.number().int().positive(),
  steps:reverseContactSchema,
});
export const reverseStageChangeSchema=z.object({
  id:z.string().uuid(),version:z.number().int().positive(),
  status:z.enum(["aguardando_coleta","coletado","resolvido"]),
  nfd:z.string().trim().max(80).optional(),
  volumes:z.number().int().min(1).max(500).optional(),
  returnMode:z.enum(["abatimento_boleto","devolucao_material"]).optional(),
  returnNfe:z.string().trim().max(80).optional(),
});
export function reverseWorkflowStage(c:Pick<ReverseCycle,"status"|"treatmentStatus">): ReverseWorkflowStage {
  if(c.status==="aberto")return "em_contagem";
  if(c.treatmentStatus==="devolvido"||c.treatmentStatus==="resolvido")return "resolvido";
  return c.treatmentStatus??"em_tratativa";
}
export function reverseWhatsAppLink(phone:string):string|null {
  let digits=phone.replace(/\D/g,"");
  if(digits.length===10||digits.length===11)digits="55"+digits;
  if(!/^\d{12,13}$/.test(digits)||!digits.startsWith("55"))return null;
  return "https://wa.me/"+digits;
}
/** Os vídeos serão disponibilizados quando o usuário informar as URLs oficiais. */
export const REVERSE_TUTORIAL_MIRROR_URL: string | null = null;
export const REVERSE_TUTORIAL_FINAL_INVOICE_URL: string | null = null;

export type ReverseReturnMode = "abatimento_boleto" | "devolucao_material";
export type ReverseItem = {
  codigo: string; descricao: string; linha: string; grupo: string; quantidade: number;
};
export type ReverseCycle = {
  id: string; number: number; version: number; createdAt: string; updatedAt: string;
  groups: string[]; items: ReverseItem[]; status: "aberto" | "finalizado";
  supplier?: string; supplierId?: string; brand?: string; finishedAt?: string;
  treatmentStatus?: ReverseStage; nfd?: string; volumes?: number;
  contactSteps?: ReverseContactChecklist; contactStartedAt?: string;
  returnMode?: ReverseReturnMode; returnNfe?: string; statusChangedAt?: string;
};
export const reverseSelectedGroupSchema = z.array(z.string().min(1).max(500)).min(1).max(200);
export const reverseCycleIdSchema = z.object({ id: z.string().uuid(), version: z.number().int().positive() });
export const reverseQuantitiesSchema = reverseCycleIdSchema.extend({
  items: z.array(z.object({
    codigo: z.string().trim().min(1).max(100),
    quantidade: z.number().int().min(0).max(10000000),
  })).max(25000),
});
export const reverseFinishSchema = reverseCycleIdSchema.extend({
  supplier: z.string().trim().min(2, "Informe o fornecedor.").max(180),
});
export const reverseTreatmentSchema = reverseCycleIdSchema.extend({
  nfd: z.string().trim().min(1, "Informe o número de NFD.").max(80),
  treatmentStatus: z.enum(["aguardando_coleta", "coletado", "devolvido"]),
  returnMode: z.enum(["abatimento_boleto", "devolucao_material"]).optional(),
  returnNfe: z.string().trim().max(80).optional(),
}).superRefine((v, ctx) => {
  if (v.treatmentStatus === "devolvido" && !v.returnMode)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["returnMode"], message: "Escolha como foi realizada a devolução." });
  if (v.treatmentStatus === "devolvido" && v.returnMode === "devolucao_material" && !v.returnNfe?.trim())
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["returnNfe"], message: "Informe a NF-e de retorno de remessa." });
});

/** Uma seleção combina linha + grupo. O servidor revalida o catálogo antes de criar. */
export function reverseGroupKey(record: Pick<EnderecoRecord, "linha" | "grupo">): string {
  return JSON.stringify([record.linha?.trim() || "Sem linha", record.grupo?.trim() || "Sem grupo"]);
}
export function reverseGroups(base: EnderecoBase): Array<{ key: string; linha: string; grupo: string; count: number }> {
  const result = new Map<string, { key: string; linha: string; grupo: string; count: number }>();
  for (const r of Object.values(base.registros ?? {})) {
    if (!r.codigo?.trim() || !r.descricao?.trim()) continue;
    const key = reverseGroupKey(r);
    const prev = result.get(key);
    if (prev) prev.count++;
    else result.set(key, { key, linha: r.linha?.trim() || "Sem linha", grupo: r.grupo?.trim() || "Sem grupo", count: 1 });
  }
  return [...result.values()].sort((a,b) => a.linha.localeCompare(b.linha, "pt-BR", {numeric:true})
    || a.grupo.localeCompare(b.grupo, "pt-BR", {numeric:true}));
}
/** Um único índice de pesquisa para todos os grupos, criado apenas quando
 * o relatório base muda. Evita percorrer todos os produtos para CADA grupo
 * e para CADA caractere digitado no campo de pesquisa. */
export function reverseGroupSearchIndex(base: EnderecoBase): ReadonlyMap<string, string> {
  const parts = new Map<string, string[]>();
  for (const record of Object.values(base.registros ?? {})) {
    if (!record.codigo?.trim() || !record.descricao?.trim()) continue;
    const key = reverseGroupKey(record);
    let entries = parts.get(key);
    if (!entries) {
      entries = [reverseNormalizeSearch((record.linha?.trim() || "Sem linha") + " " +
        (record.grupo?.trim() || "Sem grupo"))];
      parts.set(key, entries);
    }
    entries.push(reverseNormalizeSearch(record.codigo + " " + record.descricao));
  }
  return new Map([...parts].map(([key, entries]) => [key, entries.join(" ")]));
}

/** Pesquisa linear SOMENTE nos grupos já indexados; cria até limit
 * elementos de interface e informa o total para paginação incremental. */
export function reverseSearchGroups(
  groups: ReturnType<typeof reverseGroups>,
  index: ReadonlyMap<string, string>,
  rawQuery: string,
  limit = 80,
): { visible: ReturnType<typeof reverseGroups>; total: number } {
  const query = reverseNormalizeSearch(rawQuery);
  const visible: ReturnType<typeof reverseGroups> = [];
  let total = 0;
  for (const group of groups) {
    if (query && !(index.get(group.key) ??
      reverseNormalizeSearch(group.linha + " " + group.grupo)).includes(query)) continue;
    total++;
    if (visible.length < limit) visible.push(group);
  }
  return { visible, total };
}

export function reverseItemsForGroups(base: EnderecoBase, groups: string[]): ReverseItem[] {
  const keys = new Set(groups);
  const byCode = new Map<string, ReverseItem>();
  for (const r of Object.values(base.registros ?? {})) {
    if (!keys.has(reverseGroupKey(r)) || !r.codigo?.trim() || !r.descricao?.trim()) continue;
    if (!byCode.has(r.codigo)) byCode.set(r.codigo, {
      codigo:r.codigo, descricao:r.descricao, linha:r.linha?.trim() || "Sem linha",
      grupo:r.grupo?.trim() || "Sem grupo", quantidade:0,
    });
  }
  return [...byCode.values()].sort((a,b)=>a.linha.localeCompare(b.linha, "pt-BR", {numeric:true})
    || a.grupo.localeCompare(b.grupo,"pt-BR",{numeric:true}) || a.codigo.localeCompare(b.codigo,"pt-BR",{numeric:true}));
}
export function reverseIncluded(items: ReverseItem[]) { return items.filter(i=>i.quantidade>0); }
export function reverseTotal(items: ReverseItem[]) { return reverseIncluded(items).reduce((sum,i)=>sum+i.quantidade,0); }
export function reverseStatusLabel(c:ReverseCycle):string {
  const phase=reverseWorkflowStage(c);
  if(phase==="em_contagem")return "Em contagem";
  if(phase==="em_tratativa")return "Em tratativas";
  if(phase==="aguardando_coleta")return "Aguardando coleta";
  if(phase==="coletado")return "Coletado";
  if(c.returnMode==="abatimento_boleto")return "Finalizado (Abatimento)";
  if(c.returnMode==="devolucao_material")return "Finalizado (Material novo)";
  return "Finalizado";
}
export function reverseNormalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
}
export function reverseCsv(c: ReverseCycle) {
  const rows = [["Código","Descrição","Linha","Grupo","Quantidade"],
    ...reverseIncluded(c.items).map(i=>[i.codigo,i.descricao,i.linha,i.grupo,String(i.quantidade)])];
  const escape = (value:string) => '"' + value.replace(/"/g,'""') + '"';
  return "\uFEFF" + rows.map(r=>r.map(escape).join(";")).join("\r\n");
}
