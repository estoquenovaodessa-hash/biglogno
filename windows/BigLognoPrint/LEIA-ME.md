# BigLogno Print — Windows / Argox OS-214 plus series PPLA

Esta pasta contem o programa PowerShell que permite imprimir etiquetas
de conferencias criadas no tablet, mesmo que ele esteja em outra rede.

**Importante:** este codigo nao instala o SQL nem configura os secrets
do Cloudflare sozinho. Ate tudo estar pronto, a impressao automatica
continua desativada e a impressao manual existente funciona normalmente.

## Instalacao segura

1. No Windows, confirme que a impressora chamada
   **Argox OS-214 plus series PPLA** funciona em 60 x 30 mm.
2. Instale o SumatraPDF do site oficial:
   https://www.sumatrapdfreader.org/download-free-pdf-viewer
3. Abra o Supabase do BigLogno, SQL Editor > New query, e execute:
   **sql/2026-11-07-biglogno-print-queue.sql**
   O arquivo fica no diretorio sql do repositorio.
4. Baixe esta pasta do GitHub. Abra PowerShell dentro dela e execute:

       powershell -NoProfile -ExecutionPolicy Bypass -File .\Configurar-BigLognoPrint.ps1

5. O configurador gera um token exclusivo com 256 bits.
   **NAO compartilhe esse token em chat, repositorio ou WhatsApp.**
   Cole-o SOMENTE no Cloudflare Workers & Pages > biglogno >
   Settings > Variables and Secrets, como secret **PRINT_AGENT_TOKEN**.
6. No mesmo painel, crie **AUTO_CONFERENCE_PRINT_ENABLED=true**.
   Faça isso somente depois que a tabela SQL foi instalada.
7. Para testar UMA rodada de consulta e eventual impressao:

       powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\BigLognoPrint\BigLognoPrint.ps1" -Once

8. Cadastre **uma nova conferencia de Entrega ou Retira** no tablet.
   Veja a impressao na Argox. Confira fisicamente tamanho, orientacao
   e que apenas uma etiqueta foi alimentada.
9. Reinicie a sessao do Windows. O programa inicia junto com o
   login do usuario que configurou o token.

## Comportamento e seguranca

- Nenhum novo registro antigo e impresso em lote ao habilitar.
- O formato da etiqueta e exatamente o PDF Argox 60x30 mm do BigLogno.
- A fila consulta a cada 5 segundos, uma etiqueta por vez.
- O token e criptografado com DPAPI para o usuario Windows que instalou.
- **Nunca** copie a service_role do Supabase para este computador.
- O Windows faz somente conexoes HTTPS de saida. Sem portas de entrada.
- Se a rede falhar depois de enviar a impressao mas antes da
  confirmacao, o job fica pendente de revisao manual (status claimed).
  **Nao reimprima sem verificar a impressora fisicamente.**
- O status spooled indica aceito pela fila do Windows, nao significa
  necessariamente que a etiqueta saiu do equipamento.

## Verificar os trabalhos no Supabase

Executar no SQL Editor:

    SELECT document,status,attempts,created_at,spooled_at,last_error
    FROM public.conference_label_print_jobs
    ORDER BY created_at DESC LIMIT 25;

Status:
- pending: aguardando agente Windows;
- claimed: assumido pelo agente; impressao/confirmacao incerta;
- spooled: o Windows aceitou a impressao;
- error: impressora, arquivo ou driver falhou.

O usuario pode consultar o log local:
%LOCALAPPDATA%\BigLognoPrint\biglogno-print.log

## Argox e orientacao

O driver deve ter papel 60x30 mm previamente configurado. O agente
chama SumatraPDF com a opcao -print-settings noscale, sem janela.

Documentacao oficial da impressao:
https://www.sumatrapdfreader.org/docs/Command-line-arguments

## Suspender sem perder os trabalhos

No Cloudflare coloque AUTO_CONFERENCE_PRINT_ENABLED=false.
Isso mantem o processo de conferencia e o PDF manual funcionando.
Se necessario, remova o secret PRINT_AGENT_TOKEN para revogar acesso
do agente.

O instalador registra atalho no Startup do usuario atual. Precisa estar
logado no Windows. Se for necessario operar com a sessao encerrada,
deve-se configurar posteriormente um servico Windows com credenciais
do proprio usuario; nao presumir que um atalho roda sem login.
