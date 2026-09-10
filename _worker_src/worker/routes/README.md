# `routes/` — tabela de rotas

Um arquivo: `router.js`. Array `ROUTES` = lista de
`[pathname, método, handler]`, resolvida por `resolveRoute()`
(comparação exata de string, sem regex/params dinâmicos). 77 rotas
registradas — catálogo completo, agrupado por domínio, em
`docs/worker.md`.

`methodsFor()` e `routeNotFound()` existem pra devolver 405 com header
`Allow` correto quando o pathname existe mas o método não bate (em vez
de um 404 genérico enganoso).

Para adicionar uma rota: ver checklist em `docs/worker.md` §"Como
adicionar uma rota nova".
