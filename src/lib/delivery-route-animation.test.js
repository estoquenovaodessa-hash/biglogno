import { describe, expect, test } from "bun:test";
import { progressiveRoadLine, routeAnimationResumeIndex, roadKmLabel } from "./delivery-route-animation";

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
  test("mostra KM viários com duas casas e não inventa valor para trecho indisponível", () => {
    expect(roadKmLabel(4250)).toBe("4,25 km");
    expect(roadKmLabel(100)).toBe("0,10 km");
    expect(roadKmLabel(null)).toBe("KM não disponível");
    expect(roadKmLabel(-50)).toBe("KM não disponível");
  });
});
