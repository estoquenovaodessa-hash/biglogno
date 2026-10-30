import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EnderecoBase } from "./types";
import {
  reverseSelectedGroupSchema, reverseCycleIdSchema, reverseQuantitiesSchema,
  reverseFinishSchema, reverseTreatmentSchema, reverseGroups,
  reverseItemsForGroups, reverseIncluded, type ReverseCycle,
} from "./reverse-logistics";

/** Tabela isolada com RLS ativo e acesso exclusivo a funções autenticadas. */
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function access(write = false) {
  const { requireAccess } = await import("./access.server");
  const role = await requireAccess();
  if (write && role !== "operador") throw new Error("Somente o operador pode movimentar a Logística Reversa.");
  return role;
}
async function loadBase(): Promise<EnderecoBase> {
  const { data, error } = await (await db()).from("app_state")
    .select("value").eq("key","endereco-base").maybeSingle();
  if (error) throw new Error("Não foi possível consultar a base de endereços.");
  const value = data?.value as unknown as EnderecoBase | undefined;
  if (!value || !value.registros || typeof value.registros !== "object")
    throw new Error("Importe o mesmo relatório de endereços usado na Contagem antes de abrir um ciclo.");
  return value;
}
type ReverseDbRow = { id:string; number:number; version:number; created_at:string; updated_at:string; payload:unknown };
const asCycle = (r: ReverseDbRow): ReverseCycle => ({
  ...(r.payload as Omit<ReverseCycle,"id"|"number"|"version"|"createdAt"|"updatedAt">),
  id:r.id, number:r.number, version:r.version, createdAt:r.created_at, updatedAt:r.updated_at,
});
const payload = (c: ReverseCycle): object => {
  const {id:_id,number:_n,version:_v,createdAt:_c,updatedAt:_u,...rest}=c;
  return rest;
};
const TABLE = "reverse_logistics_cycles" as "deliveries"; // Tabela criada na migração; tipos gerados do Supabase serão regenerados depois.

/** Consulta para gestor e operador. Não inventa ciclos quando a tabela não existe. */
export const listReverseCycles = createServerFn({method:"GET"}).handler(async () => {
  await access();
  const records: ReverseCycle[] = [];
  const database = await db();
  for (let offset=0; ;offset+=500) {
    const {data,error} = await database.from(TABLE)
      .select("id,number,version,created_at,updated_at,payload").order("number",{ascending:false})
      .range(offset,offset+499);
    if (error) throw new Error("Logística Reversa indisponível. Instale o SQL do módulo no Supabase.");
    const page = (data ?? []) as unknown as ReverseDbRow[];
    records.push(...page.map(asCycle));
    if (page.length<500) break;
  }
  return records;
});
export const listReverseGroups = createServerFn({method:"GET"}).handler(async () => {
  await access(true);
  return reverseGroups(await loadBase());
});
export const createReverseCycle = createServerFn({method:"POST"})
  .inputValidator(z.object({groups:reverseSelectedGroupSchema})).handler(async ({data}) => {
    await access(true);
    if (new Set(data.groups).size !== data.groups.length) throw new Error("Há grupos repetidos.");
    const base = await loadBase();
    const available = new Set(reverseGroups(base).map(g=>g.key));
    if (data.groups.some(key=>!available.has(key))) throw new Error("Um dos grupos selecionados não existe mais. Atualize a seleção.");
    const items = reverseItemsForGroups(base,data.groups);
    if (!items.length) throw new Error("Nenhum item foi localizado nos grupos selecionados.");
    if (items.length>25000) throw new Error("Selecione menos grupos por ciclo (limite de 25.000 itens).");
    const {data:row,error} = await (await db()).from(TABLE)
      .insert({payload:{status:"aberto",groups:data.groups,items}} as never)
      .select("id,number,version,created_at,updated_at,payload").single();
    if (error || !row) throw new Error("Não foi possível abrir o ciclo. Verifique a instalação do SQL.");
    return asCycle(row as unknown as ReverseDbRow);
  });
async function loadOne(id:string): Promise<ReverseCycle> {
  const {data,error} = await (await db()).from(TABLE)
    .select("id,number,version,created_at,updated_at,payload").eq("id",id).maybeSingle();
  if (error || !data) throw new Error("Ciclo não encontrado. Atualize a tela.");
  return asCycle(data as unknown as ReverseDbRow);
}
/** Controle de versão evita que duas pessoas sobrescrevam o mesmo ciclo. */
async function persist(cycle:ReverseCycle, previous:number) {
  const {data,error} = await (await db()).from(TABLE)
    .update({payload:payload(cycle),version:previous+1,updated_at:new Date().toISOString()} as never)
    .eq("id",cycle.id).eq("version",previous)
    .select("id,number,version,created_at,updated_at,payload").maybeSingle();
  if (error) throw new Error("Não foi possível gravar o ciclo.");
  if (!data) throw new Error("O ciclo foi atualizado por outra pessoa. Recarregue e aplique novamente suas alterações.");
  return asCycle(data as unknown as ReverseDbRow);
}
export const saveReverseQuantities = createServerFn({method:"POST"}).inputValidator(reverseQuantitiesSchema)
  .handler(async ({data})=>{
    await access(true);
    const current=await loadOne(data.id);
    if (current.version!==data.version) throw new Error("O ciclo mudou. Atualize para evitar sobrescrever a outra edição.");
    const quantities=new Map(data.items.map(i=>[i.codigo,i.quantidade]));
    if (quantities.size!==data.items.length) throw new Error("Códigos repetidos.");
    const known=new Set(current.items.map(i=>i.codigo));
    if (data.items.some(i=>!known.has(i.codigo))) throw new Error("Foi informado um código que não pertence ao ciclo.");
    const next={...current,items:current.items.map(i=>({...i,quantidade:quantities.get(i.codigo)??0}))};
    return persist(next,data.version);
  });
export const finishReverseCycle = createServerFn({method:"POST"}).inputValidator(reverseFinishSchema)
  .handler(async ({data})=>{
    await access(true);
    const current=await loadOne(data.id);
    if (current.version!==data.version) throw new Error("O ciclo foi alterado. Atualize antes de finalizar.");
    if (current.status!=="aberto") throw new Error("O ciclo já foi finalizado.");
    if (!reverseIncluded(current.items).length) throw new Error("Adicione quantidade a pelo menos um item antes de finalizar.");
    return persist({...current,status:"finalizado",supplier:data.supplier,finishedAt:new Date().toISOString(),
      treatmentStatus:"aguardando_coleta",statusChangedAt:new Date().toISOString()},data.version);
  });
export const saveReverseTreatment = createServerFn({method:"POST"}).inputValidator(reverseTreatmentSchema)
  .handler(async ({data})=>{
    await access(true);
    const current=await loadOne(data.id);
    if (current.version!==data.version) throw new Error("O ciclo mudou. Atualize para informar as tratativas.");
    if (current.status!=="finalizado") throw new Error("Finalize o ciclo e informe o fornecedor antes das tratativas.");
    const now=new Date().toISOString();
    return persist({...current,nfd:data.nfd,treatmentStatus:data.treatmentStatus,
      returnMode:data.treatmentStatus==="devolvido"?data.returnMode:undefined,
      returnNfe:data.treatmentStatus==="devolvido"&&data.returnMode==="devolucao_material"?data.returnNfe:undefined,
      statusChangedAt:current.treatmentStatus===data.treatmentStatus?current.statusChangedAt:now},data.version);
  });
export const deleteReverseCycle = createServerFn({method:"POST"}).inputValidator(reverseCycleIdSchema)
  .handler(async ({data})=>{
    await access(true);
    const {data:removed,error}=await (await db()).from(TABLE).delete().eq("id",data.id).eq("version",data.version)
      .select("id").maybeSingle();
    if (error) throw new Error("Não foi possível excluir o ciclo.");
    if (!removed) throw new Error("O ciclo mudou ou já foi removido. Atualize a tela.");
    return {ok:true};
  });
