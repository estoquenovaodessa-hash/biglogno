import { describe, test, expect } from "bun:test";
import { parseHistoricalSales, historicalKey } from "./sales-import";
import { salesMetrics, sellerMetrics, verificationChannel, errorComment } from "./sales-verification";
import { compareSalesWeeks } from "./sales-weekly";

const header = '"Documento";"Cód. conferente";"Conferente";"Cód. cliente";"Cliente";"Qtd itens";"Valor";"Situação";"Observação";"Data/hora"';
const counter = '2287604;101;Giovana (Balcão);100;CONSUMIDOR;1;5,39;CERTO;;17/10/2026 11:42';
const expedition = '2287603;102;Giovana (Expedição);100;CONSUMIDOR;4;480,00;ERRADO;Expedição — QUANTIDADE;17/10/2026 11:46';
const parse = rows => parseHistoricalSales(`\uFEFF"Conferências — período: Todo o período"\n\n${header}\n${rows.join("\n")}`);
describe("importação de conferências antigas", () => {
  test("preserva valores brasileiros e data/hora original de São Paulo", () => {
    const r = parse([counter]).records[0]; expect(r.value).toBe(5.39); expect(r.createdAt).toBe("2026-10-17T14:42:00.000Z"); expect(r.clientName).toBe("CONSUMIDOR"); expect(r.durationSeconds).toBeNull();
  });
  test("separa balcão e expedição e alimenta a comparação semanal", () => {
    const r = parse([counter, expedition]); expect(r.counter).toBe(1); expect(r.expedition).toBe(1);
    const week = compareSalesWeeks(r.records, "2026-10-11").previous;
    expect(week.count).toBe(2); expect(week.errors).toBe(1); expect(week.counterShare).toBe(50); expect(week.expeditionShare).toBe(50); expect(week.value).toBe(485.39);
  });
  test("não inventa vendedor para registros sem identificação", () => { const r = parse([counter]).records[0]; expect(r.seller).toBe("NÃO INFORMADO"); expect(sellerMetrics([r], "José", 0).count).toBe(0); });
  test("reconhece vendedor e motivos escritos sem descartar observação original", () => {
    const r = parse([counter.replace("CERTO;;", "ERRADO;Interno — CPF / MATERIAL- ARTHUR E;")]).records[0];
    expect(r.seller).toBe("Arthur E."); expect(r.errorReasons).toEqual(["MATERIAL", "CPF"]); expect(r.observation).toBe("Interno — CPF / MATERIAL- ARTHUR E"); expect(errorComment(r)).toBe("Interno — CPF / MATERIAL- ARTHUR E");
  });
  test("registros sem área usam apenas código inequivocamente identificado no arquivo", () => {
    const r = parse([counter, counter.replace("2287604", "2287605").replace("Giovana (Balcão)", "Giovana")]); expect(r.counter).toBe(2);
    expect(() => parse([counter.replace("Giovana (Balcão)", "Giovana")])).toThrow("Área");
  });
  test("duplicação usa documento, conferente e minuto original, sem depender da ordem", () => {
    expect(parse([counter, counter]).duplicates).toBe(1); expect(parse([counter, counter]).records.length).toBe(1);
    const r = parse([counter]).records[0]; expect(historicalKey(r)).toBe(historicalKey({ ...r, verifierCode: "00101" }));
  });
  test("erros antigos sem motivo conhecido permanecem erros com comentário original", () => {
    const r = parse([counter.replace("CERTO;;", "ERRADO;Etiqueta incorreta;")]).records[0]; expect(r.correct).toBe(false); expect(r.errorReasons).toEqual([]); expect(errorComment(r)).toContain("Etiqueta incorreta");
  });
  test("não inclui tempo ausente na média dos registros novos", () => {
    const r = parse([counter]).records[0]; expect(salesMetrics([r, { ...r, durationSeconds: 120 }]).minutes).toBe(2);
  });
  test("rejeita datas inexistentes e situação desconhecida", () => {
    expect(() => parse([counter.replace("17/10", "31/02")])).toThrow("Data/hora"); expect(() => parse([counter.replace("CERTO", "OUTRO")])).toThrow("Situação");
  });
  test("canal explícito prevalece sobre o vendedor para registros históricos", () => { expect(verificationChannel({ seller: "José", channel: "expedicao" })).toBe("expedicao"); });
});