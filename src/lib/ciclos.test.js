import { describe, expect, mock, test } from "bun:test";

mock.module("./cloudState", () => ({ cloudGetAll: async () => ({}), cloudSet: () => {}, subscribeCloud: () => () => {} }));
const { excluirCiclo, podeCriar, listarSelecoes, itensDaSelecao } = await import("./ciclos");

const ciclo = (id, tipo, status = "aberto") => ({
  id, tipo, numero: 1, titulo: id, criadoEm: "2026-10-17T12:02:00Z", status, itens: [], enviadoZona: false,
});

describe("contagem por linha ou grupo", () => {
  const base = { atualizadoEm: "", registros: {
    "00001": { codigo: "00001", descricao: "A", linha: "001.000 - AÇO", grupo: "010 - Ferramentas" },
    "00002": { codigo: "00002", descricao: "B", linha: "001.000 - AÇO", grupo: "020 - Peças" },
    "00003": { codigo: "00003", descricao: "C", linha: "002.000 - Outra", grupo: "010 - Ferramentas" },
    "00004": { codigo: "00004", descricao: "D" },
  } };
  test("pesquisa linha pelo nome sem acento e por código", () => {
    expect(listarSelecoes(base, "linha", "aco")).toEqual([{ tipo: "linha", valor: "001.000 - AÇO", total: 2 }]);
    expect(listarSelecoes(base, "linha", "001.000")[0].total).toBe(2);
  });
  test("pesquisa grupo pelo nome e por código", () => {
    expect(listarSelecoes(base, "grupo", "ferramentas")[0].total).toBe(2);
    expect(listarSelecoes(base, "grupo", "020")[0].valor).toBe("020 - Peças");
  });
  test("inclui todos e somente os produtos da linha selecionada", () => {
    expect(itensDaSelecao(base, listarSelecoes(base, "linha", "001")[0]).map(i => i.codigo)).toEqual(["00001", "00002"]);
  });
  test("grupo reúne produtos de linhas diferentes sem alterar a base", () => {
    expect(itensDaSelecao(base, listarSelecoes(base, "grupo", "010")[0]).map(i => i.codigo)).toEqual(["00001", "00003"]);
    expect(Object.keys(base.registros)).toHaveLength(4);
  });
  test("ciclo por seleção ocupa o mesmo tipo Padrão", () => {
    const selecionado = { ...ciclo("linha", "padrao"), selecao: { tipo: "linha", valor: "001.000 - AÇO", total: 2 } };
    expect(podeCriar([selecionado], "padrao")).toBe(false);
    expect(podeCriar([selecionado], "apuracao")).toBe(true);
  });
});

describe("exclusão de ciclo", () => {
  test("remove somente o ciclo escolhido sem alterar a lista original", () => {
    const ciclos = [ciclo("apuracao", "apuracao"), ciclo("padrao", "padrao")];
    expect(excluirCiclo(ciclos, "apuracao")).toEqual([ciclos[1]]);
    expect(ciclos).toHaveLength(2);
  });
  test("libera a criação do tipo cancelado e mantém o outro bloqueado", () => {
    const ciclos = excluirCiclo([ciclo("a", "apuracao"), ciclo("p", "padrao")], "a");
    expect(podeCriar(ciclos, "apuracao")).toBe(true);
    expect(podeCriar(ciclos, "padrao")).toBe(false);
  });
  test("permite excluir um ciclo finalizado e já enviado", () => {
    const enviado = { ...ciclo("a", "apuracao", "finalizado"), enviadoZona: true };
    expect(excluirCiclo([enviado], "a")).toEqual([]);
    expect(enviado.enviadoZona).toBe(true);
  });
});