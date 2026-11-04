import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EnderecoBase } from "./types";
import {
  reverseSelectedGroupSchema, reverseCycleIdSchema, reverseQuantitiesSchema,
  reverseFinishSchema, reverseTreatmentSchema, reverseGroups,
  reverseItemsForGroups, reverseIncluded, reverseCreateSchema,
  reverseSupplierSaveSchema, reverseCycleSupplierSchema,
  reverseContactProgressSchema, reverseStageChangeSchema,
  allReverseContactStepsDone, reverseWorkflowStage, type ReverseCycle, type ReverseSupplier,
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

const SUPPLIER_TABLE = "reverse_logistics_suppliers" as "deliveries";

/** Cadastro compartilhado. O gestor acompanha, o operador pode cadastrar/editar.
 * O snapshot (nome e marca) permanece no ciclo após alterações no fornecedor. */
type SupplierRow={id:string;name:string;brands:string[];contact_name:string;phone:string;email:string;cnpj:string;version:number;created_at:string;updated_at:string};
const asSupplier=(r:SupplierRow):ReverseSupplier=>({
  id:r.id,name:r.name,brands:r.brands,contactName:r.contact_name,
  phone:r.phone,email:r.email,cnpj:r.cnpj,version:r.version,
  createdAt:r.created_at,updatedAt:r.updated_at,
});
async function getSupplier(id:string):Promise<ReverseSupplier>{
  const {data,error}=await (await db()).from(SUPPLIER_TABLE)
    .select("id,name,brands,contact_name,phone,email,cnpj,version,created_at,updated_at")
    .eq("id",id).maybeSingle();
  if(error||!data)throw new Error("Fornecedor não encontrado. Atualize o cadastro e tente novamente.");
  return asSupplier(data as unknown as SupplierRow);
}
async function supplierForBrand(id:string,brand:string){
  const supplier=await getSupplier(id);
  const matched=supplier.brands.find(v=>v.toLocaleUpperCase("pt-BR")===brand.trim().toLocaleUpperCase("pt-BR"));
  if(!matched)throw new Error("Esta marca não pertence ao fornecedor selecionado.");
  return {supplier,brand:matched};
}

export const listReverseSuppliers=createServerFn({method:"GET"}).handler(async()=>{
  await access();
  const all:ReverseSupplier[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await (await db()).from(SUPPLIER_TABLE)
      .select("id,name,brands,contact_name,phone,email,cnpj,version,created_at,updated_at")
      .order("name",{ascending:true}).range(offset,offset+499);
    if(error)throw new Error("O cadastro de fornecedores não está instalado. Execute o SQL da nova Logística Reversa no Supabase.");
    const page=(data??[]) as unknown as SupplierRow[];
    all.push(...page.map(asSupplier));if(page.length<500)break;
  }
  return all;
});
export const saveReverseSupplier=createServerFn({method:"POST"})
  .inputValidator(reverseSupplierSaveSchema).handler(async({data})=>{
    await access(true);
    const values={name:data.name,brands:data.brands,contact_name:data.contactName??"",
      email:data.email??"",phone:data.phone??"",cnpj:data.cnpj??""};
    if(data.id){
      if(!data.version)throw new Error("Atualize o cadastro antes de editar.");
      const {data:saved,error}=await (await db()).from(SUPPLIER_TABLE)
        .update({...values,version:data.version+1,updated_at:new Date().toISOString()} as never)
        .eq("id",data.id).eq("version",data.version)
        .select("id,name,brands,contact_name,phone,email,cnpj,version,created_at,updated_at").maybeSingle();
      if(error)throw new Error(error.code==="23505"?"Já existe fornecedor com este nome.":"Não foi possível atualizar o fornecedor.");
      if(!saved)throw new Error("O fornecedor foi editado por outra pessoa. Atualize e tente novamente.");
      return asSupplier(saved as unknown as SupplierRow);
    }
    const {data:saved,error}=await (await db()).from(SUPPLIER_TABLE)
      .insert(values as never)
      .select("id,name,brands,contact_name,phone,email,cnpj,version,created_at,updated_at").single();
    if(error||!saved)throw new Error(error?.code==="23505"?"Já existe fornecedor com este nome.":"Não foi possível cadastrar o fornecedor.");
    return asSupplier(saved as unknown as SupplierRow);
  });

/** Pode atualizar o fornecedor do ciclo após o cadastro sem reiniciar a contagem. */
export const assignReverseSupplier=createServerFn({method:"POST"})
  .inputValidator(reverseCycleIdSchema.merge(reverseCycleSupplierSchema))
  .handler(async({data})=>{
    await access(true);
    const c=await loadOne(data.id);
    if(c.version!==data.version)throw new Error("O ciclo mudou. Atualize e tente novamente.");
    // A correção do fornecedor e da marca permanece disponível inclusive após
    // a resolução; o status e o histórico do ciclo não são modificados.
    const selected=await supplierForBrand(data.supplierId,data.brand);
    return persist({...c,supplierId:selected.supplier.id,supplier:selected.supplier.name,
      brand:selected.brand},data.version);
  });

/** Mural interativo: cada passo é validado e o avanço fica bloqueado no servidor. */
export const saveReverseContactProgress=createServerFn({method:"POST"})
  .inputValidator(reverseContactProgressSchema).handler(async({data})=>{
    await access(true);
    const c=await loadOne(data.id);
    if(c.version!==data.version)throw new Error("A tratativa foi atualizada por outra pessoa.");
    if(reverseWorkflowStage(c)!=="em_tratativa")throw new Error("O contato com fornecedor já passou desta etapa.");
    return persist({...c,contactSteps:data.steps,contactStartedAt:c.contactStartedAt??new Date().toISOString()},data.version);
  });

/** Transições auditáveis, sem atalhos para pular as etapas obrigatórias. */
export const updateReverseStage=createServerFn({method:"POST"})
  .inputValidator(reverseStageChangeSchema).handler(async({data})=>{
    await access(true);
    const c=await loadOne(data.id);
    if(c.version!==data.version)throw new Error("O ciclo foi alterado. Recarregue antes de mudar o status.");
    const current=reverseWorkflowStage(c);
    const now=new Date().toISOString();
    if(!c.supplierId||!c.brand)throw new Error("Selecione o fornecedor e uma marca antes de continuar.");
    if(data.status==="aguardando_coleta"){
      if(current!=="em_tratativa" && current!=="aguardando_coleta")
        throw new Error("Aguardar coleta exige a conclusão do contato com o fornecedor.");
      if(!allReverseContactStepsDone(c.contactSteps))
        throw new Error("Conclua os quatro passos de contato antes de avançar.");
      if(!data.nfd?.trim()||!data.volumes)
        throw new Error("Informe o número da NF de devolução e a quantidade de volumes.");
      return persist({...c,treatmentStatus:"aguardando_coleta",nfd:data.nfd.trim(),
        volumes:data.volumes,statusChangedAt:current===data.status?c.statusChangedAt:now},data.version);
    }
    if(data.status==="coletado"){
      if(current!=="aguardando_coleta" && current!=="coletado")
        throw new Error("O material precisa estar aguardando coleta antes de ser marcado como coletado.");
      if(!c.nfd||!c.volumes)throw new Error("Registre NF de devolução e volumes antes de confirmar a coleta.");
      return persist({...c,treatmentStatus:"coletado",
        statusChangedAt:current==="coletado"?c.statusChangedAt:now},data.version);
    }
    if(current!=="coletado" && current!=="resolvido")
      throw new Error("Marque como coletado antes de finalizar a tratativa.");
    if(!data.returnMode)throw new Error("Informe Abatimento ou Material novo.");
    if(data.returnMode==="devolucao_material"&&!data.returnNfe?.trim())
      throw new Error("Informe a NF-e de Retorno de Remessa para Material novo.");
    return persist({...c,treatmentStatus:"resolvido",returnMode:data.returnMode,
      returnNfe:data.returnMode==="devolucao_material"?data.returnNfe?.trim():undefined,
      statusChangedAt:current==="resolvido"?c.statusChangedAt:now},data.version);
  });

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
  .inputValidator(reverseCreateSchema).handler(async ({data}) => {
    await access(true);
    if (new Set(data.groups).size !== data.groups.length) throw new Error("Há grupos repetidos.");
    const base = await loadBase();
    const available = new Set(reverseGroups(base).map(g=>g.key));
    if (data.groups.some(key=>!available.has(key))) throw new Error("Um dos grupos selecionados não existe mais. Atualize a seleção.");
    const selected=await supplierForBrand(data.supplierId,data.brand);
    const items = reverseItemsForGroups(base,data.groups);
    if (!items.length) throw new Error("Nenhum item foi localizado nos grupos selecionados.");
    if (items.length>25000) throw new Error("Selecione menos grupos por ciclo (limite de 25.000 itens).");
    const {data:row,error} = await (await db()).from(TABLE)
      .insert({payload:{status:"aberto",groups:data.groups,items,
        supplierId:selected.supplier.id,supplier:selected.supplier.name,brand:selected.brand}} as never)
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
    if (current.status==="finalizado" && !reverseIncluded(next.items).length) throw new Error("Um ciclo finalizado precisa ter ao menos um item com quantidade.");
    return persist(next,data.version);
  });
export const finishReverseCycle = createServerFn({method:"POST"}).inputValidator(reverseFinishSchema)
  .handler(async ({data})=>{
    await access(true);
    const current=await loadOne(data.id);
    if (current.version!==data.version) throw new Error("O ciclo foi alterado. Atualize antes de finalizar.");
    if (current.status!=="aberto") throw new Error("O ciclo já foi finalizado.");
    if (!reverseIncluded(current.items).length) throw new Error("Adicione quantidade a pelo menos um item antes de finalizar.");
    if(!current.supplierId||!current.brand)throw new Error("Selecione o fornecedor e a marca antes de finalizar a contagem.");
    return persist({...current,status:"finalizado",supplier:current.supplier,finishedAt:new Date().toISOString(),
      treatmentStatus:"em_tratativa",statusChangedAt:new Date().toISOString()},data.version);
  });
export const renameReverseSupplier = createServerFn({method:"POST"}).inputValidator(reverseFinishSchema)
  .handler(async ({data})=>{
    await access(true);
    const current=await loadOne(data.id);
    if (current.version!==data.version) throw new Error("O ciclo foi alterado. Atualize antes de editar o fornecedor.");
    if (current.status!=="finalizado") throw new Error("Finalize o ciclo antes de editar o fornecedor.");
    return persist({...current,supplier:data.supplier},data.version);
  });
export const saveReverseTreatment = createServerFn({method:"POST"}).inputValidator(reverseTreatmentSchema)
  .handler(async ({data})=>{
    await access(true);
    throw new Error("Use o guia de tratativas com confirmação das etapas. Atualize o BigLogno.");
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
