import {describe,expect,test} from "bun:test";
import {adjustCollectorCount,collectorProgress,createCollectorState,finalizeCollector,scanCollector,resolveCollectorBarcode,setCollectorCount,createCollectorPdf} from "./counting-collector";
const items=[{codigo:"03610",descricao:"Produto A",endereco:"A-01"},{codigo:"01162",descricao:"Produto B",endereco:"B-02"}];
const barcodes={registros:{},porBarcode:{"7891234567890":"03610","7891040004973":"01162","47891040004971":"01162","9999999999999":"99999"}};
const cycle={id:"ciclo1",tipo:"padrao",numero:1,titulo:"Padrão NR 1",criadoEm:"2026-11-04T13:00:00Z",status:"aberto",itens:items,enviadoZona:false};
describe("Coletor de ciclos",()=>{
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
