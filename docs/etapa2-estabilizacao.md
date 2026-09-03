# Etapa 2 — política de dados e concorrência

## Fontes principais por domínio

| Domínio | Fonte principal | Compatibilidade |
|---|---|---|
| Usuários e papéis | `public.users` / `public.roles` | `config/users/items/<uid>` é espelho temporário para módulos legados. |
| Leads e clientes CRUD | tabelas relacionais correspondentes | Os documentos `clientes/list/<uid>` representam somente o bingo local por consultor, não o cadastro relacional. |
| Kanban | `fs_documents` em `kanban/list/<board>/<uid>` | A transferência entre boards usa a RPC transacional `kanban_move_card`. |
| Atividades | `fs_documents` em `atividades/list/<uid>` | Um documento singleton por consultor; sem novo dual-write. |
| Ligações | `fs_documents` em `ligacoes/list/<uid>_<date>` | Contadores acumulados continuam no mesmo documento. |
| Inbox e regras de notificação | `fs_documents` | Operações PUT usam versionamento condicional. |
| Agenda, documentos ADM, feed e erros do cliente | `fs_documents` | Feed e erros usam um documento novo por evento; agenda usa um documento por slot. |

Não adicionar uma nova gravação paralela. Quando um espelho existente
falhar, o Worker registra um item em `sync/failures/<id>` com domínio,
operação, chave e erro para reconciliação posterior.

## Contrato de documentos mutáveis

- Leituras expõem `meta.version` e o header `ETag`.
- Clientes podem enviar `If-Match: W/"<versão>"` ou `version` no JSON.
- A escrita condicionada compara `updated_at` no próprio `UPDATE`, não
  somente em um GET anterior.
- Versão divergente responde `409 DOCUMENT_VERSION_CONFLICT`, incluindo
  a versão atual para o cliente atualizar sua cópia.
- Clientes antigos sem versão continuam aceitos durante a transição, mas
  os clientes oficiais reaproveitam automaticamente a ETag do último GET.

## Migração do Kanban

`sql/migrations/etapa2_stabilizacao.sql` cria a RPC que trava os dois
documentos em ordem determinística, valida as versões e move o card em
uma transação. Ela deve ser aplicada no Supabase antes de habilitar o
claim em produção; o Worker recusa o fallback antigo com `503` quando a
função não existe.

## Offline

`lidercrm_retry_queue_v1` é a única chave persistente. O runtime modular
mantém sua API histórica, migra `lf_retry_q_v1` na inicialização e aceita
itens com `path` ou `url`. A fila antiga não deve ser recriada.