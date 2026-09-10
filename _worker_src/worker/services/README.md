# `services/` — orquestração de regra de negócio (backend)

| Arquivo/pasta | Papel |
|---|---|
| `crud-service.js` | Serviço CRUD genérico — todos os controllers do worker falam com um `BaseRepository` através dele. Concentra listagem paginada, filtragem e ordenação usando os operadores do PostgREST. |
| `auth-service.js` | Mantém a API pública original do Worker, mas delega a lógica real pra subpasta `auth/` (ver abaixo) — reorganização feita para eliminar um arquivo >400 linhas nesta camada crítica, preservando 100% dos imports usados pelos controllers. |
| `security-events-service.js` | Registra eventos de segurança (ex.: `CHAT_GROUP_FORBIDDEN`) via `securityEventsRepo`. |
| `auth/` | Login, ponte legada, hashing e troca de senha — separados em módulos menores. Ver `services/auth/README.md`. |

## `auth/` — subpasta (autenticação, dividida por responsabilidade)

| Arquivo | Papel |
|---|---|
| `login-service.js` | Fluxo de login. |
| `password.js` | `hashPasswordS2()` / verificação — a implementação de hash de senha REAL usada hoje pelo sistema. |
| `change-password-service.js` | Troca de senha (usuário + admin-reset). |
| `tokens.js` | Emissão/validação de token. |
| `legacy-bridge-service.js` | Ponte pro sistema de login legado (pré-Worker). |
| `legacy-users.js` | Leitura de usuário no formato legado. |
| `iter-cap-recovery.js` | Recuperação de hash com iteração acima do cap PBKDF2 do runtime Workers (ver `docs/troubleshooting.md`). |
| `constants.js` | Constantes compartilhadas do módulo de auth. |

Esta divisão preserva 100% da API pública original — é reorganização
estrutural, não reescrita (Regra nº 2 da missão de arquitetura).
