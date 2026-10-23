// Domain types for Monitor ABC de Movimentos — Bignotto

export type Bloco = "A" | "B" | "";

export interface ParsedAddress {
  bloco: Bloco;
  blocoNome: string;
  rua: number;
  letra: string;
  nivel: number;
  enderecoOriginal: string;
  enderecoNormalizado: string;
  valido: boolean;
}

export type EnderecoStatus =
  | "ok"
  | "nao_localizado"
  | "sem_endereco"
  | "invalido";

export interface EnderecoRecord {
  codigo: string;
  descricao: string;
  endereco: string;
  linha?: string;
  grupo?: string;
  fornecedor?: string;
}

export interface EnderecoBase {
  registros: Record<string, EnderecoRecord>; // por código
  atualizadoEm: string;
}


export type CurvaOperacional = "A" | "B" | "C" | "Devolução/Ajuste";

export type StatusEstoque =
  | "Sem estoque"
  | "Estoque baixo"
  | "Estoque adequado"
  | "Estoque parado"
  | "Venda/saída com possível ruptura"
  | "Devolução/Ajuste"
  | "Logística reversa"
  | "Estoque negativo";

export type PrioridadeLabel =
  | "Crítico"
  | "Alta prioridade"
  | "Monitorar"
  | "Atenção baixa"
  | "Sem ação imediata";

export type CategoriaAlerta =
  | "Crítico"
  | "Risco de ruptura"
  | "Estoque zerado"
  | "Estoque negativo"
  | "Devolução/Ajuste"
  | "Logística reversa"
  | "Estoque parado"
  | "Conferência manual"
  | "Reincidência";

export type StatusConferencia =
  | "Pendente"
  | "Conferido"
  | "Divergente"
  | "Corrigido no ERP"
  | "Aguardando compra"
  | "Aguardando devolução";

export interface RawMovimento {
  codigo: string;
  descricao: string;
  referencia: string;
  unidade: string;
  qtdEstoque: number;
  qtdMovimentada: number; // QTD. FATUR
  litros: number;
  kilos: number;
  acumPct: number;
}

export interface AnalyzedItem extends RawMovimento {
  endereco: string;
  enderecoStatus: EnderecoStatus;
  enderecoMotivo: string;
  parsed: ParsedAddress;
  bloco: Bloco;
  rua: number;
  curva: CurvaOperacional;
  giroFisico: number;
  coberturaFisica: number;
  status: StatusEstoque;
  score: number;
  prioridade: PrioridadeLabel;
  categoria: CategoriaAlerta;
  acaoSugerida: string;
  tipoErro: string; // chave técnica do erro
  reincidente: boolean;
  reincidenciaCount: number;
  ultimaCorrecao: string | null;
  tratadoNoDia: boolean;
  horarioTratado: string | null;
  noRoteiro: boolean;
  linha?: string;
  grupo?: string;
}


export interface ImportRecord {
  id: string;
  data: string; // ISO datetime
  nomeArquivo: string;
  totalItens: number;
  itensCriticos: number;
  ruptura: number;
  negativos: number;
  zerados: number;
  devolucoes: number;
  semEndereco: number;
  reincidencias: number;
  movidos?: { c: string; d: string }[];
  erros?: { c: string; t: "Z" | "N" | "B" }[];
  dataRef?: string;
}

export type MotivoAcuracidade = "" | "Divergente" | "Correto";

export interface ConferenciaState {
  status: StatusConferencia;
  motivo: MotivoAcuracidade;
  observacao: string;
  atualizadoEm: string;
}

export interface ZonaSeguraRecord {
  codigo: string;
  descricao: string;
  endereco: string;
  bloco: string;
  rua: string;
  curvaOperacional: string;
  categoriaOriginal: string;
  tipoErro: string;
  estoqueNaCorrecao: number;
  quantidadeMovimentadaNaCorrecao: number;
  acaoRealizada: string;
  status: string;
  observacao: string;
  dataCorrecao: string;
  horaCorrecao: string;
  dataImportacaoOriginal: string;
  importacaoId: string;
  quantidadeCorrecoes: number;
  quantidadeReincidencias: number;
  ultimaReincidencia: string | null;
  ultimaDataReferencia?: string | null; // última data de planilha que gerou reincidência
  linha?: string;
  grupo?: string;
}


export interface ResolvidoNoDia {
  chave: string;
  data: string;
  codigo: string;
  descricao: string;
  endereco: string;
  tipoErro: string;
  status: string;
  observacao: string;
  horarioTratamento: string;
  importacaoId: string;
}

// === Contagem por bipagem (Conferência Manual) ===

export interface BarcodeRecord {
  codigo: string;
  descricao: string;
  endereco?: string;
  fornecedor?: string;
  barcodes: string[];
}

export interface BarcodesBase {
  registros: Record<string, BarcodeRecord>; // por código
  porBarcode: Record<string, string>; // barcode -> codigo
  nomeArquivo: string;
  atualizadoEm: string;
}

export interface ContagemItem {
  codigo: string;
  descricao: string;
  endereco: string;
  linha?: string;
  grupo?: string;
  saldo: number; // qtd. que consta
  contado: number; // qtd. bipada
  bipado: boolean;
}

export interface ContagemAtual {
  nomeArquivo: string;
  atualizadoEm: string;
  itens: ContagemItem[];
}
