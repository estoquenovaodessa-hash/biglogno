import { describe, expect, test } from "bun:test";
import {
  CONFERENCE_LABEL_WIDTH_MM, CONFERENCE_LABEL_HEIGHT_MM,
  conferenceLabelValues, conferenceLabelFilename, createConferenceLabelPdf,
  createConferenceLabelsPdf, conferenceLabelsBatchFilename,
} from "./conference-label";

const record = {
  document: "000123-NF", clientName: "LOJAS NOVA ODESSA LTDA",
  items: 42, verifierName: "MARCOS", createdAt: "2026-11-03T02:59:00Z",
  verifierCode:"101",balcaoDestination:"entrega",
};

describe("etiqueta Argox de Conferência", () => {
  test("tamanho físico exato de 60 x 30 mm, sem avançar várias etiquetas", () => {
    expect(CONFERENCE_LABEL_WIDTH_MM).toBe(60);
    expect(CONFERENCE_LABEL_HEIGHT_MM).toBe(30);
    const pdf = createConferenceLabelPdf(record);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(60, 2);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(30, 2);
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeGreaterThan(pdf.internal.pageSize.getHeight());
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
  test("PDF único para múltiplas etiquetas: cada documento é uma página real de 60x30mm", () => {
    const labels=[
      record,
      {...record,document:"000124-NF",balcaoDestination:"retira",clientName:"OUTRO CLIENTE"},
      {...record,document:"000125-NF",createdAt:"2026-11-01T14:00:00Z",items:7},
    ];
    const pdf=createConferenceLabelsPdf(labels);
    expect(pdf.getNumberOfPages()).toBe(3);
    for(let page=1;page<=3;page++){
      pdf.setPage(page);
      expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(60,2);
      expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(30,2);
    }
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });
  test("não permite PDF misto com pedido apenas Conferência ou histórico CSV",()=>{
    expect(()=>createConferenceLabelsPdf([])).toThrow();
    expect(()=>createConferenceLabelsPdf([record,{...record,document:"400",balcaoDestination:undefined}]))
      .toThrow("Somente conferências");
    expect(()=>createConferenceLabelPdf({...record,source:"csv"})).toThrow("Somente conferências");
  });
  test("nome do arquivo em lote distingue seleção histórica e dia",()=>{
    expect(conferenceLabelsBatchFilename("hoje","2026-11-04"))
      .toBe("etiquetas-conferencia-2026-11-04-argox.pdf");
    expect(conferenceLabelsBatchFilename("selecionadas","2026-11-04"))
      .toBe("etiquetas-conferencia-selecionadas-2026-11-04-argox.pdf");
  });
  test("dados longos não impedem geração", () => {
    const pdf=createConferenceLabelPdf({...record,document:"12345678901234567890",
      clientName:"FERRAGENS E COMERCIO INDUSTRIAL EXTREMAMENTE LONGO DE NOVA ODESSA LTDA",
      verifierName:"FUNCIONARIO COM NOME MUITO EXTENSO"});
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
