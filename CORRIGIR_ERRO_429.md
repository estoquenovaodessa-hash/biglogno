# BigLogno - como corrigir o erro HTTP 429 da Lovable na Cloudflare

O erro `GET https://europe-west1-npm.pkg.dev/lovable-core-prod/... - 429`
acontece ANTES de compilar o projeto. Ele decorre de arquivos antigos do repositório original.

## 1. Remova arquivos antigos no GitHub

No repositório atualmente conectado à Cloudflare, exclua (se existirem):

- `bun.lock` (referências ao cache privado da Lovable)
- `bun.lockb`
- `bunfig.toml` (configuração antiga específica do Bun)
- `.env` (não publique variáveis de conexão no repositório)

**Atenção:** arquivos que já estão rastreados pelo Git não são removidos automaticamente
por `.gitignore`. Exclua-os explicitamente e faça commit.

## 2. Atualize o projeto

Envie *todos* os arquivos DESTA pasta, sem criar um diretório extra que embrulhe
o `package.json` no GitHub. Substitua os arquivos de mesmo nome existentes.
O arquivo `.npmrc` deve ficar na mesma pasta que `package.json`.

Verifique que `package.json` tem `@cloudflare/vite-plugin` e NÃO contém
`@lovable.dev/vite-tanstack-config`. Verifique que `wrangler.jsonc` aparece na raiz.

## 3. Atualize a publicação

Na Cloudflare, para Workers com integração GitHub, use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Depois de salvar o commit, execute uma nova build. A instalação não deve mais
exibir `bun install --frozen-lockfile` nem links para `lovable-core-prod`.

## 4. Segurança

O arquivo `.env` original pode ter sido enviado ao GitHub. Se continha segredos
sensíveis e foi publicado (mesmo em commits antigos), troque essas credenciais no
serviço de origem. Não envie nenhuma senha ou chave em mensagens.
Configure secrets do servidor em Cloudflare > Worker > Settings > Variables and Secrets.

## 5. Observação

Este pacote corrige a origem do erro de instalação; ele **não foi compilado nem
validado em produção**. Se a instalação passar e uma nova falha aparecer, use
as novas linhas do log para a próxima correção.
