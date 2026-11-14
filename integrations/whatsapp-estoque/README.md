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

## Pedidos pendentes quando a internet cair

- O bot salva **antes do envio** cada pedido de impressão na pasta `.argox-pendentes`, dentro da instalação do bot. O arquivo guarda apenas ID estável, empresa, códigos e descrições; **não** guarda token, sessão WhatsApp ou quantidade.
- Se o BigLog ficar temporariamente inacessível (erro `fetch failed`, `ECONNRESET`, tempo esgotado ou HTTP 503), o bot continua respondendo no grupo. A impressão fica **pendente**, sem se perder.
- O bot faz até **3 tentativas imediatas** e, enquanto estiver aberto, verifica os pedidos pendentes aproximadamente a cada **30 segundos**. Quando reiniciar, retoma a fila local.
- O terminal informa `[Argox] Pedido salvo para reenvio automático` e, após conseguir enviar, `[Argox] Pedido salvo enviado ao BigLog`.
- A API mantém idempotência por `requestId` fixo: reenvio não imprime uma segunda cópia do mesmo pedido, mesmo que a resposta HTTP tenha se perdido.
- **Não exclua a pasta `.argox-pendentes`** enquanto houver arquivos nela, a menos que deseje descartar esses pedidos.
- Antes de repetir manualmente um comando, confira se há pedidos pendentes, pois uma nova mensagem no WhatsApp corresponde a um novo pedido de impressão.
- Reiniciar o bot não faz o pedido original que falhou antes desta atualização reaparecer. Se o pedido antigo não chegou à fila, faça um novo teste após a atualização.

## Observabilidade / falhas

- Se a chave não estiver configurada, o bot **continua respondendo**, mas emite `[Argox] Solicitação não enviada: Token ...` no terminal.
- Se o BigLog falhar, o bot continua respondendo; a solicitação fica salva para reenvio automático, sem reescrever a mensagem do grupo.
- O retorno da API confirma **enfileiramento**, não a saída física. A confirmação do agente significa envio ao spooler do Windows.
- Para evitar duplicação, a mesma mensagem tem requestId estável. Se você enviar **uma nova mensagem** com o mesmo código, será um novo pedido e poderá imprimir novamente.
- Evite reimprimir uma mensagem enquanto não conferir a impressora.
- O endpoint HTTPS aceita somente token exclusivo do bot; o navegador e o grupo não recebem esse token.
- O limite do endpoint é de 500 códigos por mensagem, particionados em lotes seguros.

## Iniciar automaticamente, com icone proximo ao relogio (Windows)

O controlador usa Windows PowerShell 5.1 + WinForms, sem aplicativo externo.
Ele controla o bot ja existente pelo arquivo iniciar-bot.ps1 e preserva chave
DPAPI, indice de estoque, sessao do WhatsApp, respostas e impressao.

1. Copie da pasta integrations/whatsapp-estoque do GitHub os arquivos
   bandeja-bot.ps1 e instalar-bandeja.ps1 para C:\Users\usuario\Desktop\bot-estoque
   junto aos arquivos atuais.
2. Encerre primeiro a janela do bot que foi iniciado manualmente (Ctrl+C).
   Nao execute duas instancias com a mesma pasta .wwebjs_auth.
3. No PowerShell, abra a pasta e rode:

       cd "C:\Users\usuario\Desktop\bot-estoque"
       powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\instalar-bandeja.ps1"

4. Se concluiu, inicie o icone sem abrir janela PowerShell:

       wscript.exe ".\iniciar-bandeja.vbs"

5. Verifique a seta ^ proxima ao relogio. Clique com botao direito
   no icone para Ver status, Abrir logs, Reiniciar bot ou Encerrar bot.
   O duplo clique no icone mostra o status.
6. Reinicie o Windows, entre na mesma conta, confirme que o icone aparece,
   e teste o grupo WhatsApp e a impressao da Argox.

**Importante:** nao copie o controlador como substituto do iniciar-bot.ps1.
O instalador cria um atalho na pasta de Inicializacao do usuario e substitui
o antigo "Bot Estoque WhatsApp.lnk" se ele apontava ao mesmo bot.
Se houver outro atalho .bat/.cmd ou outra tarefa agendada iniciando
node index.js, remova/desabilite apenas a inicializacao duplicada.
O controlador NAO encerra processos externos automaticamente.

**Logs:** os arquivos ficam em logs-bot (stdout = .out.log, erros = .err.log).
O controlador tenta reiniciar se o proprio processo terminar por erro.
Se a sessao do WhatsApp expirar e precisar de QR Code, use "Encerrar bot"
na bandeja, execute iniciar-bot.ps1 manualmente para escanear o QR e
depois inicie novamente com wscript.exe iniciar-bandeja.vbs.
O icone representa o processo ativo e o sinal "Online" recebido
na inicializacao; nao e uma verificacao externa de conectividade em tempo real.

**Como desinstalar:** na bandeja, use Encerrar bot. Pressione Win+R,
digite shell:startup e remova o atalho "Bot Estoque - Bandeja".
Nao apague .bot-print-token.dpapi nem .wwebjs_auth.


## Arquivos desta integração

- `index.js` — bot original com passo extra de impressão; formato de comando preservado.
- `print-client.js` — cliente HTTP seguro e idempotente do BigLog.
- `print-client.test.js` — testes do envio sem chamar WhatsApp nem imprimir.
- `configurar-token.ps1` — grava token em formato protegido no Windows.
- `iniciar-bot.ps1` — inicia o bot com o token protegido na variável de ambiente.
- `bandeja-bot.ps1` — controlador com icone, status, logs, reinicio e encerramento.
- `instalar-bandeja.ps1` — cria inicializacao automatica no login do Windows.
- `iniciar-bandeja.vbs` — gerado pelo instalador para iniciar sem janela de console.
- `.gitignore` — ignora sessao, dependencias, logs e segredos locais.

**Não copiar** para o computador: o endpoint `src/routes/api/whatsapp-stock-print.ts` e o gerador `src/lib/whatsapp-stock-label.ts` pertencem exclusivamente ao BigLog no Cloudflare e são publicados pelo GitHub.
