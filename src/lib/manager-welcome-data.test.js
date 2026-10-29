import { describe, expect, test } from "bun:test";
import { managerWelcomeSummary, managerWelcomeGreeting, welcomeChange, welcomeMotivation } from "./manager-welcome-data";
const d = (id, finishedAt, more = {}) => ({ id, source: "conferencia", status: "finalizada", finishedAt, ...more });
const c = createdAt => ({ createdAt });
const cy = (id, finalizadoEm, list, more = {}) => ({
  id, titulo: id, status: "finalizado", finalizadoEm, itens: list.map(diferenca => ({ diferenca })), ...more,
});
describe("boas-vindas do gestor", () => {
  test("compara hoje e ontem em São Paulo, sem coletas ou entregas abertas", () => {
    const data = managerWelcomeSummary([
      d("a", "2026-10-29T16:00:00Z"), d("b", "2026-10-28T15:00:00Z"),
      d("c", "2026-10-29T18:00:00Z", { source: "coleta" }),
      d("d", undefined, { status: "em_rota" }),
    ], [c("2026-10-29T17:00:00Z"), c("2026-10-28T11:00:00Z")], [
      cy("C1", "2026-10-28T14:00:00Z", [0, 0]),
      cy("C2", "2026-10-29T14:00:00Z", [0, 1]),
      cy("C3", undefined, [0], { status: "aberto" }),
    ], new Date("2026-10-30T01:00:00Z"));
    expect(data.day).toBe("2026-10-29");
    expect(data.deliveries).toEqual({ today: 1, yesterday: 1, difference: 0 });
    expect(data.checks).toEqual({ today: 1, yesterday: 1, difference: 0 });
    expect(data.cycles).toEqual({ today: 1, yesterday: 1, difference: 0 });
    expect(data.accuracy.map(p => p.percent)).toEqual([100, 50]);
    expect(data.accuracyDifference).toBe(-50);
  });
  test("até oito ciclos válidos, sem inventar comparação", () => {
    expect(managerWelcomeSummary([], [], [], new Date("2026-10-29")).accuracyDifference).toBeNull();
    const rows = Array.from({ length: 10 }, (_,i) => cy("C"+i,new Date(Date.UTC(2026,9,i+1)).toISOString(),[0,1]));
    rows.push(cy("vazio","2026-10-20T12:00:00Z",[]));
    expect(managerWelcomeSummary([],[],rows,new Date("2026-10-29")).accuracy.map(x=>x.label))
      .toEqual(["C2","C3","C4","C5","C6","C7","C8","C9"]);
  });
  test("saudações respeitam hora local", () => {
    expect(managerWelcomeGreeting(new Date("2026-10-29T12:00:00Z"))).toBe("Bom dia");
    expect(managerWelcomeGreeting(new Date("2026-10-29T18:00:00Z"))).toBe("Boa tarde");
    expect(managerWelcomeGreeting(new Date("2026-10-29T23:00:00Z"))).toBe("Boa noite");
  });
  test("mensagens motivadoras não ignoram quedas", () => {
    expect(welcomeChange({today:2,yesterday:4,difference:-2})).toContain("−2");
    expect(welcomeChange({today:4,yesterday:4,difference:0})).toContain("Mesmo total");
    expect(welcomeMotivation(-3)).toContain("melhorar");
    expect(welcomeMotivation(3)).toContain("Excelente");
  });
});
