# `schemas/` — forma esperada do payload, por rota

Um arquivo: `index.js`. Cada schema é consumido por
`validate(payload, schema)` em `validators/validate.js` (validador
próprio, sem dependência externa, estilo Zod). Ao adicionar uma rota
que recebe body, criar o schema aqui antes de usar no controller —
evita `BadRequestError` genérico e dá mensagem de validação específica
pro cliente da API.
