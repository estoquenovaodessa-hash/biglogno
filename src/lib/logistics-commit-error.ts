/** Mensagens objetivas para erros do RPC compartilhado de Retira e Entregas. */
type CommitError = {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

export function logisticsCommitError(action: string, error: CommitError): Error {
  console.error(`[Logística] Falha ao ${action}`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  const code = error.code ?? 'desconhecido';
  if (code === 'PGRST202' || code === '42883') {
    return new Error('A rotina de atualização de Retira e Entregas não está disponível no Supabase. O gestor precisa executar o SQL de correção.');
  }
  if (code === '42501') {
    return new Error('Sem permissão para atualizar o pedido no Supabase. Solicite ao gestor verificar o SQL de correção.');
  }
  if (/atualizad|alterad|não encontrad|nao encontrad|fila mudou|outro dispositivo/i.test(error.message)) {
    return new Error('O pedido foi alterado por outro dispositivo. Atualize a tela e tente novamente.');
  }
  return new Error(`Não foi possível ${action} (erro ${code}). Informe o código ao gestor.`);
}
