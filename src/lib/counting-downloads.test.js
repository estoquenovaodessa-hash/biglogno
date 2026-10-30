import {describe,expect,test} from "bun:test";
import {COUNTING_FILES} from "./format";
describe("arquivos individuais do ciclo",()=>{
  test("mantém três formatos CSV e um PDF, sem compactação",()=>{
    expect(COUNTING_FILES.map(f=>f.kind)).toEqual(["contagem","travar","destravar","pdf"]);
    expect(COUNTING_FILES).toHaveLength(4);
    expect(COUNTING_FILES.map(f=>f.name)).toEqual(["CSV de contagem","CSV Travar","CSV Destravar","Relatório PDF"]);
  });
});