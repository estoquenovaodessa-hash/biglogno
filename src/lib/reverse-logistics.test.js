import {describe,expect,test} from "bun:test";
import {reverseGroups,reverseItemsForGroups,reverseIncluded,reverseTotal,reverseCsv,
  reverseTreatmentSchema,reverseNormalizeSearch} from "./reverse-logistics";
const base={registros:{
  a:{codigo:"00001",descricao:"Chave",linha:"LUKMA",grupo:"A"},
  b:{codigo:"00002",descricao:"Furadeira",linha:"LUKMA",grupo:"A"},
  c:{codigo:"00003",descricao:"Martelo",linha:"BOSCH",grupo:"B"},
  d:{codigo:"00004",descricao:"Alicate",linha:"LUKMA",grupo:"B"},
},atualizadoEm:"2026-10-30T00:00:00Z"};
describe("logística reversa",()=>{
  test("seleciona vários grupos separados por linha e grupo",()=>{
    const opts=reverseGroups(base);
    expect(opts).toHaveLength(3);
    const selected=opts.filter(g=>g.linha==="LUKMA").map(g=>g.key);
    const items=reverseItemsForGroups(base,selected);
    expect(items.map(i=>i.codigo)).toEqual(["00001","00002","00004"]);
    expect(items.every(i=>i.quantidade===0)).toBe(true);
  });
  test("sem quantidade não aparece no relatório",()=>{
    const opts=reverseGroups(base);
    const items=reverseItemsForGroups(base,opts.map(o=>o.key));
    const list=items.map(i=>({...i,quantidade:i.codigo==="00002"?3:0}));
    expect(reverseIncluded(list).map(i=>i.codigo)).toEqual(["00002"]);
    expect(reverseTotal(list)).toBe(3);
    const csv=reverseCsv({items:list});
    expect(csv).toContain("00002");expect(csv).not.toContain("00001");
    expect(csv).not.toContain("00004");
  });
  test("devolvido exige modalidade e NF-e somente em material",()=>{
    const base={id:"8f527cb0-cee1-4f2e-8ebd-3bab52896c8a",version:1,nfd:"123",treatmentStatus:"devolvido"};
    expect(reverseTreatmentSchema.safeParse(base).success).toBe(false);
    expect(reverseTreatmentSchema.safeParse({...base,returnMode:"devolucao_material"}).success).toBe(false);
    expect(reverseTreatmentSchema.safeParse({...base,returnMode:"devolucao_material",returnNfe:"NF-77"}).success).toBe(true);
    expect(reverseTreatmentSchema.safeParse({...base,returnMode:"abatimento_boleto"}).success).toBe(true);
    expect(reverseTreatmentSchema.safeParse({...base,treatmentStatus:"coletado"}).success).toBe(true);
  });
  test("pesquisa ignora acentos e caixa",()=>expect(reverseNormalizeSearch("  LÍNHA  ")).toBe("linha"));
});
