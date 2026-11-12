# Bot de Estoque WhatsApp → Etiquetas Argox (BigLog)

## O que muda (e o que NÃO muda)

- Grupo autorizado: mantido exatamente como no index.js original.
- **Formato do comando: mantido.** Exemplo real da instalação:

  ```text
  12456 - 6
  12457 - 3
  PENTAX
  ```

  A empresa continua em **linha separada**, como hoje. Não use `12456 - 6 PENTAX` numa linha: o bot original não entende esse formato e nós NÃO o alteramos.
- Resposta ao WhatsApp: mesma mensagem com código, quantidade, descrição, endereço.
- Após responder, um código encontrado no `estoque.csv` gera uma etiqueta física de 60 × 30 mm.
- Produto não encontrado: segue a resposta de erro, sem etiqueta.
- **Quantidade na etiqueta: propositalmente em branco**, mesmo se a mensagem pedir 6 unidades.
- Na etiqueta aparecem EMPRESA (ex.: PENTAX), CÓDIGO, DESCRIÇÃO e BIGNOTTO FERRAMENTAS.
- Impressão: a mesma fila Supabase do S.B.O; o BigLogno Print que já roda no Windows imprime na Argox.
- Não é necessário instalar pacotes npm novos nem alterar o formato do `estoque.csv`.
- Reentrega da mesma mensagem pelo WhatsApp não duplica os jobs de impressão.

## Etapas para ativar (obrigatórias)

### 1. Fazer backup e copiar os arquivos
No computador em que o bot já funciona:

1. **Pare o bot**.
2. Faça backup do `index.js` atual e da sessão de autenticação do WhatsApp (NÃO compartilhe essa sessão).
3. Copie **index.js** e **print-client.js** desta pasta para a pasta do bot, substituindo somente o `index.js` antigo.
4. Opcionalmente copie **configurar-token.ps1** e **iniciar-bot.ps1** para a mesma pasta.
5. Mantenha seu **estoque.csv**, **package.json**, **package-lock.json**, **node_modules** e os arquivos de sessão exatamente como já estão.

### 2. Criar uma chave exclusiva para o bot
No PowerShell, execute:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarde o valor de **64 caracteres** com segurança, sem enviá-lo a terceiros.

### 3. Cloudflare (BigLog, ambiente Production)
No painel Cloudflare → Workers & Pages → **biglogno** → Settings → Variables and Secrets:

- Nome do secret: **WHATSAPP_STOCK_PRINT_TOKEN**
- Valor: a chave de 64 caracteres gerada na etapa anterior
- Tipo: **Secret**, em **Production**

Salve e confirme a implantação da configuração se o Cloudflare solicitar. **Não** coloque essa chave em `wrangler.jsonc` ou no GitHub. Não use `PRINT_AGENT_TOKEN`: a chave do agente Windows deve permanecer separada.

O Worker deve continuar com `AUTO_CONFERENCE_PRINT_ENABLED=true` e o programa **BigLogno Print** executando no Windows conectado à Argox.

### 4. Guardar o mesmo token no Windows

Abra PowerShell na pasta do bot e execute:

```powershell
.\configurar-token.ps1
```

Cole a **mesma chave** quando solicitado. Ela será protegida com o DPAPI do Windows no arquivo `.bot-print-token.dpapi`, que só pode ser lido pela mesma conta Windows, no mesmo computador. **Não** envie esse arquivo para terceiros.

Para iniciar a partir de agora:

```powershell
.\iniciar-bot.ps1
```

Se o PowerShell bloquear scripts locais por política de execução, rode os arquivos de confiança explicitamente com `powershell -NoProfile -ExecutionPolicy Bypass -File .\configurar-token.ps1` e `powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar-bot.ps1`.

**Atenção:** se o bot é iniciado automaticamente por agendador de tarefas ou gerenciador de processos, altere a inicialização para executar `iniciar-bot.ps1` **na mesma conta Windows usada na configuração da chave**. Iniciar diretamente com `node index.js` sem a variável de ambiente não imprimirá; porém continuará respondendo normalmente ao WhatsApp.

### 5. Testar uma etiqueta
Confira que o Windows, a Argox e o BigLogno Print estão ativos. Envie ao grupo autorizado uma mensagem de teste com **um código existente** no formato original:

```text
12456 - 6
PENTAX
```

O bot continuará respondendo com **6** no WhatsApp, mas a etiqueta terá a área **QUANTIDADE em branco**. Confira a impressão física antes de repetir o comando.

### 6. Testes locais opcionais

```powershell
node --version
node --test print-client.test.js
```

Requer Node 18+ para o cliente HTTP embutido. `whatsapp-web.js`, `qrcode-terminal`, `csv-parser` e `iconv-lite` continuam com as versões já instaladas.

## Observabilidade / falhas

- Se a chave não estiver configurada, o bot **continua respondendo**, mas emite `[Argox] Solicitação não enviada: Token ...` no terminal.
- Se o BigLog falhar, o bot continua respondendo; a falha aparece no terminal, sem reescrever a mensagem do grupo.
- O retorno da API confirma **enfileiramento**, não a saída física. A confirmação do agente significa envio ao spooler do Windows.
- Para evitar duplicação, a mesma mensagem tem requestId estável. Se você enviar **uma nova mensagem** com o mesmo código, será um novo pedido e poderá imprimir novamente.
- Evite reimprimir uma mensagem enquanto não conferir a impressora.
- O endpoint HTTPS aceita somente token exclusivo do bot; o navegador e o grupo não recebem esse token.
- O limite do endpoint é de 500 códigos por mensagem, particionados em lotes seguros.

## Arquivos desta integração

- `index.js` — bot original com passo extra de impressão; formato de comando preservado.
- `print-client.js` — cliente HTTP seguro e idempotente do BigLog.
- `print-client.test.js` — testes do envio sem chamar WhatsApp nem imprimir.
- `configurar-token.ps1` — grava token em formato protegido no Windows.
- `iniciar-bot.ps1` — inicia o bot com o token protegido na variável de ambiente.
- `.gitignore` — ignora sessão, dependências e segredos locais.

**Não copiar** para o computador: o endpoint `src/routes/api/whatsapp-stock-print.ts` e o gerador `src/lib/whatsapp-stock-label.ts` pertencem exclusivamente ao BigLog no Cloudflare e são publicados pelo GitHub.
