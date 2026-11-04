import {describe,expect,test} from "bun:test";
import {
  reverseSupplierDetailsSchema,reverseSupplierSaveSchema,
  reverseContactSchema,emptyReverseChecklist,allReverseContactStepsDone,
  reverseStageChangeSchema,reverseCreateSchema,reverseWhatsAppLink,
  reverseWorkflowStage,reverseStatusLabel,
} from "./reverse-logistics";

const complete={informedItems:true,mirrorApproved:true,finalInvoiceRequested:true,pickupScheduled:true};
const base={id:"4d50d06a-830b-4db3-9853-a6cdfce9cb1b",version:3,supplier:"CCL",brand:"TEKBOND",
  status:"finalizado",treatmentStatus:"em_tratativa",items:[],groups:[],number:1,createdAt:"2026-11-04",updatedAt:"2026-11-04"};
describe("Logística Reversa guiada",()=>{
  test("cadastro de fornecedores possui várias marcas e contatos",()=>{
    const parsed=reverseSupplierDetailsSchema.safeParse({
      name:"CCL",brands:["ADELBRAS","TEKBOND"],contactName:"Paula",
      phone:"(19) 99999-8888",email:"contato@example.com",cnpj:"12.345.678/0001-90",
    });
    expect(parsed.success).toBe(true);
    expect(reverseSupplierDetailsSchema.safeParse({name:"CCL",brands:[]}).success).toBe(false);
    expect(reverseSupplierDetailsSchema.safeParse({name:"CCL",brands:["TEKBOND","teokbond"]}).success).toBe(true);
    expect(reverseSupplierDetailsSchema.safeParse({name:"CCL",brands:["TEKBOND","tekbond"]}).success).toBe(false);
  });
  test("criação de ciclo exige fornecedor válido e marca",()=>{
    expect(reverseCreateSchema.safeParse({groups:["LUKMA"],supplierId:base.id,brand:"TEKBOND"}).success).toBe(true);
    expect(reverseCreateSchema.safeParse({groups:["LUKMA"]}).success).toBe(false);
    expect(reverseCreateSchema.safeParse({groups:["LUKMA"],supplierId:base.id,brand:""}).success).toBe(false);
  });
  test("quatro passos obrigatórios, com progresso parcial permitido",()=>{
    expect(allReverseContactStepsDone(emptyReverseChecklist())).toBe(false);
    expect(reverseContactSchema.safeParse(complete).success).toBe(true);
    expect(allReverseContactStepsDone({...complete,pickupScheduled:false})).toBe(false);
    expect(allReverseContactStepsDone(complete)).toBe(true);
  });
  test("status e solução seguem sequência do operador",()=>{
    expect(reverseWorkflowStage({...base,status:"aberto"})).toBe("em_contagem");
    expect(reverseWorkflowStage(base)).toBe("em_tratativa");
    expect(reverseStatusLabel(base)).toBe("Em tratativas");
    expect(reverseStatusLabel({...base,treatmentStatus:"aguardando_coleta"})).toBe("Aguardando coleta");
    expect(reverseStatusLabel({...base,treatmentStatus:"coletado"})).toBe("Coletado");
    expect(reverseStatusLabel({...base,treatmentStatus:"resolvido",returnMode:"abatimento_boleto"})).toBe("Finalizado (Abatimento)");
    expect(reverseStatusLabel({...base,treatmentStatus:"devolvido",returnMode:"devolucao_material"})).toBe("Finalizado (Material novo)");
    expect(reverseStageChangeSchema.safeParse({id:base.id,version:3,status:"aguardando_coleta",nfd:"12345",volumes:3}).success).toBe(true);
    expect(reverseStageChangeSchema.safeParse({id:base.id,version:3,status:"resolvido",returnMode:"devolucao_material",returnNfe:"ABC"}).success).toBe(true);
    expect(reverseStageChangeSchema.safeParse({id:base.id,version:3,status:"aguardando_coleta",volumes:0}).success).toBe(false);
  });
  test("WhatsApp Web só recebe celular válido, com DDI 55",()=>{
    expect(reverseWhatsAppLink("(19) 99999-8888")).toBe("https://wa.me/5519999998888");
    expect(reverseWhatsAppLink("5519999998888")).toBe("https://wa.me/5519999998888");
    expect(reverseWhatsAppLink("123")).toBe(null);
  });
});
