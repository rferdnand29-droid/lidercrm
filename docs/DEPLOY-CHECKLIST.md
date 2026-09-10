# Checklist de Deploy — Departamentos/Permissões LiderCRM

Siga na ordem. Cada etapa tem uma checkbox e diz o que fazer com o
resultado.

---

## Etapa 1 — Diagnóstico (SQL, só leitura)

```sql
\i sql/00-diagnostico-fase0.sql
```

- [ ] Rodei o bloco **0.1** e as colunas `users.id`, `users.cargo`,
      `leads/negocios/clientes.responsavel_id` apareceram na lista.
      *(Se alguma não apareceu: pare e me diga o nome real da coluna
      antes de seguir — os patches e o RLS dependem desses nomes.)*
- [ ] Rodei o bloco **0.2** e identifiquei o UID do Hudson: `______________`
- [ ] Rodei o bloco **0.5** e identifiquei o role de escrita do backend: `______________`
      com `rolbypassrls` = `______`

**Me manda esses três valores** (UID do Hudson, role de escrita,
rolbypassrls) — com isso eu:
- substituo `<UID-DO-HUDSON>` nos 15 lugares do `30-rls-cargo-departamento.sql`
- confirmo se as policies de INSERT/UPDATE/DELETE fazem efeito real no seu setup

---

## Etapa 2 — Schema

```sql
\i sql/10-schema-departamentos.sql
```
- [ ] Rodou sem erro (é idempotente, pode rodar de novo se precisar)

Rode os blocos **0.3** e **0.4** do diagnóstico de novo agora que a
coluna existe:
- [ ] Total de leads/negócios/clientes sem `departamento_id`: `______`
- [ ] Total que ficaria invisível pra todo mundo menos Hudson (0.4): `______`

---

## Etapa 3 — Criar departamentos e atribuir usuários

Isso é decisão de negócio — só vocês sabem quem está em qual time. Duas formas:

**a) Pelo console do navegador** (depois de instalar os patches — ver Etapa 4):
```js
LF_DEPARTMENTS.create({nome:'Vendas', supervisor_uid:'...'});
LF_DEPARTMENTS.assignUserToDept('uid-do-usuario', 'id-do-departamento');
```

**b) Direto no banco:**
```sql
INSERT INTO departamentos (id, nome) VALUES ('dept_vendas', 'Vendas');
UPDATE users SET departamento_id = 'dept_vendas' WHERE id IN ('uid1','uid2');
```

- [ ] Departamentos criados
- [ ] Usuários atribuídos

---

## Etapa 4 — Backfill de leads/negócios/clientes

```sql
\i sql/05-migracao-fase1.3.sql
```
Revise o relatório final (quantos ainda ficaram sem `departamento_id`)
antes de `COMMIT;` ou `ROLLBACK;` — o script explica isso no final dele.

- [ ] Rodei e revisei o relatório
- [ ] `COMMIT;` (ou resolvi manualmente e rodei de novo)

---

## Etapa 5 — Instalar os patches em STAGING (ainda não produção)

```bash
bash tools/apply-all-fixes-lidercrm-20260803.sh
```

Abra o app em staging, faça login, abra o console do navegador (F12) e cole:

```js
console.log(JSON.stringify({
  scope:        typeof LF_SCOPE_V2!=='undefined' ? LF_SCOPE_V2.diag() : 'NÃO CARREGOU',
  atividades:   typeof LF_FIX_ACTIVITY_DONE!=='undefined' ? LF_FIX_ACTIVITY_DONE.diag() : 'NÃO CARREGOU',
  senha:        typeof LF_FIX_ADM_PW_RESET!=='undefined' ? LF_FIX_ADM_PW_RESET.diag() : 'NÃO CARREGOU',
  auditoria:    typeof LF_AUDIT!=='undefined' ? LF_AUDIT.diag() : 'NÃO CARREGOU',
  departamentos:typeof LF_DEPARTMENTS!=='undefined' ? LF_DEPARTMENTS.diag() : 'NÃO CARREGOU',
  refreshLeads: typeof LF_FIX_LEAD_REFRESH!=='undefined' ? LF_FIX_LEAD_REFRESH.diag() : 'NÃO CARREGOU'
}, null, 2));
```

- [ ] Colei o resultado disso de volta pra mim.

**O que eu vou olhar nesse resultado:** se cada `diag()` retornou dados
normais (não "NÃO CARREGOU") e se os avisos `[lf-*] nenhuma função ...
encontrada após N tentativas` apareceram no console — isso indica quais
patches não acharam as funções reais do seu app e precisam de ajuste
fino (nomes de função diferentes dos que o pacote tenta adivinhar).

---

## Etapa 6 — Ligar o escopo v2 aos poucos (ainda staging)

```js
LF_SCOPE_V2.setHudson({uid:'9ba39d20-61e3-47e3-a99c-0e8dd559ecae', email:'adm@liderfinanceira.com'});
LF_SCOPE_V2.enable();
LF_SCOPE_V2.diag();
```
- [ ] `diag()` mostra `flagOn: true` e o `scope` resolvido faz sentido
      pro usuário logado (confira contra a regra: Hudson=ALL, cargo alto
      + depto=DEPARTMENT, resto=SELF)

Teste na prática:
- [ ] Logado como consultor comum: só vê os próprios leads
- [ ] Logado como supervisor com departamento: vê o departamento inteiro
- [ ] Logado como Hudson: vê tudo

---

## Etapa 7 — RLS em staging

```sql
\i sql/30-rls-cargo-departamento.sql
```
(com o UID do Hudson já substituído — eu faço isso depois da Etapa 1)

- [ ] SELECT funciona como esperado pros três perfis de teste da Etapa 6
- [ ] **INSERT** de um lead novo funciona com um usuário comum autenticado
- [ ] **UPDATE** de um lead existente funciona
- [ ] **DELETE** funciona (ou é corretamente bloqueado, se for o caso)

Se algum desses falhar com erro de permissão, é sinal de que a
premissa da Etapa 1 (role de escrita = role de leitura, sem
BYPASSRLS) não bate com a realidade — me avisa que a gente ajusta.

---

## Etapa 8 — Produção

Só depois de tudo acima verde em staging. Ordem sugerida:
1. `tools/apply-all-fixes-lidercrm-20260803.sh` em produção
2. Confirmar os `diag()` da Etapa 5 em produção também
3. `LF_SCOPE_V2.enable()` só pra um piloto pequeno primeiro (ex.: só você)
4. Expandir gradualmente
5. RLS por último, só depois do piloto do client-side estar estável
