import { describe, expect, test } from "bun:test";
import {
  CONFERENCE_LABEL_WIDTH_MM, CONFERENCE_LABEL_HEIGHT_MM,
  conferenceLabelValues, conferenceLabelFilename, createConferenceLabelPdf,
} from "./conference-label";

const record = {
  document: "000123-NF", clientName: "LOJAS NOVA ODESSA LTDA",
  items: 42, verifierName: "MARCOS", createdAt: "2026-11-03T02:59:00Z",
};

describe("etiqueta Argox de Conferência", () => {
  test("tamanho físico exato de 3,5 x 1,5 polegadas e apenas uma etiqueta por PDF", () => {
    expect(CONFERENCE_LABEL_WIDTH_MM).toBeCloseTo(88.9, 4);
    expect(CONFERENCE_LABEL_HEIGHT_MM).toBeCloseTo(38.1, 4);
    const pdf = createConferenceLabelPdf(record);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(88.9, 1);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(38.1, 1);
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(700);
  });
  test("campos do registro real, inclusive quantidade, fornecedor e data de São Paulo", () => {
    const v=conferenceLabelValues(record);
    expect(v).toEqual({
      document:"000123-NF",client:"LOJAS NOVA ODESSA LTDA",
      items:42,date:"02/11/2026",verifier:"MARCOS",
    });
  });
  test("nome seguro para arquivo individual, sem modificar número de documento", () => {
    expect(conferenceLabelFilename(record)).toBe("etiqueta-conferencia-000123-NF-argox.pdf");
    expect(conferenceLabelValues({...record,items:0}).items).toBe(0);
  });
  test("dados longos não impedem geração", () => {
    const pdf=createConferenceLabelPdf({...record,document:"12345678901234567890",
      clientName:"FERRAGENS E COMERCIO INDUSTRIAL EXTREMAMENTE LONGO DE NOVA ODESSA LTDA",
      verifierName:"FUNCIONARIO COM NOME MUITO EXTENSO"});
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
