"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {identificarMensagemWhatsApp,idPedidoDaMensagem,solicitarEtiquetasDoBot,processarPedidosPendentes}=require("./print-client");

const token="a".repeat(64);
test("aceita ID WhatsApp serializado e ID curto de versões diferentes",()=>{
  const a={from:"grupo@g.us",id:{_serialized:"true_grupo@g.us_AB12",id:"AB12"},timestamp:1794490000,body:"12456 - 6\nPENTAX"};
  const b={from:"grupo@g.us",id:{id:"AB12"},timestamp:1794490000,body:a.body};
  const x=identificarMensagemWhatsApp(a);
  const y=identificarMensagemWhatsApp(b);
  assert.match(x,/AB12/);
  assert.match(y,/AB12/);
  assert.equal(y,identificarMensagemWhatsApp(b));
  assert.notEqual(y,identificarMensagemWhatsApp({...b,id:{id:"AB13"}}));
});
test("aceita ID da estrutura rawData quando msg.id nao vier",()=>{
  const a={from:"grupo@g.us",rawData:{id:{_serialized:"true_grupo@g.us_X123"}},timestamp:1794490000,body:"Mensagem"};
  assert.match(identificarMensagemWhatsApp(a),/X123/);
  assert.equal(identificarMensagemWhatsApp(a),identificarMensagemWhatsApp(a));
});
test("sem ID utiliza dados estaveis da mensagem; reconexao nao duplica jobs",()=>{
  const msg={from:"grupo@g.us",author:"usuario@c.us",timestamp:1794490000,body:"12456 - 6\nPENTAX"};
  const a=identificarMensagemWhatsApp(msg);
  const b=identificarMensagemWhatsApp({...msg});
  assert.equal(a,b);
  assert.equal(idPedidoDaMensagem(a),idPedidoDaMensagem(b));
  assert.notEqual(a,identificarMensagemWhatsApp({...msg,timestamp:1794490001}));
  assert.notEqual(a,identificarMensagemWhatsApp({...msg,author:"outro@c.us"}));
});
test("na falta de identificacao e timestamp recusa impressao para nao criar reimpressao aleatoria",()=>{
  assert.throws(()=>identificarMensagemWhatsApp({from:"grupo@g.us",body:"pedido"}),/sem ID/);
});

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
  },{token,fetch:mockFetch,persist:false});
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


test("falha de rede salva pedido no disco e reenvia sem perder ou duplicar quantidade", async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"biglog-pendentes-"));
  try{
    let attempts=0;
    const fail=async()=>{ attempts++; const e=new Error("fetch failed"); e.cause={code:"ECONNRESET"}; throw e; };
    const dados={messageId:"pedido-pendente-1",company:"PENTAX",
      items:[{code:"12456",description:"FITA VEDA ROSCA",quantity:6}]};
    const result=await solicitarEtiquetasDoBot(dados,{token,fetch:fail,outboxDir:dir});
    assert.equal(result.pending,true);
    assert.equal(result.ok,false);
    assert.equal(attempts,3);
    assert.match(result.reason,/ECONNRESET/);
    const files=fs.readdirSync(dir);
    assert.equal(files.length,1);
    assert.ok(files[0].endsWith(".json"));
    const raw=fs.readFileSync(path.join(dir,files[0]),"utf8");
    assert.ok(!raw.includes(token));
    const pending=JSON.parse(raw).payload;
    assert.deepEqual(pending.items,[{code:"12456",description:"FITA VEDA ROSCA"}]);
    assert.equal(pending.requestId,result.requestId);
    let recoveredPayload;
    const success=async(_url,init)=>{
      recoveredPayload=JSON.parse(init.body);
      return {ok:true,json:async()=>({ok:true,labels:1,batches:1})};
    };
    assert.equal(await processarPedidosPendentes({token,fetch:success,outboxDir:dir}),1);
    assert.equal(recoveredPayload.requestId,result.requestId);
    assert.deepEqual(fs.readdirSync(dir),[]);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test("erro de token 401 conserva pedido, mas nao repete HTTP imediatamente",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"biglog-401-"));
  try{
    let calls=0;
    const fake=async()=>{
      calls++;
      return {ok:false,status:401,json:async()=>({error:"Não autorizado."})};
    };
    const result=await solicitarEtiquetasDoBot({
      messageId:"msg401",company:"PENTAX",items:[{code:"12456",description:"Teste"}]
    },{token,fetch:fake,outboxDir:dir});
    assert.equal(result.pending,true);
    assert.equal(calls,1);
    assert.equal(fs.readdirSync(dir).length,1);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
