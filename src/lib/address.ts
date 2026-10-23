import type { ParsedAddress, Bloco } from "./types";

// Normaliza e interpreta um endereço físico do estoque.
// Formato: [A|B]R<rua><letra><nivel>  ex: AR09E5, BR05F4
export function parseAddress(raw: string | undefined | null): ParsedAddress {
  const original = (raw ?? "").toString();
  const cleaned = original.replace(/\s+/g, "").toUpperCase();

  const empty: ParsedAddress = {
    bloco: "",
    blocoNome: "",
    rua: 0,
    letra: "",
    nivel: 0,
    enderecoOriginal: original,
    enderecoNormalizado: "",
    valido: false,
  };

  if (!cleaned) return empty;

  // Espera: letra de bloco (A/B) + R + dígitos(rua) e, opcionalmente,
  // letra(posição) + dígitos(nível). Endereços curtos como "BR15" (só
  // bloco + rua) também são válidos.
  const match = cleaned.match(/^([AB])R(\d{1,3})([A-Z])?(\d{1,3})?$/);
  if (!match) return { ...empty, enderecoOriginal: original };

  const bloco = match[1] as Bloco;
  const rua = parseInt(match[2], 10);
  const letra = match[3] ?? "";
  const nivel = match[4] ? parseInt(match[4], 10) : 0;

  if (Number.isNaN(rua)) return empty;

  const ruaStr = String(rua).padStart(2, "0");
  const normalizado = `${bloco}R${ruaStr}${letra}${match[4] ? nivel : ""}`;

  return {
    bloco,
    blocoNome: bloco === "A" ? "Bloco A" : "Bloco B",
    rua,
    letra,
    nivel,
    enderecoOriginal: original,
    enderecoNormalizado: normalizado,
    valido: true,
  };
}

// Chave de ordenação operacional (caminhada física):
// Bloco A antes de B, depois rua, letra, nível.
export function addressSortKey(p: ParsedAddress): number[] {
  if (!p.valido) return [9, 999, 999, 999];
  const blocoRank = p.bloco === "A" ? 0 : 1;
  const letraRank = p.letra ? p.letra.charCodeAt(0) : 999;
  return [blocoRank, p.rua, letraRank, p.nivel];
}

export function compareAddress(a: ParsedAddress, b: ParsedAddress): number {
  const ka = addressSortKey(a);
  const kb = addressSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}
