import Papa from "papaparse";
import type {
  RawMovimento,
  EnderecoRecord,
  BarcodeRecord,
  BarcodesBase,
  ContagemItem,
} from "./types";

// Lê o arquivo tentando UTF-8 e caindo para Windows-1252/Latin-1.
export async function readFileSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return utf8;
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(buf);
    } catch {
      return new TextDecoder("latin1").decode(buf);
    }
  }
}

// Converte número no padrão brasileiro: "1.014,69" -> 1014.69 ; "29,38" -> 29.38
export function parseBRNumber(value: string | undefined | null): number {
  if (value == null) return 0;
  let s = value.toString().trim();
  if (!s) return 0;
  s = s.replace(/\s/g, "").replace(/r\$/i, "");
  const neg = s.includes("-") || /\(.*\)/.test(s);
  s = s.replace(/[()]/g, "").replace(/-/g, "");
  // remove separador de milhar (ponto) e troca decimal (vírgula) por ponto
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  s = s.replace(/[^0-9.]/g, "");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

function normCodigo(value: string | undefined | null): string {
  let s = (value ?? "").toString().trim();
  s = s.replace(/\.0+$/, ""); // caso excel tenha exportado como número
  return s;
}

function normBarcode(value: string | undefined | null): string {
  return (value ?? "").toString().replace(/\D/g, "");
}

const HEADER_HINT = "CÓDIGO";

// Acha a linha de cabeçalho real do relatório CURVA ABC.
function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const up = lines[i].toUpperCase();
    if (up.startsWith(HEADER_HINT) && up.includes("DESCRI")) return i;
  }
  return -1;
}

export interface MovimentoParseResult {
  itens: RawMovimento[];
  totalLinhas: number;
  ignoradas: number;
}

// Faz o parsing do relatório de movimentação (CURVA ABC DE PRODUTOS VENDAS).
export function parseMovimento(text: string): MovimentoParseResult {
  const allLines = text.split(/\r?\n/);
  const headerIdx = findHeaderIndex(allLines);
  if (headerIdx < 0) {
    return { itens: [], totalLinhas: 0, ignoradas: allLines.length };
  }
  const tableText = allLines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<string[]>(tableText, {
    delimiter: ";",
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  const header = (rows[0] || []).map((h) => h.trim().toUpperCase());

  // Mapeia índices das colunas pelo nome
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.replace(/\s+/g, " ").includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iCod = idx("CÓDIGO", "CODIGO");
  const iDesc = idx("DESCRIÇÃO DO PRODUTO", "DESCRICAO", "DESCRI");
  const iRef = idx("REFERÊNCIA", "REFERENCIA");
  const iUn = idx("UN.", "UN");
  const iEstq = idx("QTD.ESTQ", "QTD. ESTQ", "QTD ESTQ", "ESTQ");
  const iFatur = idx("QTD. FATUR", "QTD.FATUR", "FATUR");
  const iLitros = idx("LITROS");
  const iKilos = idx("KILOS", "QUILOS");
  const iAcum = idx("ACUM. %", "ACUM", "ACUM.%");

  const itens: RawMovimento[] = [];
  let ignoradas = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) {
      ignoradas++;
      continue;
    }
    const codigo = normCodigo(row[iCod]);
    const descricao = (row[iDesc] ?? "").toString().trim();
    if (!codigo || !descricao) {
      ignoradas++;
      continue;
    }
    // Pula linhas de totalização
    if (/^total/i.test(codigo) || /^total/i.test(descricao)) {
      ignoradas++;
      continue;
    }
    itens.push({
      codigo,
      descricao,
      referencia: (row[iRef] ?? "").toString().trim(),
      unidade: (row[iUn] ?? "").toString().trim(),
      qtdEstoque: parseBRNumber(row[iEstq]),
      qtdMovimentada: parseBRNumber(row[iFatur]),
      litros: iLitros >= 0 ? parseBRNumber(row[iLitros]) : 0,
      kilos: iKilos >= 0 ? parseBRNumber(row[iKilos]) : 0,
      acumPct: iAcum >= 0 ? parseBRNumber(row[iAcum]) : 0,
    });
  }

  return { itens, totalLinhas: rows.length - 1, ignoradas };
}

// Faz o parsing da Base de Endereços. Aceita:
//  a) formato antigo: codigo;descricao;endereco
//  b) formato novo (Contagem de Estoque): LINHA;GRUPO;CÓDIGO;DESCRIÇÃO;UN.;REFERÊNCIA;LOC.FÍSICA;SALDO;...
//     — as demais colunas (UN., REFERÊNCIA, SALDO, etc.) são ignoradas.
export function parseEnderecos(text: string): EnderecoRecord[] {
  const lines = text.split(/\r?\n/);
  // Localiza a linha real de cabeçalho (contém CÓDIGO e DESCRIÇÃO)
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const up = lines[i].toUpperCase();
    if (/(^|;)"?C(Ó|O)DIGO"?(;|$)/.test(up) && up.includes("DESCRI")) {
      headerIdx = i;
      break;
    }
  }
  const tableText = lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(tableText, {
    delimiter: ";",
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) =>
      h.trim().toLowerCase().replace(/["']/g, "").replace(/\./g, "").replace(/\s+/g, ""),
  });

  const pick = (row: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null && v.toString().trim()) return v.toString().trim();
    }
    return "";
  };

  const out: EnderecoRecord[] = [];
  for (const row of parsed.data) {
    const codigo = normCodigo(pick(row, "codigo", "código"));
    if (!codigo) continue;
    out.push({
      codigo,
      descricao: pick(row, "descrição", "descricao", "descriçãodoproduto"),
      endereco: pick(row, "locfísica", "locfisica", "endereco", "endereço", "localização", "localizacao"),
      linha: pick(row, "linha"),
      grupo: pick(row, "grupo"),
      fornecedor: pick(row, "fornecedor", "fonecedor"),
    });
  }
  return out;
}

// Faz o parsing da planilha PRODUTOS (base de códigos de barras).
// Formato: CÓDIGO;DESCRIÇÃO;REFERÊNCIA;...;CÓD. BARRAS;...
// A coluna CÓD. BARRAS pode conter vários códigos separados por "|" (ex: "| 7891040004973 | 47891040004971 |").
export function parseBarcodes(text: string, nomeArquivo: string): BarcodesBase {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const up = lines[i].toUpperCase();
    if (/(^|;)"?C(Ó|O)DIGO"?(;|$)/.test(up) && up.includes("BARRAS")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { registros: {}, porBarcode: {}, nomeArquivo, atualizadoEm: new Date().toISOString() };
  }
  const tableText = lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(tableText, {
    delimiter: ";",
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) =>
      h.trim().toLowerCase().replace(/["']/g, "").replace(/\./g, "").replace(/\s+/g, ""),
  });

  const pick = (row: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null && v.toString().trim()) return v.toString().trim();
    }
    return "";
  };

  const registros: Record<string, BarcodeRecord> = {};
  const porBarcode: Record<string, string> = {};

  for (const row of parsed.data) {
    const codigo = normCodigo(pick(row, "codigo", "código"));
    if (!codigo) continue;
    const descricao = pick(row, "descrição", "descricao");
    const fornecedor = pick(row, "fornecedor", "fonecedor");
    const barrasRaw = pick(row, "cdbarras", "códbarras", "codbarras", "cbarras", "barras");
    const barcodes = Array.from(
      new Set(
        barrasRaw
          .split("|")
          .map(normBarcode)
          .filter((b) => /^\d{4,}$/.test(b)),
      ),
    );
    registros[codigo] = { codigo, descricao, barcodes, fornecedor: fornecedor || undefined };
    for (const b of barcodes) porBarcode[b] = codigo;
  }

  return {
    registros,
    porBarcode,
    nomeArquivo,
    atualizadoEm: new Date().toISOString(),
  };
}

// Faz o parsing da planilha CONTAGEM DE ESTOQUE.
// Formato: LINHA;GRUPO;CÓDIGO;DESCRIÇÃO;UN.;REFERÊNCIA;LOC.FÍSICA;SALDO;...
export function parseContagem(text: string): ContagemItem[] {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const up = lines[i].toUpperCase();
    if (up.includes("CÓDIGO") && up.includes("SALDO")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const tableText = lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(tableText, {
    delimiter: ";",
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) =>
      h.trim().toLowerCase().replace(/["']/g, "").replace(/\./g, "").replace(/\s+/g, ""),
  });

  const pick = (row: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null && v.toString().trim()) return v.toString().trim();
    }
    return "";
  };

  const out: ContagemItem[] = [];
  for (const row of parsed.data) {
    const codigo = normCodigo(pick(row, "codigo", "código"));
    if (!codigo) continue;
    const descricao = pick(row, "descrição", "descricao");
    const endereco = pick(row, "locfísica", "locfisica", "endereco", "endereço");
    const linha = pick(row, "linha");
    const grupo = pick(row, "grupo");
    const saldo = parseBRNumber(pick(row, "saldo"));
    out.push({
      codigo,
      descricao,
      endereco,
      linha,
      grupo,
      saldo,
      contado: 0,
      bipado: false,
    });
  }
  return out;
}

