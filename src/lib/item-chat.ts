import { z } from "zod";

export const chatCommandSchema = z.string().trim().min(5).max(140);
export type ItemOccurrence = {
  id: string;
  codigo: string;
  descricao: string;
  endereco: string;
  motivo: string;
  criado_por_id: string;
  criado_por_nome: string;
  criado_em: string;
  resolvido_por_id: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  // null somente em registros legados ou ainda não resolvidos.
  enviado_zona_segura: boolean | null;
};
/**
 * Comandos aceitos (entre outros):
 * 00519-furo, 519-furo, 519 - furo, 519 furo, 519:furo,
 * 519/furo, 519furo, Código 519 - Furo, 519 - motivo: estoque errado.
 *
 * Só os algarismos iniciais representam o código. Zeros à esquerda são
 * ignorados, mas o código real não pode superar 5 dígitos.
 */
export function parseChatCommand(command: string) {
  const cleaned = command
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .trim();

  // Rótulos são opcionais e não fazem parte da identificação do item.
  const withoutLabel = cleaned
    .replace(/^(?:c[oó]d(?:igo)?|item|produto|sku)\s*(?:n[º°.]?\s*)?[:#=–—-]?\s*/iu, "")
    .replace(/^#\s*/u, "");

  const match = /^(\d+)([\s\S]*)$/u.exec(withoutLabel);
  if (!match) {
    throw new Error("Comece com o código do item. Ex.: 519-furo ou 519 - furo.");
  }

  const withoutZeros = match[1].replace(/^0+/, "") || "0";
  if (withoutZeros.length > 5) {
    throw new Error("O código do item deve ter no máximo 5 dígitos.");
  }

  // Aceita hífen (e suas variantes), espaço, dois-pontos, barra, vírgula
  // e até código colado diretamente ao motivo, como 519furo.
  const motivo = match[2]
    .trim()
    .replace(/^(?:[-‐‑‒–—−﹣－:：=|｜/\\;,，.·•()[\]{}]+\s*)+/u, "")
    .replace(/^(?:motivo|ocorr[eê]ncia)\s*(?:[:=–—-]+\s*)?/iu, "")
    .replace(/^[\s"'“”‘’([{]+|[\s"'“”‘’)\]}]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (motivo.length < 3 || motivo.length > 100 || !/\p{L}/u.test(motivo)) {
    throw new Error("Informe o motivo após o código (mínimo de 3 caracteres). Ex.: 519-furo.");
  }

  return { codigo: withoutZeros.padStart(5, "0"), motivo };
}
