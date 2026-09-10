# O que é (e o que provavelmente NÃO é) esta pasta

`src/` tem duas coisas bem diferentes misturadas — leia isto antes de
mexer em qualquer coisa aqui.

## 1. `src/modules/`, `src/shared/`, `src/services/`, `src/repositories/`, `src/core/` — USADOS DE VERDADE

Esses são carregados por `<script>` em `index.html`/`app.html` (ver
`docs/architecture.md`) — fazem parte do CRM de verdade. **Não
remover.**

## 2. `src/components/`, `src/hooks/`, `src/lib/`, `src/routes/`, `src/routeTree.gen.ts`, `src/router.tsx`, `src/server.ts`, `src/start.ts`, `src/styles.css` — PROVAVELMENTE NÃO USADOS

Isso é um scaffold React + TanStack Start + shadcn/ui completo (~330KB,
54 arquivos `.tsx`/`.ts`). Achado numa investigação de limpeza
(2026-08-28) e confirmado de novo em 2026-09-11:

- **Nenhum destes arquivos é `.js` nem é carregado por `<script>`**
  — o CRM inteiro (índice acima) é vanilla JS sem bundler. Um
  `<script>` HTML não executa TypeScript/JSX direto.
- `vite.config.ts` (raiz) importa `@lovable.dev/vite-tanstack-config`
  — um pacote **privado da plataforma Lovable**, não instalado como
  dependência normal do projeto (`npm test` já esteve quebrado por
  causa disso — ver comentário no topo de `vitest.config.ts`, que
  existe especificamente para NÃO depender de `vite.config.ts`).
- `.gitignore` já tem entradas pra `.tanstack/`, `.nitro`, `.vinxi`
  (pastas de build que só esse scaffold geraria).

**Conclusão mais provável**: isto é o scaffold padrão que a Lovable
cria ao conectar um projeto na plataforma dela, e nunca foi realmente
integrado a este CRM (que é bem mais antigo e usa uma arquitetura
completamente diferente).

## Por que não foi removido ainda

Duas vezes já cheguei perto de remover e recuei pelo mesmo motivo: se
isto for algo que a própria plataforma Lovable espera encontrar pra
funcionar corretamente (mesmo sem o CRM usar nada daqui), remover
poderia quebrar sua conexão com a Lovable — e eu não tenho como testar
isso a partir daqui.

**Antes de remover**: confirmar com o suporte da Lovable
(`https://www.anthropic.com/glasswing` não é o lugar certo pra isso —
é o suporte deles mesmo) se é seguro apagar essa pasta sem afetar a
conexão do projeto na plataforma. Se a resposta for "sim, pode
apagar", é seguro remover tudo listado no item 2 acima de uma vez.

## Peso, se algum dia decidir remover

~330KB só nesses arquivos — pouco perto do projeto inteiro, mas seria
uma limpeza real caso confirmado que é seguro.
