import { conferenceLabelKind } from "./conference-label-selection";
import type { VerificationRecord } from "./sales-verification";

/** Configuração explicitamente desativada por padrão: sem SQL/secret, não
 * enfileirar nem bloquear a conferência feita pelo tablet. */
export function isAutoConferencePrintEnabled(env:Record<string,string|undefined>=process.env):boolean{
  return env.AUTO_CONFERENCE_PRINT_ENABLED === "true";
}
export function isConferenceEligibleForAutoPrint(
  record:Pick<VerificationRecord,"source"|"verifierCode"|"forDelivery"|"balcaoDestination">,
):boolean{
  return conferenceLabelKind(record)!==null;
}
export type ConferenceAutoPrintStatus="pending"|"claimed"|"spooled"|"error";
export function autoPrintStatusMessage(status:ConferenceAutoPrintStatus):string{
  return {
    pending:"Aguardando computador Windows",
    claimed:"Enviando para a Argox",
    spooled:"Enviado para a fila de impressão do Windows",
    error:"Falha: verificar agente de impressão",
  }[status];
}
