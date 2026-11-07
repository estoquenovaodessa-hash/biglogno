import {describe,expect,test} from "bun:test";
import {
  isAutoConferencePrintEnabled,isConferenceEligibleForAutoPrint,autoPrintStatusMessage,
} from "./auto-conference-print";
describe("BigLogno Print - ativacao segura e elegibilidade",()=>{
  test("desligado por padrao, somente true ativa",()=>{
    expect(isAutoConferencePrintEnabled({})).toBe(false);
    expect(isAutoConferencePrintEnabled({AUTO_CONFERENCE_PRINT_ENABLED:"false"})).toBe(false);
    expect(isAutoConferencePrintEnabled({AUTO_CONFERENCE_PRINT_ENABLED:"TRUE"})).toBe(false);
    expect(isAutoConferencePrintEnabled({AUTO_CONFERENCE_PRINT_ENABLED:"true"})).toBe(true);
  });
  test("apenas novos documentos de Entrega ou Retira estao elegiveis",()=>{
    expect(isConferenceEligibleForAutoPrint({verifierCode:"101",balcaoDestination:"entrega"})).toBe(true);
    expect(isConferenceEligibleForAutoPrint({verifierCode:"101",balcaoDestination:"retira"})).toBe(true);
    expect(isConferenceEligibleForAutoPrint({verifierCode:"102",forDelivery:true})).toBe(true);
    expect(isConferenceEligibleForAutoPrint({verifierCode:"101"})).toBe(false);
    expect(isConferenceEligibleForAutoPrint({source:"csv",verifierCode:"101",balcaoDestination:"entrega"})).toBe(false);
  });
  test("nao promete comprovacao de saida do papel",()=>{
    expect(autoPrintStatusMessage("spooled")).toContain("fila de impressão do Windows");
  });
});