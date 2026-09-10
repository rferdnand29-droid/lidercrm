# `validators/` — motor de validação

Um arquivo: `validate.js`. Validador leve, inspirado em Zod, **sem
dependência externa** (mantém o Worker 100% edge-compatible, sem
`npm install`). Recebe `(payload, schema)` — schema definido em
`schemas/index.js` — e retorna `ValidationError` (HTTP 422) com
detalhes se o payload não bater com o esperado.

Também exporta helpers usados diretamente pelos controllers:
`readJsonBody`, `sanitizeString` (ver imports no topo de qualquer
`controllers/*.js`).
