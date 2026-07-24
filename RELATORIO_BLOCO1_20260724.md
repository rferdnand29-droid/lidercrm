# Relatório — Bloco 1 (auditoria + correções + zip final)

**Data:** 2026-07-24
**Escopo executado nesta rodada:** auditoria pontual + correção prioritária de permissão + empacotamento final.
**Escopo deliberadamente adiado:** QA E2E real com 5/20/100 usuários simultâneos.

---

## 1) Correção prioritária aplicada

### `hasOrientadorAccess()`

**Problema encontrado:**
A implementação retornava `getCargoNivel(uid) === 2`, mas a própria tabela `CARGO_LEVELS` classificava `orientador` e `supervisor` no **nível 3**. Na prática, um usuário com cargo **Orientador** nunca recebia acesso de orientador.

**Impacto:**
- falso negativo para usuários orientadores;
- risco de filtros/regras derivadas do papel de orientador nunca ativarem;
- comportamento inconsistente com o cadastro e com a hierarquia declarada no próprio módulo.

**Correção aplicada:**
- `hasOrientadorAccess()` agora identifica o papel por cargo textual (`orientador`), exclui admins/admExtra e aceita fallback por `orientadosIds` quando houver cadastro legado/incompleto;
- `filterItemsForOrientador()` agora só filtra quando o usuário logado é realmente orientador; para os demais, preserva a lista original.

**Arquivo alterado:**
- `src/shared/permissions/access-control.js`

---

## 2) Endurecimento / robustez adicional

Também foi introduzido helper interno para leitura consistente de cargo textual:
- `getCargoTexto(user)`

Ele passou a ser reutilizado em:
- `getCargoNivel()`
- `hasOrientadorAccess()`
- `hasAdminAccess()`

Isso reduz divergência entre checagens de permissão quando o cadastro usa `cargo`, `role` ou `papel`.

---

## 3) Validações adicionadas

Criado teste de regressão dedicado:
- `scripts/validate-access-control.js`

Scripts NPM expostos:
- `validate:permissions`
- `validate:architecture`

---

## 4) Evidências de validação executada

### Arquitetura
- wiring dos módulos compartilhados: **OK**
- delegação de runtime/navegação/permissões: **OK**

### Permissões
- orientador textual recebe acesso: **OK**
- supervisor não recebe acesso de orientador: **OK**
- consultor não recebe acesso de orientador: **OK**
- admin não recebe acesso de orientador: **OK**
- filtro de orientador restringe à própria carteira + orientados: **OK**
- não-orientador não sofre filtro indevido: **OK**

---

## 5) Arquivos modificados nesta rodada

- `src/shared/permissions/access-control.js`
- `scripts/validate-access-control.js`
- `package.json`
- `RELATORIO_BLOCO1_20260724.md`

---

## 6) QA E2E real — pendência para próxima etapa

Ainda não executado nesta rodada, conforme escopo definido:
- login concorrente
- chat em paralelo
- criação/edição de leads
- agenda com conflito
- uploads grandes
- sync entre abas/dispositivos
- cargas com 5 / 20 / 100 usuários simultâneos

Pré-requisitos para a próxima etapa:
- subir Worker/API
- configurar Supabase
- validar credenciais B2
- preparar massa de usuários e roteiro de concorrência real

---

## 7) Continuar a partir daqui

Na próxima rodada, seguir nesta ordem:
1. subir ambiente local/integração (Worker/API + Supabase + B2);
2. smoke test manual de autenticação e permissões;
3. rodar QA E2E real por ramp-up: 5 → 20 → 100 usuários simultâneos;
4. registrar gargalos, erros de corrida, timeouts e conflitos de consistência;
5. corrigir e emitir novo ZIP certificado.
