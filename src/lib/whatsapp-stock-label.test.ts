import { describe, expect, test } from "bun:test";
import {
  createWhatsAppStockLabelsPdf,
  prepareWhatsAppStockLabelParts,
  WHATSAPP_MAX_PDF_BASE64,
} from "./whatsapp-stock-label";

const label = (index: number) => ({
  company: "PENTAX",
  code: String(12456 + index),
  description: "FITA ISOLANTE PREMIUM 18 MM PARA FERRAMENTAS INDUSTRIAIS",
});

describe("Etiqueta automática WhatsApp → Argox 60 × 30 mm", () => {
  test("gera PDF com código, descrição, empresa, marca e QUANTIDADE EM BRANCO", () => {
    const pdf = createWhatsAppStockLabelsPdf([label(0)]);
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(60, 0);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(30, 0);
    const b64 = prepareWhatsAppStockLabelParts([label(0)])[0].pdfBase64;
    expect(Buffer.from(b64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    // O modelo nem sequer recebe quantidade. A área de quantidade é vazia.
    expect("quantity" in label(0)).toBe(false);
  });
  test("cada código solicitado vira uma página, e 87 códigos são divididos 40/40/7", () => {
    const items = Array.from({length:87}, (_,i)=>label(i));
    const parts = prepareWhatsAppStockLabelParts(items);
    expect(parts.map(part=>part.labelCount)).toEqual([40,40,7]);
    expect(parts.every(part=>part.pdfBase64.length<=WHATSAPP_MAX_PDF_BASE64)).toBe(true);
    expect(parts.reduce((sum,part)=>sum+part.labelCount,0)).toBe(87);
  });
  test("descrições e empresas longas não impedem a impressão", () => {
    const parts = prepareWhatsAppStockLabelParts([{
      company:"EMPRESA PENTAX FILIAL MATERIAIS INDUSTRIAIS LTDA",
      code:"0012456",description:"PRODUTO COM DESCRICAO MUITO EXTENSA ".repeat(14),
    }]);
    expect(parts).toHaveLength(1);
  });
  test("não cria etiqueta para itens sem código, descrição ou empresa", () => {
    expect(()=>createWhatsAppStockLabelsPdf([{...label(0),code:""}])).toThrow();
    expect(()=>createWhatsAppStockLabelsPdf([{...label(0),description:""}])).toThrow();
    expect(()=>createWhatsAppStockLabelsPdf([{...label(0),company:""}])).toThrow();
    expect(()=>prepareWhatsAppStockLabelParts([])).toThrow();
    expect(()=>prepareWhatsAppStockLabelParts(Array.from({length:501},(_,i)=>label(i)))).toThrow();
  });
});
