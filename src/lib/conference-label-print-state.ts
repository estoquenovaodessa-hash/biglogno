import type { ConferenceLabelEntry } from "./conference-label-selection";

export const CONFERENCE_PRINT_KEY_PREFIX="conference-label-printed:";

/** Uma linha do app_state por registro, permitindo impressão simultânea
 * sem perder a marcação de outros documentos e sem SQL adicional. */
export function conferencePrintStateKey(id:string):string{
  return CONFERENCE_PRINT_KEY_PREFIX+id;
}

export type ConferencePrintEntry=ConferenceLabelEntry & {
  labelPrintedAt?:string|null;
  labelPrintedBy?:string|null;
};
export type ConferencePrintFilter="all"|"pending"|"printed";

export function isConferenceLabelPrinted(entry:Pick<ConferencePrintEntry,"labelPrintedAt">):boolean{
  return Boolean(entry.labelPrintedAt && Number.isFinite(Date.parse(entry.labelPrintedAt)));
}
export function filterConferencePrintStatus<T extends Pick<ConferencePrintEntry,"labelPrintedAt">>(
  records:T[],status:ConferencePrintFilter,
):T[]{
  return status==="all"?records:records.filter(r=>
    status==="printed"?isConferenceLabelPrinted(r):!isConferenceLabelPrinted(r));
}
export function conferencePrintSummary(records:Pick<ConferencePrintEntry,"labelPrintedAt">[]){
  const printed=records.filter(isConferenceLabelPrinted).length;
  return {printed,pending:records.length-printed,total:records.length};
}
