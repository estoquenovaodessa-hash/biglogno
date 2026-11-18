import { describe, expect, test } from "bun:test";
import { aplicarAjusteEstoqueJson, parseAjusteEstoqueJson } from "./zona-segura-robo-json";

const exemplo = {
  versao: 1,
  rotina: "ajuste_estoque",
  data: "2026-11-17",
  total_registros: 2,
  registros: [
    { codigo: "00475", saldo_anterior: "-3", saldo_solicitado: "2", saldo_atual: "2",
      status: "divergente", ajuste_realizado: true },
    { codigo: "00123", saldo_anterior: "5", saldo_solicitado: "5", saldo_atual: "5",
      status: "correto", ajuste_realizado: false },
  ],
};
const base = { atualizadoEm: "2026-11-01T10:00:00.000Z", registros: {
  "00475": { codigo: "00475", descricao: "FITA", endereco: "AR01A1" },
  "00123": { codigo: "00123", descricao: "PORCA", endereco: "BR02" },
}};
const agora = { iso: "2026-11-17T20:01:00.000Z", hora: "17:01" };

describe("Importação JSON do robô na Zona Segura", () => {
  test("interpreta relatório fornecido, preserva zeros à esquerda e a classificação original", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify(exemplo));
    expect(rel.data).toBe("2026-11-17");
    expect(rel.registros).toHaveLength(2);
    expect(rel.registros[0]).toEqual({
      codigo:"00475", saldoAnterior:-3, saldoSolicitado:2, saldoAtual:2,
      status:"divergente", ajusteRealizado:true,
    });
    expect(rel.registros[1].status).toBe("correto");
  });
  test("permite colar JSON com BOM e normaliza códigos curtos", () => {
    const json = { ...exemplo, total_registros: 1, registros: [
      {...exemplo.registros[0], codigo:"475", saldo_atual:"2,5"},
    ]};
    const rel = parseAjusteEstoqueJson("\uFEFF" + JSON.stringify(json));
    expect(rel.registros[0].codigo).toBe("00475");
    expect(rel.registros[0].saldoAtual).toBe(2.5);
  });
  test("falha sem gravar nada se o arquivo tiver contagem incorreta ou dados malformados", () => {
    const invalido = [
      { ...exemplo, total_registros: 3 },
      { ...exemplo, data: "2026-02-30" },
      { ...exemplo, rotina: "outra_rotina" },
      { ...exemplo, registros: [{...exemplo.registros[0], saldo_anterior: "invalido"}], total_registros:1 },
      { ...exemplo, registros: [{...exemplo.registros[0], ajuste_realizado:"true"}], total_registros:1 },
      { ...exemplo, registros: [{...exemplo.registros[0], status:"alterado"}], total_registros:1 },
      { ...exemplo, registros: [{...exemplo.registros[0], codigo:475}], total_registros:1 },
    ];
    for (const item of invalido) expect(() => parseAjusteEstoqueJson(JSON.stringify(item))).toThrow();
    expect(() => parseAjusteEstoqueJson("{incompleto")).toThrow();
  });
  test("mantém apenas a última ocorrência por código e respeita a ordem final do JSON", () => {
    const json = {
      ...exemplo,
      total_registros: 5,
      registros: [
        { ...exemplo.registros[0], saldo_anterior: "-3", status: "divergente" },
        exemplo.registros[1],
        { ...exemplo.registros[0], codigo: "00475", saldo_anterior: "4", saldo_atual: "4", status: "correto", ajuste_realizado: false },
        { ...exemplo.registros[1], codigo: "00710", saldo_atual: "8" },
        { ...exemplo.registros[0], codigo: "475", saldo_anterior: "9", saldo_solicitado: "11", saldo_atual: "11", status: "divergente", ajuste_realizado: true },
      ],
    };
    const rel = parseAjusteEstoqueJson(JSON.stringify(json));
    expect(rel.totalRegistrosOriginais).toBe(5);
    expect(rel.registrosSubstituidos).toBe(2);
    expect(rel.registros.map(r => r.codigo)).toEqual(["00123", "00710", "00475"]);
    expect(rel.registros.find(r => r.codigo === "00475")).toMatchObject({
      saldoAnterior: 9, saldoSolicitado: 11, saldoAtual: 11,
      status: "divergente", ajusteRealizado: true,
    });

    const gravado = aplicarAjusteEstoqueJson(rel, [], {}, base, [], agora);
    expect(gravado.adicionados).toBe(3);
    expect(gravado.zonaSegura).toHaveLength(3);
    expect(gravado.zonaSegura.find(r => r.codigo === "00475")?.estoqueNaCorrecao).toBe(11);
    expect(gravado.zonaSegura.find(r => r.codigo === "00475")?.quantidadeCorrecoes).toBe(1);

    const repetido = aplicarAjusteEstoqueJson(rel, gravado.zonaSegura, gravado.conferencia, base, [], agora);
    expect(repetido.ignorados).toBe(3);
    expect(repetido.zonaSegura.find(r => r.codigo === "00475")?.quantidadeCorrecoes).toBe(1);
  });
  test("valida total_registros pelo array original, não pelo número de códigos únicos", () => {
    const json = { ...exemplo, registros: [exemplo.registros[0], exemplo.registros[1], exemplo.registros[0]] };
    expect(() => parseAjusteEstoqueJson(JSON.stringify(json))).toThrow("total_registros");
    const valido = parseAjusteEstoqueJson(JSON.stringify({...json, total_registros: 3}));
    expect(valido.registros).toHaveLength(2);
    expect(valido.registrosSubstituidos).toBe(1);
  });
  test("registros anteriores substituídos não bloqueiam a importação por saldos antigos inválidos", () => {
    const json = {
      ...exemplo, total_registros: 2,
      registros: [
        { ...exemplo.registros[0], saldo_anterior: "erro", status: "desatualizado" },
        { ...exemplo.registros[0], saldo_anterior: "10", saldo_atual: "7" },
      ],
    };
    const rel = parseAjusteEstoqueJson(JSON.stringify(json));
    expect(rel.registros).toHaveLength(1);
    expect(rel.registros[0].saldoAnterior).toBe(10);
    expect(rel.registros[0].saldoAtual).toBe(7);
  });
  test("a última ocorrência precisa ter saldos e status válidos", () => {
    const json = {
      ...exemplo, total_registros: 2,
      registros: [
        exemplo.registros[0],
        { ...exemplo.registros[0], saldo_atual: "inválido" },
      ],
    };
    expect(() => parseAjusteEstoqueJson(JSON.stringify(json))).toThrow("saldo_atual");
  });
  test("grava resultados e metadados, mas não altera a base de endereços ou o ERP", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify(exemplo));
    const resultado = aplicarAjusteEstoqueJson(rel, [], {}, base, [], agora);
    expect(resultado.adicionados).toBe(2);
    expect(resultado.atualizados).toBe(0);
    expect(resultado.zonaSegura.map(r=>r.codigo)).toEqual(["00475","00123"]);
    const a = resultado.zonaSegura[0];
    expect(a.descricao).toBe("FITA");
    expect(a.endereco).toBe("AR01A1");
    expect(a.estoqueNaCorrecao).toBe(2);
    expect(a.status).toBe("Divergente");
    expect(a.dataCorrecao).toBe("2026-11-17");
    expect(a.ajusteEstoqueRobo).toMatchObject({saldoAnterior:-3,saldoSolicitado:2,saldoAtual:2,ajusteRealizado:true});
    expect(resultado.zonaSegura[1].status).toBe("Correto");
    expect(resultado.conferencia["00475"].motivo).toBe("Divergente");
    expect(resultado.conferencia["00123"].motivo).toBe("Correto");
    expect(base.registros["00475"].descricao).toBe("FITA");
  });
  test("mesma importação duas vezes não incrementa correções nem regrava acuracidade", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify(exemplo));
    const primeiro = aplicarAjusteEstoqueJson(rel, [], {}, base, [], agora);
    const segundo = aplicarAjusteEstoqueJson(rel, primeiro.zonaSegura, primeiro.conferencia, base, [], agora);
    expect(segundo.ignorados).toBe(2);
    expect(segundo.adicionados + segundo.atualizados).toBe(0);
    expect(segundo.zonaSegura[0].quantidadeCorrecoes).toBe(1);
    expect(segundo.conferencia).toEqual(primeiro.conferencia);
  });
  test("revisão posterior atualiza o item por código e mantém histórico de reincidências", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify(exemplo));
    const antigo = aplicarAjusteEstoqueJson(rel, [], {}, base, [], agora);
    const revisao = parseAjusteEstoqueJson(JSON.stringify({
      ...exemplo, total_registros:1,
      registros:[{...exemplo.registros[0],saldo_atual:"4",status:"correto"}],
    }));
    const anterior = antigo.zonaSegura.map(z => z.codigo === "00475"
      ? {...z, quantidadeReincidencias:3} : z);
    const atualizado = aplicarAjusteEstoqueJson(revisao, anterior, antigo.conferencia, base, [], agora);
    expect(atualizado.atualizados).toBe(1);
    expect(atualizado.zonaSegura[0].quantidadeCorrecoes).toBe(2);
    expect(atualizado.zonaSegura[0].quantidadeReincidencias).toBe(3);
    expect(atualizado.conferencia["00475"].motivo).toBe("Correto");
  });
  test("arquivo antigo não apaga correção mais recente", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify(exemplo));
    const primeiro = aplicarAjusteEstoqueJson(rel, [], {}, base, [], agora);
    const alterados = primeiro.zonaSegura.map(z=>({...z, dataCorrecao:"2026-11-18"}));
    const segundo = aplicarAjusteEstoqueJson(rel, alterados, primeiro.conferencia, base, [], agora);
    expect(segundo.ignorados).toBe(2);
    expect(segundo.zonaSegura).toEqual(alterados);
  });
});