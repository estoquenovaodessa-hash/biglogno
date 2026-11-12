"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
const {idPedidoDaMensagem,solicitarEtiquetasDoBot}=require("./print-client");

const token="a".repeat(64);
test("mesma mensagem do WhatsApp sempre produz mesmo UUID para evitar duplicidade",()=>{
  const id=idPedidoDaMensagem("true_12036@g.us_AAA");
  assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(id,idPedidoDaMensagem("true_12036@g.us_AAA"));
  assert.notEqual(id,idPedidoDaMensagem("true_12036@g.us_BBB"));
});
test("comando já interpretado mantém empresa e manda etiqueta sem quantidade",async()=>{
  let request;
  const mockFetch=async(url,init)=>{
    request={url,init,payload:JSON.parse(init.body)};
    return {ok:true,json:async()=>({ok:true,labels:1,batches:1})};
  };
  const result=await solicitarEtiquetasDoBot({
    messageId:"abc-test",company:"PENTAX",
    items:[{code:"12456",description:"FITA VEDA ROSCA",quantity:6}],
  },{token,fetch:mockFetch});
  assert.equal(result.ok,true);
  assert.equal(request.payload.company,"PENTAX");
  assert.deepEqual(request.payload.items,[{code:"12456",description:"FITA VEDA ROSCA"}]);
  assert.equal("quantity" in request.payload.items[0],false);
  assert.equal(request.init.headers.authorization,"Bearer "+token);
  assert.equal(request.init.method,"POST");
  assert.match(request.url,/https:\/\//);
});
test("sem configuração não envia nada nem prejudica o bot original",async()=>{
  const result=await solicitarEtiquetasDoBot({
    messageId:"abc",company:"PENTAX",items:[{code:"12456",description:"Item"}],
  },{token:"",fetch:()=>{throw new Error("Não deveria chamar");}});
  assert.equal(result.skipped,true);
});
test("não tenta imprimir produto que não foi localizado no CSV",async()=>{
  const result=await solicitarEtiquetasDoBot({messageId:"x",company:"PENTAX",items:[]},
    {token,fetch:()=>{throw new Error("Não deveria chamar");}});
  assert.equal(result.skipped,true);
});
test("exige uma identificação estável para não reimprimir após reconexão",()=>{
  assert.throws(()=>idPedidoDaMensagem(undefined),/identificador estável/);
});
