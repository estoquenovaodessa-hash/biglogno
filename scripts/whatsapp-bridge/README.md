# BigLogno — Avisos opcionais de Entregas pelo WhatsApp Web

> **Atenção:** Integração não oficial (whatsapp-web.js). O WhatsApp pode
> desconectar, alterar o serviço ou restringir/bloquear o número por
> automação, inclusive com poucas mensagens. O volume de 15–20 entregas
> por dia **não garante segurança**. Prefira um número dedicado e
> use somente com autorização dos destinatários. Não tente contornar bloqueios.

## Como funciona

1. O gestor entra em **Entregas > WhatsApp de Entregas** e cadastra um
   número e a autorização de cada cliente (vinculados pelo código interno).
2. Execute no Supabase SQL Editor `sql/2026-10-26-whatsapp-entregas.sql`.
   Se nenhuma autorização estiver cadastrada, nenhum aviso será gerado.
3. O operador pressiona **Iniciar entrega**. A mesma transação que muda
   o pedido para "Em rota" enfileira no máximo uma notificação
   por cliente/viagem, preservando o fluxo original de Entregas.
4. O conector local coleta o item da fila por uma API privada no Cloudflare,
   envia pelo WhatsApp Web e retorna o resultado ao BigLogno.
5. O gestor vê o histórico e eventuais falhas. A mensagem não inclui
   valor financeiro, endereço nem informações pessoais sensíveis.

## Pré-requisitos

- Node.js 20.12+ instalado num PC Windows/Linux/Mac com rede e disco persistente.
- PC ligado com sessão de WhatsApp Web válida durante o horário de entregas.
- Acesso ao Cloudflare do projeto BigLogno para criar um secret.
- Acesso ao SQL Editor do Supabase para executar a migração.
- Número preferencialmente dedicado, com titularidade e autorização adequadas.
- Cadastro de consentimento de cada cliente antes do envio.

## Configuração, passo a passo no Windows

1. Confirme que a versão nova do GitHub foi publicada no Cloudflare e rode
   a migração SQL acima uma única vez no Supabase.
2. No terminal local, entre na pasta `scripts/whatsapp-bridge` (pode
   baixar o ZIP do repositório pelo GitHub e extrair no PC) e execute:
   ```powershell
   npm install
   copy .env.example .env
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```
3. A última linha gera um token aleatório. No **Cloudflare Workers**,
   adicione esse valor como **secret** `WHATSAPP_BRIDGE_TOKEN` no
   ambiente do BigLogno. Não compartilhe esse token, nem o QR, no chat.
   O nome do secret deve ser idêntico.
4. Edite o arquivo **.env** no computador:
   ```env
   BIGLOGNO_URL=https://biglogno.estoquenovaodessa.workers.dev
   WHATSAPP_BRIDGE_TOKEN=COLE_AQUI_O_TOKEN_GERADO_NO_SEU_PC
   WHATSAPP_SEND_ENABLED=false
   POLL_INTERVAL_MS=10000
   ```
5. Execute `npm start`. O terminal exibe um QR Code. No aplicativo
   WhatsApp, abra **Aparelhos conectados > Conectar aparelho** e leia
   o código. Aguarde "WhatsApp Web conectado".
6. No BigLogno, abra **Gestor > Entregas > WhatsApp de Entregas**,
   selecione um cliente de teste, informe o telefone com DDD e
   marque a autorização **apenas se houver consentimento**.
7. Depois de confirmar a identidade do destinatário e aceitar o risco da
   integração não oficial, pare o processo com Ctrl+C, altere
   `WHATSAPP_SEND_ENABLED=true` no **.env** e execute `npm start` novamente.
   Teste com uma entrega real autorizada.
8. Mantenha o computador ligado enquanto quiser fazer envios. Não é
   preciso deixar o BigLogno aberto no navegador.

## Segurança e comportamento

- `.env` e `.session` ficam SOMENTE no computador; nunca envie ao GitHub.
- A API do Worker verifica o secret e não expõe as credenciais do Supabase.
- O conector precisa estar ativo para haver envio; Cloudflare não executa Chrome.
- **Não há reenvio automático de mensagens após falha.** Isso reduz
  duplicações quando o WhatsApp envia mas perde a confirmação da rede.
- Se o computador ficar desligado por mais de 2 horas, a fila cancela os
  avisos antigos quando o conector voltar a consultar, em vez de enviar
  uma mensagem de saída para entrega atrasada.
- Quando um cliente revogar consentimento ou o número mudar, avise o
  gestor para desativar/corrigir o contato imediatamente.
- A situação "Enviado" significa que o comando do WhatsApp Web retornou
  sucesso; **não confirma entrega, leitura ou recebimento no telefone**.
- Mensagens podem ficar "Em envio" se ocorrer uma interrupção após o
  envio e antes de gravar o resultado. Verifique no WhatsApp antes de
  tomar qualquer ação manual.

## Se aparecer erro

- **Fila indisponível:** confirme a migração SQL e o `SUPABASE_SERVICE_ROLE_KEY`
  já existente no Cloudflare.
- **HTTP 401:** `WHATSAPP_BRIDGE_TOKEN` incorreto ou diferente entre
  Cloudflare e o arquivo `.env`; confirme publicação do secret.
- **Nenhum aviso:** confirme que a entrega mudou de "Não iniciada" para
  "Em rota", que o cliente tem código, telefone e autorização, e que o
  conector está ativo.
- **Sessão desconectada:** reconecte pelo QR Code, sem apagar a pasta
  `.session` sem necessidade.
- **Status Em envio:** não reinicie o envio sem conferir se a mensagem
  foi realmente enviada.

### Opção mais estável no futuro

A integração oficial da **WhatsApp Business Platform** é a alternativa
com suporte, templates aprovados e cobrança conforme a política aplicável.
A arquitetura de fila permite substituir somente o conector no futuro,
mantendo a mesma integração com Entregas.

