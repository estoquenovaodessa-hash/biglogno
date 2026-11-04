import {describe,expect,test} from "bun:test";
import {
  normalizeSboCode,sboUnit,createSboCatalog,findSboItem,
  parseSboQuantity,sboQuantityText,createSboLabelsPdf,sboLabelFilename,
} from "./sbo-label";
const addresses={registros:{
  a:{codigo:"03610",descricao:"Fita isolante 10m"},
  b:{codigo:"00940",descricao:"Cabo flexível"},
}};
const barcodeBase={registros:{
  x:{codigo:"03610",descricao:"FITA ISOLANTE 10 METROS",barcodes:["7891234567890"]},
},porBarcode:{"7891234567890":"03610"}};
const movements=[{codigo:"00940",descricao:"CABO FLEXÍVEL",unidade:"MT"}];
describe("Etiquetagem S.B.O",()=>{
  test("acha item por código sem zeros e por código de barras sem varrer catálogo",()=>{
    const catalog=createSboCatalog(barcodeBase,addresses,movements);
    expect(normalizeSboCode("3610")).toBe("03610");
    expect(findSboItem(catalog,"3610")).toMatchObject({code:"03610",description:"FITA ISOLANTE 10 METROS",unit:"UN"});
    expect(findSboItem(catalog,"7891234567890")?.code).toBe("03610");
    expect(findSboItem(catalog,"940")?.unit).toBe("Metros");
    expect(findSboItem(catalog,"00000")).toBe(null);
  });
  test("só aceita quantidade positiva; unidade UN exige inteiro; aceita vírgula para metros e peso",()=>{
    expect(sboUnit("GR")).toBe("G");
    expect(sboUnit("KG")).toBe("KG");
    expect(sboUnit("UNID")).toBe("UN");
    expect(parseSboQuantity("2,5","Metros")).toBe(2.5);
    expect(parseSboQuantity("0,250","KG")).toBe(0.25);
    expect(parseSboQuantity("2,5","UN")).toBe(null);
    expect(parseSboQuantity("3","UN")).toBe(3);
    expect(parseSboQuantity("0","G")).toBe(null);
    expect(parseSboQuantity("abc","UN")).toBe(null);
    expect(sboQuantityText(2.5,"Metros")).toBe("2,5 METROS");
  });
  test("PDF único de uma ou várias etiquetas no formato real 60x30mm",()=>{
    const rows=[
      {code:"03610",description:"FITA ISOLANTE 10 METROS",quantity:2,unit:"UN"},
      {code:"00940",description:"CABO FLEXÍVEL",quantity:3.5,unit:"Metros"},
    ];
    const doc=createSboLabelsPdf(rows);
    expect(doc.getNumberOfPages()).toBe(2);
    for(let p=1;p<=2;p++){
      doc.setPage(p);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(60,2);
      expect(doc.internal.pageSize.getHeight()).toBeCloseTo(30,2);
    }
    expect(sboLabelFilename(rows)).toBe("etiqueta-sbo-lote-2-argox-60x30mm.pdf");
    expect(createSboLabelsPdf(rows.slice(0,1)).getNumberOfPages()).toBe(1);
  });
  test("impede arquivo vazio e unidade incorreta",()=>{
    expect(()=>createSboLabelsPdf([])).toThrow();
    expect(()=>createSboLabelsPdf([{code:"A",description:"B",quantity:0,unit:"UN"}])).toThrow();
  });
});
