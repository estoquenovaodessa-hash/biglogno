import { useCallback, useEffect, useState } from "react";
import { cloudGetAll, cloudSet, subscribeCloud } from "./cloudState";
import type { LinhaDivergencia } from "./pdfDivergencias";
import type { EnderecoBase } from "./types";

export type TipoCiclo = "apuracao" | "padrao";
export type TipoSelecao = "linha" | "grupo";
export interface SelecaoContagem { tipo: TipoSelecao; valor: string; total: number }

const normalizarBusca = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

export function listarSelecoes(base: EnderecoBase, tipo: TipoSelecao, busca: string): SelecaoContagem[] {
  const totais = new Map<string, number>();
  for (const item of Object.values(base.registros)) {
    const valor = item[tipo]?.trim();
    if (valor) totais.set(valor, (totais.get(valor) ?? 0) + 1);
  }
  const q = normalizarBusca(busca);
  return [...totais].filter(([valor]) => normalizarBusca(valor).includes(q))
    .map(([valor, total]) => ({ tipo, valor, total }))
    .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true }));
}

export function itensDaSelecao(base: EnderecoBase, selecao: SelecaoContagem) {
  return Object.values(base.registros).filter((item) => item[selecao.tipo]?.trim() === selecao.valor);
}

export interface CicloItem {
  codigo: string;
  descricao: string;
  endereco: string;
  saldo: number;
  contagem: number | null;
  diferenca: number;
  custo: number;
  vrDiferenca: number;
}

export interface Ciclo {
  id: string;
  tipo: TipoCiclo;
  numero: number;
  titulo: string;
  criadoEm: string;
  status: "aberto" | "finalizado";
  finalizadoEm?: string;
  comDivergencia?: boolean;
  itens: CicloItem[];
  enviadoZona: boolean;
  enviadoEm?: string;
  selecao?: SelecaoContagem;
}

const KEY = "ciclos-contagem";

export const tituloCiclo = (tipo: TipoCiclo, n: number) =>
  `${tipo === "apuracao" ? "Apuração" : "Padrão"} NR ${n}`;

export const proximoNumero = (ciclos: Ciclo[], tipo: TipoCiclo) =>
  ciclos.filter((c) => c.tipo === tipo).reduce((m, c) => Math.max(m, c.numero), 0) + 1;

export const podeCriar = (ciclos: Ciclo[], tipo: TipoCiclo) =>
  !ciclos.some((c) => c.tipo === tipo && c.status === "aberto");

export const excluirCiclo = (ciclos: Ciclo[], id: string) =>
  ciclos.filter((c) => c.id !== id);

// Finaliza: sem PDF, todos corretos (contagem = saldo). Com PDF, aplica as diferenças.
export function aplicarFinalizacao(c: Ciclo, linhas: LinhaDivergencia[] | null): Ciclo {
  const map = new Map((linhas ?? []).map((l) => [l.codigo, l]));
  const itens: CicloItem[] = c.itens.map((i) => {
    const l = map.get(i.codigo);
    map.delete(i.codigo);
    return l
      ? { ...i, saldo: l.saldo, contagem: l.contagem, diferenca: l.diferenca, custo: l.custo, vrDiferenca: l.vrDiferenca }
      : { ...i, contagem: i.saldo, diferenca: 0, vrDiferenca: 0 };
  });
  for (const l of map.values())
    itens.push({ codigo: l.codigo, descricao: l.descricao, endereco: "", saldo: l.saldo, contagem: l.contagem, diferenca: l.diferenca, custo: l.custo, vrDiferenca: l.vrDiferenca });
  return { ...c, itens, status: "finalizado", finalizadoEm: new Date().toISOString(), comDivergencia: !!linhas?.length };
}

export function metricasCiclo(c: Ciclo) {
  const total = c.itens.length;
  const div = c.itens.filter((i) => i.diferenca !== 0).length;
  const sobra = c.itens.reduce((s, i) => s + (i.diferenca > 0 ? i.diferenca : 0), 0);
  const falta = c.itens.reduce((s, i) => s + (i.diferenca < 0 ? i.diferenca : 0), 0);
  const valor = c.itens.reduce((s, i) => s + i.vrDiferenca, 0);
  return {
    total,
    divergentes: div,
    corretos: total - div,
    acuracidade: total ? ((total - div) / total) * 100 : 0,
    sobra,
    falta,
    saldoAbs: sobra - falta,
    valor,
  };
}

export function useCiclos() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void cloudGetAll().then((data) => {
      if (!alive) return;
      if (Array.isArray(data[KEY])) setCiclos(data[KEY] as Ciclo[]);
      setReady(true);
    });
    const stop = subscribeCloud((key, value) => {
      if (alive && key === KEY && Array.isArray(value)) setCiclos(value as Ciclo[]);
    });
    return () => { alive = false; stop(); };
  }, []);

  const salvar = useCallback((next: Ciclo[]) => {
    setCiclos(next);
    cloudSet(KEY, next);
  }, []);

  return { ciclos, ready, salvar };
}
