import { z } from "zod";
import type { EnderecoBase, EnderecoRecord } from "./types";

export type ReverseStage = "aguardando_coleta" | "coletado" | "devolvido";
export type ReverseReturnMode = "abatimento_boleto" | "devolucao_material";
export type ReverseItem = {
  codigo: string; descricao: string; linha: string; grupo: string; quantidade: number;
};
export type ReverseCycle = {
  id: string; number: number; version: number; createdAt: string; updatedAt: string;
  groups: string[]; items: ReverseItem[]; status: "aberto" | "finalizado";
  supplier?: string; finishedAt?: string;
  treatmentStatus?: ReverseStage; nfd?: string;
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
export const reverseStatusLabel = (c: ReverseCycle) => c.status === "aberto" ? "Em contagem" :
  c.treatmentStatus === "coletado" ? "Coletado" : c.treatmentStatus === "devolvido" ? "Devolvido" : "Aguardando coleta";
export function reverseNormalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
}
export function reverseCsv(c: ReverseCycle) {
  const rows = [["Código","Descrição","Linha","Grupo","Quantidade"],
    ...reverseIncluded(c.items).map(i=>[i.codigo,i.descricao,i.linha,i.grupo,String(i.quantidade)])];
  const escape = (value:string) => '"' + value.replace(/"/g,'""') + '"';
  return "\uFEFF" + rows.map(r=>r.map(escape).join(";")).join("\r\n");
}
