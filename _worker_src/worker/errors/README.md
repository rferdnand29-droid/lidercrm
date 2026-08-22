# `errors/` — hierarquia de erro HTTP

Um arquivo só: `http-errors.js`. Define a hierarquia central de erros
usada por todo o Worker — qualquer erro lançado dentro de um
controller/service que seja uma instância dessas classes é serializado
automaticamente pelo handler global em `{ ok:false, error:{ code,
message, details } }` (ver `utils/response.js` / `api-handler.js`).

Ao lançar um erro novo num controller, preferir uma classe já existente
aqui (`BadRequestError`, `UnauthorizedError`, `NotFoundError`, etc. —
conferir o arquivo pra lista exata) em vez de um `throw new Error(...)`
genérico, que cai no catch-all `WORKER_ERROR` 500 e esconde a causa
real do cliente da API.
