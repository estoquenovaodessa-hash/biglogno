import {describe,expect,test} from "bun:test";
import {parseBarcodes} from "./csv";
import {adjustCollectorCount,collectorProgress,createCollectorState,finalizeCollector,scanCollector,resolveCollectorBarcode,setCollectorCount,createCollectorPdf} from "./counting-collector";
const items=[{codigo:"03610",descricao:"Produto A",endereco:"A-01"},{codigo:"01162",descricao:"Produto B",endereco:"B-02"}];
const barcodes={registros:{},porBarcode:{"7891234567890":"03610","7891040004973":"01162","47891040004971":"01162","9999999999999":"99999"}};
const cycle={id:"ciclo1",tipo:"padrao",numero:1,titulo:"Padrão NR 1",criadoEm:"2026-11-04T13:00:00Z",status:"aberto",itens:items,enviadoZona:false};
describe("Coletor de ciclos",()=>{
  test("planilha PRODUTOS: coluna A liga aos múltiplos códigos da coluna M",()=>{
    const csv=[
      "BIGNOTTO FERRAMENTAS LTDA",
      "",
      "PRODUTOS 04/11/2026 13:59",
      "",
      "CÓDIGO;DESCRIÇÃO;REFERÊNCIA;CÓD. FABRICA;UN;UNIDADE;PESO;ABF;;FONECEDOR;MARCA;CLASSIF. IPI;CÓD. BARRAS;DATA CAD.;% COM. EXT.;% COM. INT.",
      '"01162";"3M ADESIVO DE JUNTA PRA MOTOR";"";"";"UN";"UN";0,00;"001";"";"";"3M";"35061090";"| 7891040004973 | 47891040004971 |";01/02/2017;0,00;0,00',
      '"03610";"FITA ISOLANTE";"";"";"UN";"UN";0,00;"001";"";"";"BIGNOTTO";"35061090";"| 7891234567890 |";01/02/2017;0,00;0,00',
    ].join("\n");
    const parsed=parseBarcodes(csv,"produtos com codigo de barras.csv");
    expect(parsed.registros["01162"]?.barcodes).toEqual(["7891040004973","47891040004971"]);
    expect(parsed.porBarcode["7891040004973"]).toBe("01162");
    expect(parsed.porBarcode["47891040004971"]).toBe("01162");
    expect(parsed.porBarcode["7891234567890"]).toBe("03610");
    expect(parsed.nomeArquivo).toBe("produtos com codigo de barras.csv");
  });
  test("aceita vários códigos de barras da coluna M para o mesmo item do ciclo",()=>{
    expect(resolveCollectorBarcode("47891040004971",barcodes,items).code).toBe("01162");
    expect(resolveCollectorBarcode("7891040004973",barcodes,items).code).toBe("01162");
    expect(resolveCollectorBarcode("3610",barcodes,items).code).toBe("03610");
    expect(resolveCollectorBarcode("9999999999999",barcodes,items).reason).toBe("fora_do_ciclo");
  });
  test("bipagem livre incrementa por bip e suporta ajustes e exclusão",()=>{
    let state=createCollectorState();
    state=scanCollector(state,"7891234567890",barcodes,items,null).state;
    state=scanCollector(state,"7891234567890",barcodes,items,null).state;
    expect(state.quantidades["03610"]).toBe(2);
    state=adjustCollectorCount(state,"03610",-1);
    expect(state.quantidades["03610"]).toBe(1);
    state=adjustCollectorCount(state,"01162",1);
    state=setCollectorCount(state,"03610",0);
    expect(state.quantidades["03610"]).toBeUndefined();
    expect(collectorProgress({...cycle,coletor:state})).toEqual({products:1,units:1,total:2});
  });
  test("modo restrito bloqueia item diferente, desconhecido e nenhum selecionado",()=>{
    let state={...createCollectorState(),modo:"restrita"};
    let bad=scanCollector(state,"7891040004973",barcodes,items,"03610");
    expect(bad.result).toMatchObject({ok:false,reason:"restrito_diferente",bloquear:true});
    expect(bad.state.quantidades).toEqual({});
    bad=scanCollector(state,"1234567899999",barcodes,items,"03610");
    expect(bad.result.bloquear).toBe(true);
    bad=scanCollector(state,"7891234567890",barcodes,items,null);
    expect(bad.result.bloquear).toBe(true);
    const good=scanCollector(state,"7891234567890",barcodes,items,"03610");
    expect(good.result.ok).toBe(true);
    expect(good.state.quantidades["03610"]).toBe(1);
  });
  test("bipagem finalizada fica travada até reabrir para correção",()=>{
    const final=finalizeCollector({...createCollectorState(),quantidades:{"03610":2}});
    expect(createCollectorState(final)).toEqual(final);
  });
  test("finalizar habilita PDF, sem finalizar o ciclo normal",()=>{
    const state=finalizeCollector({...createCollectorState(),quantidades:{"03610":3}});
    const current={...cycle,coletor:state};
    const doc=createCollectorPdf(current);
    expect(current.status).toBe("aberto");
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(500);
    expect(()=>createCollectorPdf({...cycle,coletor:createCollectorState()})).toThrow();
  });
});
