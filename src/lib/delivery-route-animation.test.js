import { describe, expect, test } from "bun:test";
import { progressiveRoadLine, routeAnimationResumeIndex, roadKmLabel, visibleAnimatedStopIndexes, destinationFirstName, routeStopPinType } from "./delivery-route-animation";

describe("animação da rota realizada", () => {
  const geometry = [[-22.78, -47.29], [-22.781, -47.29], [-22.782, -47.3]];

  test("desenha 0, parte e 100% da linha real sem mudar a ordem dos vértices", () => {
    expect(progressiveRoadLine(geometry, 0)).toEqual([geometry[0]]);
    expect(progressiveRoadLine(geometry, 1)).toEqual(geometry);
    const halfway = progressiveRoadLine(geometry, 0.5);
    expect(halfway[0]).toEqual(geometry[0]);
    expect(halfway[halfway.length - 1]).not.toEqual(geometry[2]);
    expect(halfway.length).toBeGreaterThanOrEqual(2);
  });
  test("não ultrapassa limites de progresso nem produz ponto fictício", () => {
    expect(progressiveRoadLine(geometry, -1)).toEqual([geometry[0]]);
    expect(progressiveRoadLine(geometry, 2)).toEqual(geometry);
    expect(progressiveRoadLine([], 0.5)).toEqual([]);
    expect(progressiveRoadLine([geometry[0]], 0.5)).toEqual([geometry[0]]);
  });
  test("na mesma rota, trecho novo prossegue após os já mostrados", () => {
    expect(routeAnimationResumeIndex("Luciano|dia|manha", "Luciano|dia|manha",
      ["loja-a", "a-b"], ["loja-a", "a-b", "b-c"], 2)).toBe(2);
    expect(routeAnimationResumeIndex("Luciano|dia|manha", "Luciano|dia|manha",
      ["loja-a", "a-b"], ["loja-a", "a-b", "b-c"], 1)).toBe(1);
  });
  test("mudanças no percurso ou seleção de turno recomeçam a sequência", () => {
    expect(routeAnimationResumeIndex("manha", "tarde", ["loja-a"], ["loja-a", "a-b"], 1)).toBe(0);
    expect(routeAnimationResumeIndex("manha", "manha", ["loja-a"], ["loja-z", "z-b"], 1)).toBe(0);
    expect(routeAnimationResumeIndex("manha", "manha", ["loja-a"], ["loja-a"], 1)).toBe(0);
  });
  test("o destino numerado aparece somente após a linha chegar", () => {
    const legs = [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }];
    expect(visibleAnimatedStopIndexes(legs, 0, null, 0)).toEqual([0]);
    expect(visibleAnimatedStopIndexes(legs, 0, 0, 0)).toEqual([0]);
    expect(visibleAnimatedStopIndexes(legs, 1, null, 0)).toEqual([0, 1]);
    expect(visibleAnimatedStopIndexes(legs, 1, 1, 0)).toEqual([0, 1]);
    expect(visibleAnimatedStopIndexes(legs, 2, null, 0)).toEqual([0, 1, 2]);
    expect(visibleAnimatedStopIndexes(legs, 3, null, 0)).toEqual([0, 1, 2, 3]);
    // Ao reiniciar, todos os destinos futuros voltam a ficar ocultos.
    expect(visibleAnimatedStopIndexes(legs, 0, null, 0)).toEqual([0]);
  });
  test("não antecipa destinos após uma lacuna de endereço", () => {
    const legs = [{ from: 0, to: 1 }, { from: 3, to: 4 }];
    expect(visibleAnimatedStopIndexes(legs, 1, null, 0)).toEqual([0, 1]);
    expect(visibleAnimatedStopIndexes(legs, 1, 1, 0)).toEqual([0, 1, 3]);
    expect(visibleAnimatedStopIndexes(legs, 2, null, 0)).toEqual([0, 1, 3, 4]);
  });
  test("funciona quando a rota não tem origem cadastrada", () => {
    const legs = [{ from: 2, to: 3 }];
    expect(visibleAnimatedStopIndexes(legs, 0, null, 2)).toEqual([2]);
    expect(visibleAnimatedStopIndexes(legs, 1, null, 2)).toEqual([2, 3]);
  });
  test("mostra somente o primeiro nome do destino sem modificar o nome original", () => {
    expect(destinationFirstName("  Maria   Oliveira   ")).toBe("Maria");
    expect(destinationFirstName("João de Souza")).toBe("João");
    expect(destinationFirstName("  ")).toBe("Destino");
    expect(destinationFirstName("MÁQUINAS & CIA")).toBe("MÁQUINAS");
    expect(destinationFirstName("<script> Injeção")).toBe("<script>");
  });
  test("origem verde, entrega azul e coleta laranja, inclusive após animar", () => {
    expect(routeStopPinType({ kind: "origin", deliveries: [] })).toBe("start");
    expect(routeStopPinType({ deliveries: [{ source: "conferencia" }] })).toBe("stop");
    expect(routeStopPinType({ deliveries: [{ source: "manual" }] })).toBe("stop");
    expect(routeStopPinType({ deliveries: [{ source: "coleta" }] })).toBe("collection");
    expect(routeStopPinType({ deliveries: [{ source: "manual" }, { source: "coleta" }] })).toBe("collection");
  });
  test("mostra KM viários com duas casas e não inventa valor para trecho indisponível", () => {
    expect(roadKmLabel(4250)).toBe("4,25 km");
    expect(roadKmLabel(100)).toBe("0,10 km");
    expect(roadKmLabel(null)).toBe("KM não disponível");
    expect(roadKmLabel(-50)).toBe("KM não disponível");
  });
});
