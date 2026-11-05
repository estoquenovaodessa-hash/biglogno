import {describe,expect,test} from "bun:test";
import {
  CONFERENCE_PRINT_KEY_PREFIX,conferencePrintStateKey,
  isConferenceLabelPrinted,filterConferencePrintStatus,conferencePrintSummary,
} from "./conference-label-print-state";

const row=(id,labelPrintedAt=null)=>({id,labelPrintedAt});
describe("Controle persistente das etiquetas da Conferência",()=>{
  test("chave única por conferência, inclusive entre dias",()=>{
    expect(conferencePrintStateKey("id-1")).toBe(CONFERENCE_PRINT_KEY_PREFIX+"id-1");
    expect(conferencePrintStateKey("id-1")).not.toBe(conferencePrintStateKey("id-2"));
  });
  test("somente data válida habilita marcação verde",()=>{
    expect(isConferenceLabelPrinted(row("1","2026-11-05T12:34:00Z"))).toBe(true);
    expect(isConferenceLabelPrinted(row("1",""))).toBe(false);
    expect(isConferenceLabelPrinted(row("1","invalid"))).toBe(false);
  });
  test("filtro de pendentes e geradas, incluindo datas antigas",()=>{
    const records=[row("1","2026-11-04T10:10:00Z"),row("2"),row("3","2026-10-30T14:00:00Z"),row("4")];
    expect(filterConferencePrintStatus(records,"all")).toHaveLength(4);
    expect(filterConferencePrintStatus(records,"pending").map(r=>r.id)).toEqual(["2","4"]);
    expect(filterConferencePrintStatus(records,"printed").map(r=>r.id)).toEqual(["1","3"]);
    expect(conferencePrintSummary(records)).toEqual({printed:2,pending:2,total:4});
  });
});
