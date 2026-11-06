import {describe,expect,test} from "bun:test";
import {readFileSync,existsSync} from "node:fs";

describe("Mascote de carregamento BigLogno",()=>{
  test("WebP animado é válido e contém os quadros da corrida",()=>{
    const filename="public/images/camarada-correndo.webp";
    expect(existsSync(filename)).toBe(true);
    const bytes=readFileSync(filename);
    expect(bytes.subarray(0,4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8,12).toString("ascii")).toBe("WEBP");
    expect(bytes.includes(Buffer.from("ANIM"))).toBe(true);
    expect(bytes.includes(Buffer.from("ANMF"))).toBe(true);
    expect(bytes.length).toBeGreaterThan(12000);
  });
  test("a tela contém a mensagem aprovada e Camarada em azul",()=>{
    const component=readFileSync("src/components/LoadingMascot.tsx","utf8");
    const css=readFileSync("src/components/loading-mascot.css","utf8");
    expect(component).toContain("Aguenta aí");
    expect(component).toContain("Camarada!");
    expect(component).toContain("biglogno-loading-blue");
    expect(css).toContain("#19bafb");
    expect(component).toContain("Tentar novamente");
  });
});
