# BigLogno — preparação para hospedagem independente

Esta cópia adapta a configuração **do código** para Cloudflare Workers e Supabase, sem
hospedagem ou dependências de compilação da Lovable.

**Atenção:** esta é uma base preparada para migração, e NÃO é uma publicação validada em
produção. Instale dependências, compile, configure banco/segredos e execute testes de
aceitação antes de trocar o sistema em uso. O ZIP não contém os dados do banco anterior.

## Modificações aplicadas

- Configuração do Vite substituída pelo `@cloudflare/vite-plugin`, pelo plugin oficial
  TanStack Start, plugin React, Tailwind CSS e atalhos TypeScript.
- Criado `wrangler.jsonc` e scripts de deploy para Cloudflare Workers.
- Removidos pacote de build da Lovable, middleware de preview e telemetria do editor.
- Mantidos acesso com senha gestor/operador, função de sessão, funções de servidor,
  RLS, verificações, entregas, retiradas, contagens e análises.
- `.env` que veio no ZIP foi excluído. `.gitignore` passou a ignorar segredos; use `.env.example`
  apenas para saber os NOMES exigidos. Segredos devem ficar no painel Cloudflare.
- Arquivos `*.asset.json` de logo apenas apontavam para mídia do editor (não havia PNGs
  reais). O fallback provisório é `/favicon.png`; substitua por logos locais próprios.

## Banco de dados

1. Identifique se o Supabase que será usado já tem os dados atuais. Não assuma que o
   projeto indicado no ZIP é o mesmo projeto pessoal do Supabase.
2. Faça backup/exportação de dados da origem ANTES de migrar. Dados não estão no ZIP.
3. Rode `VERIFICAR_TABELAS.sql` para inspecionar no SQL Editor.
4. **Apenas em projeto NOVO, VAZIO e com backup:** rode
   `SUPABASE_ESQUEMA_INICIAL.sql` inteiro uma vez. Ele monta `app_state`,
   `access_attempts`, `sales_verification_records`, `deliveries`, `pickups`, funções
   atômicas e políticas restritas. NÃO use este script num projeto já configurado.
5. Importe registros do banco anterior com atenção aos IDs, timestamps e JSONs.
   Teste totais, históricos e integridade. Primeiro valide as tabelas; depois os
   registros. Não basta ter tabelas vazias para preservar o histórico antigo.

## Cloudflare Workers: publicação

1. Crie um repositório PRIVADO no GitHub com o conteúdo da pasta (não o ZIP aninhado).
2. Na Cloudflare: Workers & Pages > Create application > GitHub > selecione seu repo.
3. Build command `npm run build`; deploy command `npx wrangler deploy`.
4. Em Worker > Settings > Variables and Secrets, adicione como **secrets de runtime**:
   - `SUPABASE_URL` (endereço do projeto de dados)
   - `SUPABASE_SERVICE_ROLE_KEY` (segredo de servidor; nunca prefixo VITE_)
   - `GESTOR_PASSWORD` (senha do gestor, escolhida por você)
   - `OPERADOR_PASSWORD` (outra senha, diferente da primeira)
   - `SESSION_SECRET` (string forte e aleatória, pelo menos 32 caracteres)
5. Para criar segredo de sessão localmente com Node.js:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
   Copie o valor DIRETAMENTE no painel Cloudflare. Nunca envie valores neste chat.
6. Dispare uma nova publicação após salvar os secrets. Teste a URL `workers.dev`.
7. Para domínio próprio: Worker > Settings > Domains & Routes > Add > Custom Domain,
   desde que sua zona DNS esteja na Cloudflare e o domínio permita a configuração.

## Teste de aceitação antes de migrar produção

- Abre login do gestor e operador; senha incorreta é recusada;
- Permissões de abas e sessão (inclusive saída) funcionam;
- Importar CSV, navegar nas análises, pesquisar estoque;
- Salvar/endereço/contagens, recarregar em outro navegador e confirmar persistência;
- Conferência e registro de entrega/retirada; histórico e PDF;
- Usar celular e computador; revisar eventos de erro no Worker;
- Confirmar que cada tabela do Supabase contém os dados esperados;
- Testar concorrência / atualização de dados antes de liberar usuários.

## Dependência externa não migrada

`src/components/FuroEstoque.tsx` ainda exibe um iframe de
`https://diver-flow.lovable.app` e consome sua base de divergências. Este é OUTRO
aplicativo e não foi incluído no ZIP; a migração do BigLogno não tira essa
integração da Lovable. Precisamos do código e dados dele para migrá-lo também.

## Para continuar melhorias pelo ChatGPT

Descreva o ajuste ou envie o ZIP atualizado; trabalhamos nos arquivos-fonte e
geramos um pacote atualizado para você enviar ao GitHub. Mudanças no GitHub
podem ser publicadas automaticamente pela Cloudflare após integrar a conta.
