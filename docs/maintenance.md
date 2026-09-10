# Manutenção — guia prático do dia a dia

Este documento é sobre PROCESSO (como aplicar/testar/reverter uma
mudança nesse projeto especificamente). Para PADRÃO de código, ver
`docs/coding-standards.md`. Para investigar um bug já conhecido, ver
`docs/troubleshooting.md`.

## Adicionando um patch client-side novo

1. Escolher a subpasta certa de `js/patches/`: `chat/`, `kanban-leads/`,
   `notificacoes/`, `usuarios-auth/`, ou a raiz de `patches/` se tocar
   mais de uma área. Ver `docs/folder-structure.md`.
2. Seguir os padrões de `docs/coding-standards.md` (guarda de
   idempotência, envelopar sem substituir, cuidado com `defer`).
3. Adicionar a tag `<script>` somente em **`index.html`** (a ordem de
   carregamento importa — ver `docs/architecture.md`) e rodar
   `npm run html:sync` para gerar `app.html`.
4. `node --check caminho/do/arquivo.js` antes de considerar pronto.
5. Testar no navegador com `DevTools > Application > Storage > Clear
   site data` antes de recarregar (PWA com cache agressivo — sem isso
   você pode estar testando a versão antiga).

## Usando `tools/apply` / `tools/rollback` / `tools/verificacao`

- `tools/apply/*.sh` (ou `.py`) aplica um patch específico e, em alguns
  casos, grava seu próprio script de rollback em `tools/rollback/`
  automaticamente.
- `tools/verificacao/*.sh` confere se um patch está corretamente
  instalado (não aplica nada).
- `tools/rollback/*.sh` reverte um patch específico.
- Ver `tools/README.md` e os READMEs de cada subpasta para o que cada
  script faz exatamente antes de rodar em produção.

## Aplicando uma migração SQL

`sql/migrations/` não tem ferramenta automática (nem Prisma, nem
Knex). Processo real usado neste projeto: copiar o conteúdo do arquivo
e colar no SQL Editor do Supabase, manualmente, uma vez. Não existe
tabela de controle de migração (`schema_migrations`) — para saber se
uma já rodou, ou se tenta rodar de novo e observa erro de "já existe",
ou pergunta pra quem mantém o banco. Ver `docs/database.md`.

## Deploy

Processo completo em `docs/deployment.md`. Resumo do que NUNCA pular:
1. Confirmar no dashboard do Cloudflare Pages que o deploy terminou
   sem erro.
2. `Clear site data` + reload no navegador (cache agressivo do PWA).
3. Rodar o diagnóstico mais recente (`window.lfCacaFinalStatus()` ou
   equivalente) pra confirmar que a versão nova pegou.

## Antes de qualquer mudança estrutural (mover/dividir/renomear arquivo)

Checklist mínimo (o que esta própria reorganização de 2026-08-01
seguiu e validou):
```bash
# 1. sintaxe de 100% dos .js
find . -name "*.js" -not -path "*/node_modules/*" -exec node --check {} \;

# 2. todo src/href local de index.html e app.html aponta pra arquivo que existe
grep -oE '(src|href)="[^"]*"' index.html app.html | ...

# 3. diff de basenames (arquivo renomeado/movido continua na lista?)
```
Ver `ESTRUTURA-DO-PROJETO.md` (raiz) e `ARCHITECTURE_REPORT.md` para o
histórico completo de validação já aplicado, e reaplicar o mesmo tipo
de checagem antes de qualquer entrega nova.

## Housekeeping recomendado (não executado nesta rodada — decisão do time)

- **Consolidação de patches "definitivos"**: 14 arquivos que envelopam
  a mesma função (`renderChatList` e afins) em cadeia — funcionam
  corretamente juntos hoje, mas o custo de entender 14 camadas só
  cresce. Ver `docs/AUDITORIA-TECNICA-20260801.md` §2.2 e §13 para o
  plano de consolidação gradual já proposto (fora do escopo desta
  reorganização, que é só estrutural).
- **CSS duplicado não unificado**: ver `docs/AUDITORIA-TECNICA-20260801.md`
  §2.3 — risco real de regressão visual sem ambiente de teste
  visual, propositalmente não tocado.

## Regra de ouro

Qualquer mudança que não seja "mover arquivo" ou "criar documentação"
deve seguir o processo normal do projeto (patch → tools/apply → teste
→ tools/rollback disponível se algo der errado), não ser feita como
parte de uma tarefa de reorganização/documentação. Ver Regra nº 1 e
nº 6 da missão de arquitetura original.
