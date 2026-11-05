import {describe,expect,test} from "bun:test";
import {filterReverseCycles,reverseCycleSummary,reverseCycleAmounts} from "./reverse-logistics-view";
const cycle=(number,extras={})=>({
  id:String(number),number,status:"finalizado",treatmentStatus:"aguardando_coleta",
  createdAt:"2026-11-04T12:00:00Z",supplier:"HDL",brand:"MAKITA",
  groups:["GRUPO 1"],nfd:"123456",items:[{codigo:"03110",descricao:"Furadeira",quantidade:2}],
  ...extras,
});
describe("painel clean da Logistica Reversa",()=>{
  const data=[
    cycle(17),
    cycle(16,{supplier:"KIAN",brand:"TIGRE",treatmentStatus:"coletado",createdAt:"2026-10-01T12:00:00Z"}),
    cycle(15,{supplier:"HDL",brand:"ADELBRAS",treatmentStatus:"resolvido",returnMode:"abatimento_boleto"}),
    cycle(14,{status:"aberto",treatmentStatus:undefined}),
  ];
  const filters={query:"",status:"all",supplier:"all",period:"all"};
  test("KPIs sao do status real, nao dos numeros da imagem",()=>{
    expect(reverseCycleSummary(data)).toEqual({total:4,active:3,resolved:1,awaiting:1});
  });
  test("filtro de marca, fornecedor, item e codigo do ciclo",()=>{
    expect(filterReverseCycles(data,{...filters,query:"MAKITA"}).map(c=>c.number)).toEqual([17]);
    expect(filterReverseCycles(data,{...filters,query:"03110"})).toHaveLength(4);
    expect(filterReverseCycles(data,{...filters,query:"17"}).map(c=>c.number)).toEqual([17]);
    expect(filterReverseCycles(data,{...filters,supplier:"KIAN"}).map(c=>c.number)).toEqual([16]);
  });
  test("filtros de etapas funcionam para etapas antigas e novas",()=>{
    expect(filterReverseCycles(data,{...filters,status:"aguardando_coleta"})).toHaveLength(1);
    expect(filterReverseCycles(data,{...filters,status:"em_contagem"})).toHaveLength(1);
    expect(filterReverseCycles(data,{...filters,status:"resolvido"})).toHaveLength(1);
  });
  test("filtro de periodo e quantidades",()=>{
    expect(filterReverseCycles(data,{...filters,period:"7"},new Date("2026-11-05T12:00:00Z"))).toHaveLength(3);
    expect(reverseCycleAmounts(data[0])).toEqual({codes:1,units:2});
  });
});
