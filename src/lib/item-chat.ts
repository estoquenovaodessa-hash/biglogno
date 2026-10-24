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
};
export function parseChatCommand(command: string) {
  const match = /^\s*(\d{1,5})\s*[-–—]\s*(.{3,100})\s*$/u.exec(command);
  if (!match) throw new Error('Digite no formato: 519 - furo');
  const codigo = match[1].padStart(5, '0');
  const motivo = match[2].trim().replace(/\s+/g, " ");
  if (!motivo || motivo.length > 100) throw new Error("Informe o motivo da ocorrência.");
  return { codigo, motivo };
}
