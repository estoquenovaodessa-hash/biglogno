import { describe, expect, test } from "bun:test";
import {
  conferenceLabelKind, eligibleConferenceLabelRecords, conferenceLabelsForDay,
  filterConferenceLabelRecords,
} from "./conference-label-selection";
const record=(id, properties={})=>({
  id,requestId:"00000000-0000-4000-8000-"+id.padStart(12,"0"),
  createdAt:"2026-11-04T14:00:00Z",
  verifierCode:"101", verifierName:"Marcos",clientCode:"123",
  clientName:"Cliente Bignotto",document:String(12000+Number(id)),items:3,
  correct:true,value:20,seller:"Carlos",durationSeconds:80,...properties,
});
describe("seleção de etiquetas de Conferência",()=>{
  test("só Entrega e Retira explícitas; nenhuma etiqueta de somente Conferência ou CSV",()=>{
    const records=[
      record("1",{balcaoDestination:"entrega"}),
      record("2",{balcaoDestination:"retira"}),
      record("3",{}),
      record("4",{source:"csv",balcaoDestination:"entrega"}),
      record("5",{verifierCode:"102",forDelivery:true}),
      record("6",{verifierCode:"102",forDelivery:false}),
      record("7",{verifierCode:"101",forDelivery:true}), // Balcão sem destino não é entrega
    ];
    expect(records.map(conferenceLabelKind)).toEqual(["entrega","retira",null,null,"entrega","retira",null]);
    expect(eligibleConferenceLabelRecords(records).map(r=>r.id)).toEqual(["1","2","5","6"]);
  });
  test("dia de São Paulo não é dia UTC: fronteira 00h de Brasília",()=>{
    const records=[
      record("1",{balcaoDestination:"entrega",createdAt:"2026-11-05T02:59:59Z"}),
      record("2",{balcaoDestination:"retira",createdAt:"2026-11-05T03:00:00Z"}),
      record("3",{createdAt:"2026-11-04T12:00:00Z"}),
    ];
    expect(conferenceLabelsForDay(records,"2026-11-04").map(r=>r.id)).toEqual(["1"]);
    expect(conferenceLabelsForDay(records,"2026-11-05").map(r=>r.id)).toEqual(["2"]);
  });
  test("busca de outros dias por cliente/código e filtro de tipo",()=>{
    const rows=[
      record("1",{balcaoDestination:"entrega",createdAt:"2026-10-29T18:30:00Z",clientName:"São Martelo"}),
      record("2",{balcaoDestination:"retira",createdAt:"2026-10-30T13:00:00Z",document:"54501"}),
      record("3",{balcaoDestination:"entrega",createdAt:"2026-11-04T12:00:00Z"}),
    ];
    expect(filterConferenceLabelRecords(rows,{from:"2026-10-29",to:"2026-10-30"}).map(r=>r.id)).toEqual(["1","2"]);
    expect(filterConferenceLabelRecords(rows,{kind:"retira",query:"54501"}).map(r=>r.id)).toEqual(["2"]);
    expect(filterConferenceLabelRecords(rows,{query:"sao martelo"}).map(r=>r.id)).toEqual(["1"]);
    expect(filterConferenceLabelRecords(rows,{from:"2026-11-05"})).toHaveLength(0);
  });
});
