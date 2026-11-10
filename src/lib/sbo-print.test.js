import { describe, expect, test } from "bun:test";
import { prepareSboPrintParts, SBO_MAX_PRINT_PDF_BASE64, summarizeSboPrintJobs } from "./sbo-print";

const label = (i) => ({
  code: String(i).padStart(5, "0"), description: "Produto " + i,
  quantity: 1, unit: "UN",
});

describe("Impressão remota S.B.O via fila segura do BigLogno Print", () => {
  test("um PDF válido para uma etiqueta de 60x30mm", () => {
    const parts = prepareSboPrintParts([label(1)]);
    expect(parts).toHaveLength(1);
    expect(parts[0].labelCount).toBe(1);
    expect(parts[0].pdfBase64.length).toBeLessThanOrEqual(SBO_MAX_PRINT_PDF_BASE64);
    expect(atob(parts[0].pdfBase64).startsWith("%PDF")).toBe(true);
  });
  test("divide 95 etiquetas em lotes seguros sem perder etiquetas", () => {
    const parts = prepareSboPrintParts(Array.from({ length: 95 }, (_, i) => label(i + 1)));
    expect(parts.map(part => part.labelCount)).toEqual([40, 40, 15]);
    expect(parts.reduce((sum, part) => sum + part.labelCount, 0)).toBe(95);
    expect(parts.every(part => part.pdfBase64.length <= SBO_MAX_PRINT_PDF_BASE64)).toBe(true);
  });
  test("não aceita lista vazia ou acima de 500", () => {
    expect(() => prepareSboPrintParts([])).toThrow();
    expect(() => prepareSboPrintParts(Array.from({ length: 501 }, (_, i) => label(i)))).toThrow();
  });
  test("diferencia fila, spooler e falha — spooler não confirma saída física", () => {
    expect(summarizeSboPrintJobs([{status:"pending",sbo_label_count:2}]).completed).toBe(false);
    expect(summarizeSboPrintJobs([{status:"spooled",sbo_label_count:10}]))
      .toMatchObject({completed:true,spooled:1,printedLabels:10,errors:0});
    expect(summarizeSboPrintJobs([{status:"spooled",sbo_label_count:2},{status:"error",sbo_label_count:3,last_error:"sem papel"}]))
      .toMatchObject({completed:true,spooled:1,errors:1,error:"sem papel"});
  });
});
