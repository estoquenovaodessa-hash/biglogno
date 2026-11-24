import { describe, expect, test } from "bun:test";
import { formatarDiferencaAjuste, gerarPdfAjustesEstoque, linhasPdfAjustesEstoque, nomePdfAjustesEstoque } from "./pdf-ajustes-estoque";
import { parseAjusteEstoqueJson } from "./zona-segura-robo-json";

const origem = {
  enderecoBase: { atualizadoEm: "", registros: {
    "00475": { codigo: "00475", descricao: "PARAFUSO SEXTAVADO", endereco: "AR01E6" },
    "00123": { codigo: "00123", descricao: "ARRUELA ZINCADA", endereco: "BR03A1" },
  }},
  zonaSegura: [],
  items: [],
};

const exemplo = {
  versao: 1, rotina: "ajuste_estoque", data: "2026-11-17", total_registros: 3,
  registros: [
    {
      codigo: "00475", saldo_anterior: "-3", saldo_solicitado: "2", saldo_atual: "2",
      status: "divergente", ajuste_realizado: true,
      comando: "00475 a2", hora: "08:32:15",
    },
    {
      codigo: "00123", saldo_anterior: "5", saldo_solicitado: "5", saldo_atual: "5",
      status: "correto", ajuste_realizado: false,
      descricao: "ARRUELA RECEBIDA DO BOT", endereco: "BR09", horario: "09:01",
    },
    {
      codigo: "475", saldo_anterior: "2", saldo_solicitado: "0", saldo_atual: "0",
      status: "divergente", ajuste_realizado: true,
      comando_utilizado: "00475 z", data_hora: "2026-11-17T10:05:07-03:00",
    },
  ],
};

describe("Relatório PDF automático dos ajustes de estoque", () => {
  test("mantém todas as movimentações na ordem, embora a Zona Segura consolide só a última", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify(exemplo));
    expect(rel.registros.length).toBe(2);
    expect(rel.totalRegistrosOriginais).toBe(3);
    expect(rel.registrosSubstituidos).toBe(1);
    expect(rel.movimentacoes.map(m => [m.ordem, m.codigo, m.ultimaOcorrencia])).toEqual([
      [1, "00475", false], [2, "00123", true], [3, "00475", true],
    ]);
    const linhas = linhasPdfAjustesEstoque(rel, origem);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toEqual([
      "1", "2026-11-17", "08:32:15", "00475", "PARAFUSO SEXTAVADO", "AR01E6",
      "00475 a2", "-3", "2", "2", "+5", "Divergente", "Sim",
    ]);
    expect(linhas[1][4]).toBe("ARRUELA RECEBIDA DO BOT");
    expect(linhas[1][5]).toBe("BR09");
    expect(linhas[1][2]).toBe("09:01");
    expect(linhas[1][10]).toBe("0");
    expect(linhas[1][12]).toBe("Não");
    expect(linhas[2][2]).toBe("10:05:07");
    expect(linhas[2][6]).toBe("00475 z");
    expect(linhas[2][9]).toBe("0");
    expect(linhas[2][10]).toBe("-2");
    expect(nomePdfAjustesEstoque(rel)).toBe("ajustes-estoque-autcom-2026-11-17.pdf");
  });

  test("arquivo antigo sem comando e horário indica indisponibilidade, sem inventar informação", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify({
      ...exemplo, total_registros:1, registros:[{
        codigo: "00475", saldo_anterior:"7", saldo_solicitado:"3", saldo_atual:"3",
        status:"divergente", ajuste_realizado:true,
      }],
    }));
    const dados = linhasPdfAjustesEstoque(rel, origem);
    expect(dados[0][2]).toBe("Não informado");
    expect(dados[0][6]).toBe("Não informado");
    expect(dados[0][4]).toBe("PARAFUSO SEXTAVADO");
    expect(dados[0][10]).toBe("-4");
  });

  test("operações antigas substituídas aparecem na auditoria sem impedir a última válida", () => {
    const rel = parseAjusteEstoqueJson(JSON.stringify({
      ...exemplo, total_registros:2, registros:[
        {...exemplo.registros[0], saldo_anterior:"inválido", status:"antigo"},
        {...exemplo.registros[2]},
      ],
    }));
    expect(rel.registros).toHaveLength(1);
    expect(rel.movimentacoes).toHaveLength(2);
    expect(linhasPdfAjustesEstoque(rel, origem)[0][7]).toBe("inválido");
    expect(linhasPdfAjustesEstoque(rel, origem)[0][10]).toBe("Não informado");
    expect(linhasPdfAjustesEstoque(rel, origem)[0][11]).toBe("antigo");
    expect(rel.registros[0].saldoAtual).toBe(0);
  });

  test("diferença: entradas com +, saídas com -, sem alteração 0 e saldos negativos", () => {
    expect(formatarDiferencaAjuste("-3", "2")).toBe("+5");
    expect(formatarDiferencaAjuste("5", "2")).toBe("-3");
    expect(formatarDiferencaAjuste("5", "5")).toBe("0");
    expect(formatarDiferencaAjuste("-3", "-5")).toBe("-2");
    expect(formatarDiferencaAjuste("-5", "-3")).toBe("+2");
    expect(formatarDiferencaAjuste("1,5", "2,75")).toBe("+1,25");
    expect(formatarDiferencaAjuste("2.75", "1.5")).toBe("-1,25");
    expect(formatarDiferencaAjuste("1,1", "1,2")).toBe("+0,1");
    expect(formatarDiferencaAjuste("0", "0")).toBe("0");
    expect(formatarDiferencaAjuste("inválido", "2")).toBe("Não informado");
    expect(formatarDiferencaAjuste("5", "")).toBe("Não informado");
  });

  test("gera PDF A4 paisagem em múltiplas páginas com todas as linhas", () => {
    const quantidade = 130;
    const itens = Array.from({length: quantidade}, (_,i)=>({
      ...exemplo.registros[0], codigo:String(i + 1).padStart(5,"0"),
      descricao:"PEÇA INDUSTRIAL - " + "DESCRIÇÃO LONGA ".repeat(5),
    }));
    const rel = parseAjusteEstoqueJson(JSON.stringify({
      ...exemplo, total_registros: quantidade, registros:itens,
    }));
    const pdf = gerarPdfAjustesEstoque(rel, origem);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(297,0);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(210,0);
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(5000);
    expect(linhasPdfAjustesEstoque(rel, origem)).toHaveLength(quantidade);
  });
});