import { describe, test, expect } from "bun:test";
import { percentageTone, canManageSales, sellerMetrics, sellerCountKey, sellerSalesSchema, canonicalCode, documentPrefix, errorComment, lastVerificationFields, parseClients, salesMetrics, verificationSchema } from "./sales-verification";

describe("conferência de materiais vendidos", () => {
  test("percentuais abaixo de 70 são vermelhos", () => { expect(percentageTone(69.9)).toBe("destructive"); });
  test("percentuais de 70 até 95 são amarelos", () => { expect(percentageTone(70)).toBe("warning"); expect(percentageTone(94.9)).toBe("warning"); expect(percentageTone(95)).toBe("warning"); });
  test("percentuais acima de 95 são verdes", () => { expect(percentageTone(95.1)).toBe("success"); });
  test("exclusão e vendas são exclusivas do gestor", () => { expect(canManageSales("gestor")).toBe(true); expect(canManageSales("operador")).toBe(false); expect(canManageSales(null)).toBe(false); });
  test("vendedor separa conferências, cobertura, valor e motivos múltiplos", () => {
    const result = sellerMetrics([{ seller: "José", correct: true, items: 2, value: 20, durationSeconds: 60 }, { seller: "José", correct: false, items: 3, value: 30, durationSeconds: 60, errorReasons: ["CPF", "MATERIAL"] }, { seller: "Daniel", correct: false, items: 8, value: 99, durationSeconds: 60, errorReason: "CPF" }], "José", 10);
    expect(result.count).toBe(2); expect(result.accuracy).toBe(50); expect(result.coverage).toBe(20); expect(result.value).toBe(50); expect(result.errorsByReason.find(r => r.reason === "CPF").count).toBe(1); expect(result.errorsByReason.find(r => r.reason === "MATERIAL").count).toBe(1);
  });
  test("sem vendas não inventa cobertura e vendas não podem ser negativas", () => { expect(sellerMetrics([], "José", 0).coverage).toBeNull(); expect(sellerSalesSchema.safeParse({ period: "all", seller: "José", count: -1 }).success).toBe(false); expect(sellerCountKey("all", "José")).not.toBe(sellerCountKey("all", "Daniel")); });
  const input = { requestId: "123e4567-e89b-42d3-a456-426614174000", document: "2287466", items: 2, clientCode: "100", verifierCode: "101", value: 19.81, correct: false, seller: "José", durationSeconds: 60 };
  test("cliente permanece preenchido exatamente como no último registro", () => {
    expect(lastVerificationFields({ ...input, clientCode: "00024711" }).clientCode).toBe("00024711");
    expect(lastVerificationFields().clientCode).toBe("");
  });
  test("conferente permanece preenchido exatamente como no último registro", () => {
    expect(lastVerificationFields({ ...input, verifierCode: "00101" }).verifierCode).toBe("00101");
    expect(lastVerificationFields().verifierCode).toBe("");
  });
  test("Errado exige um dos motivos MATERIAL, QUANTIDADE ou CPF", () => {
    expect(verificationSchema.safeParse(input).success).toBe(false);
    for (const errorReason of ["MATERIAL", "QUANTIDADE", "CPF"]) {
      expect(verificationSchema.parse({ ...input, errorReason }).errorReason).toBe(errorReason);
    }
    expect(verificationSchema.safeParse({ ...input, errorReason: "OUTRO" }).success).toBe(false);
  });
  test("Certo não admite motivo de erro", () => {
    expect(verificationSchema.safeParse({ ...input, correct: true }).success).toBe(true);
    expect(verificationSchema.safeParse({ ...input, correct: true, errorReason: "CPF" }).success).toBe(false);
    expect(verificationSchema.safeParse({ ...input, correct: true, errorReasons: ["CPF", "MATERIAL"] }).success).toBe(false);
  });
  test("Errado permite vários motivos e exige pelo menos um", () => {
    expect(verificationSchema.parse({ ...input, errorReasons: ["MATERIAL", "QUANTIDADE", "CPF"] }).errorReasons).toEqual(["MATERIAL", "QUANTIDADE", "CPF"]);
    expect(verificationSchema.safeParse({ ...input, errorReasons: [] }).success).toBe(false);
    expect(verificationSchema.safeParse({ ...input, errorReasons: ["CPF", "OUTRO"] }).success).toBe(false);
    expect(errorComment({ ...input, errorReasons: ["MATERIAL", "QUANTIDADE", "CPF"] })).toBe("Interno — MATERIAL / QUANTIDADE / CPF - José");
  });
  test("comentário preserva motivo e vendedor e não inventa motivo de registros antigos", () => {
    expect(errorComment({ ...input, errorReason: "CPF" })).toBe("Interno — CPF - José");
    expect(errorComment({ ...input, seller: "EXPEDIÇÃO", errorReason: "QUANTIDADE" })).toBe("Expedição — QUANTIDADE - EXPEDIÇÃO");
    expect(errorComment(input)).toBe("Interno — Motivo não informado - José");
    expect(errorComment({ ...input, correct: true })).toBe("—");
  });
  test("documento mantém os quatro primeiros dígitos do último registro", () => {
    expect(documentPrefix("2253123456")).toBe("2253");
    expect(documentPrefix("00179999")).toBe("0017");
  });
  test("localiza o cliente numérico independentemente dos zeros da planilha", () => {
    expect(canonicalCode("00000100")).toBe(canonicalCode("100"));
  });
  test("importação lê código e nome após o cabeçalho do relatório", () => {
    expect(parseClients("EMPRESA\nCLIENTES COMPLETO\nCÓDIGO;NOME DO CLIENTE;TELEFONE\n00000100;CONSUMIDOR;123\n00000017;CLIENTE TESTE;456")).toEqual([{ code: "00000100", name: "CONSUMIDOR" }, { code: "00000017", name: "CLIENTE TESTE" }]);
  });
  test("valor informado pelo operador é preservado", () => {
    const record = { requestId: "123e4567-e89b-42d3-a456-426614174000", document: "22530001", items: 2, clientCode: "100", verifierCode: "101", value: 123.45, correct: true, seller: "Daniel", durationSeconds: 60 };
    expect(verificationSchema.parse(record).value).toBe(123.45);
    expect(verificationSchema.safeParse({ ...record, value: -1 }).success).toBe(false);
  });
  test("painel separa certas e erros e soma itens e valores", () => {
    const metrics = salesMetrics([{ correct: true, items: 2, value: 10, durationSeconds: 60 }, { correct: false, items: 3, value: 20, durationSeconds: 180 }]);
    expect(metrics).toEqual({ count: 2, items: 5, correct: 1, errors: 1, accuracy: 50, value: 30, minutes: 2 });
  });
});
import { parseMoneyInput as pmi } from "./sales-verification.ts";
import { test as t2, expect as e2 } from "bun:test";
t2("valor sem vírgula vira reais inteiros", () => {
  e2(pmi("27")).toBe(27); e2(pmi("360")).toBe(360); e2(pmi("27,50")).toBe(27.5); e2(pmi("1.234,56")).toBe(1234.56);
});
