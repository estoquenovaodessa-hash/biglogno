import { describe, expect, test } from "bun:test";
import { deliveryGroups } from "./deliveries";
import { individualGroupingChanges } from "./delivery-grouping";

const row = (id, extra = {}) => ({
  id, position: 1, createdAt: "2026-11-10T12:00:00Z", document: id,
  company: "OFICINA A", companyCode: "123", source: "conferencia",
  value: 50, status: "nao_iniciada", expeditionVehicle: "moto", ...extra,
});
const apply = (all, changes) => all.map(item => changes.find(row => row.id === item.id) ?? item);

describe("Unificar e desunificar cada pedido, somente pela Expedição", () => {
  test("unifica duas notas escolhidas, sem incluir uma terceira automaticamente", () => {
    const all = [row("1"), row("2"), row("3")];
    const changes = individualGroupingChanges(all, { action: "group_one", id: "1", targetId: "2" }, () => "grupo-1");
    const next = apply(all, changes);
    expect(changes.map(item => item.id)).toEqual(["1", "2"]);
    expect(deliveryGroups(next).map(group => group.map(item => item.id))).toEqual([["1","2"],["3"]]);
  });

  test("acrescenta só uma nota a grupo já existente e preserva a mesma assinatura", () => {
    const all = [row("1", {deliveryGroupId:"grupo-a"}), row("2", {deliveryGroupId:"grupo-a"}), row("3")];
    const changes = individualGroupingChanges(all, { action: "group_one", id: "3", targetId: "1" });
    expect(changes.map(item => item.id)).toEqual(["3"]);
    expect(changes[0].deliveryGroupId).toBe("grupo-a");
    expect(deliveryGroups(apply(all, changes))).toHaveLength(1);
  });

  test("desunifica somente uma nota entre três, mantendo as outras duas juntas", () => {
    const all = ["1","2","3"].map(id => row(id, {deliveryGroupId:"grupo-a"}));
    const changes = individualGroupingChanges(all, { action: "ungroup_one", id: "2" });
    expect(changes.map(item => item.id)).toEqual(["2"]);
    expect(deliveryGroups(apply(all, changes)).map(group => group.map(item => item.id)))
      .toEqual([["1","3"],["2"]]);
  });

  test("ao desunificar dupla, ambas voltam a ser individuais", () => {
    const all = [row("1",{deliveryGroupId:"g"}),row("2",{deliveryGroupId:"g"})];
    const next = apply(all, individualGroupingChanges(all,{action:"ungroup_one",id:"1"}));
    expect(next.every(item => !item.deliveryGroupId)).toBe(true);
    expect(deliveryGroups(next)).toHaveLength(2);
  });

  test("permite re-unificar nota separada pelo fluxo antigo", () => {
    const all=[row("1",{separate:true}),row("2",{separate:true})];
    const changes=individualGroupingChanges(all,{action:"group_one",id:"1",targetId:"2"},()=>"g");
    expect(changes.every(item=>item.separate===undefined && item.deliveryGroupId==="g")).toBe(true);
    expect(deliveryGroups(apply(all,changes))).toHaveLength(1);
  });
  test("bloqueia clientes ou veículos diferentes, consumidor e notas concluídas", () => {
    expect(() => individualGroupingChanges([row("1"),row("2",{companyCode:"456"})],
      {action:"group_one",id:"1",targetId:"2"})).toThrow(/mesmo cliente/);
    expect(() => individualGroupingChanges([row("1"),row("2",{expeditionVehicle:"carro"})],
      {action:"group_one",id:"1",targetId:"2"})).toThrow(/mesmo cliente e veículo/);
    expect(() => individualGroupingChanges([row("1",{companyCode:"100"}),row("2")],
      {action:"group_one",id:"1",targetId:"2"})).toThrow(/CONSUMIDOR/);
    expect(() => individualGroupingChanges([row("1",{status:"finalizada"}),row("2")],
      {action:"group_one",id:"1",targetId:"2"})).toThrow(/pendentes/);
  });

  test("bloqueia alterações em grupos cuja entrega já foi concluída", () => {
    const all=[row("1",{deliveryGroupId:"g"}),row("2",{deliveryGroupId:"g",status:"finalizada"})];
    expect(() => individualGroupingChanges(all,{action:"ungroup_one",id:"1"}))
      .toThrow(/movimentado ou concluído/);
  });
});
