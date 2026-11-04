import { describe,expect,test } from "bun:test";
import {createReverseVolumeLabelsPdf,reverseVolumeLabelFilename} from "./reverse-volume-labels";
const cycle={number:7,supplier:"CCL",brand:"TEKBOND",nfd:"00012345",volumes:3};
describe("etiquetas de volumes da Logística Reversa",()=>{
  test("uma etiqueta por volume com tamanho físico 60 x 30mm",()=>{
    const doc=createReverseVolumeLabelsPdf(cycle);
    expect(doc.getNumberOfPages()).toBe(3);
    for(let p=1;p<=3;p++){
      doc.setPage(p);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(60,2);
      expect(doc.internal.pageSize.getHeight()).toBeCloseTo(30,2);
    }
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(500);
    expect(reverseVolumeLabelFilename(cycle)).toBe("logistica-reversa-7-volumes-argox.pdf");
  });
  test("etiquetas exigem NFD, fornecedor, marca e volumes válidos",()=>{
    expect(()=>createReverseVolumeLabelsPdf({...cycle,nfd:""})).toThrow();
    expect(()=>createReverseVolumeLabelsPdf({...cycle,brand:""})).toThrow();
    expect(()=>createReverseVolumeLabelsPdf({...cycle,volumes:0})).toThrow();
    expect(()=>createReverseVolumeLabelsPdf({...cycle,volumes:501})).toThrow();
  });
});
