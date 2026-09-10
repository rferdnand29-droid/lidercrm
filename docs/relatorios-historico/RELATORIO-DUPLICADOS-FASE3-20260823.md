# RELATÓRIO — Fase 3: Verificação Agendada + Mesclagem Automática

**Data:** 23/08/2026
**Escopo:** itens 2 e 3 do documento — o que faltava do sistema de
duplicados "padrão Bitrix24". Com isso, os itens 0-3 do documento
estão completos.

---

## Limitação arquitetural — a mais importante desta fase, lida primeiro

Este app **não tem infraestrutura de job agendado no servidor** —
nenhum cron de verdade rodando independente de alguém estar com o app
aberto. "Diária"/"semanal" aqui funciona do mesmo jeito que o motor
de automação que já existia: a checagem roda **na próxima vez que
alguém abrir o app**, depois do prazo configurado já ter passado — se
ninguém abrir por uma semana, a verificação "diária" só vai rodar
quando alguém finalmente abrir. Resolver isso de verdade (rodar
mesmo com o app fechado) precisaria de um job no servidor (Cloudflare
Cron Triggers) — fora do escopo desta fase, registrado aqui pra você
decidir se vale a pena numa fase futura.

## O que foi implementado

### Verificação automática agendada (item 2)
- Frequência configurável por tipo de registro (Leads, Negócios
  independentes) — Diária / Semanal / Nunca — na mesma tela "⚙️
  Configurar" da Fase 1.
- Reaproveita o mesmo gatilho que já existia pro motor de automação
  (roda no carregamento do app + a cada 5 minutos enquanto estiver
  aberto) — só de fato faz alguma coisa quando o prazo configurado já
  passou.
- Botão "⚡ Verificar agora" no modal de Duplicatas — dispara na hora,
  sem esperar o agendamento, como pedido.

### Mesclagem automática (item 3)
Mescla sozinha **somente** quando as 3 condições batem ao mesmo tempo:
1. Todos os campos configurados (Fase 1) são idênticos.
2. Mesmo responsável nos dois registros.
3. (Só Leads) Mesma etapa do funil.

Qualquer uma falhando — inclusive responsáveis ou etapas diferentes —
**não mescla sozinho**: fica como candidato na lista de "🔍
Duplicatas" pra mesclagem manual (Fase 2), exatamente como pedido.

**Regra de resolução:** o mais antigo (`createdAt`) sobrevive; o
outro vai pra lixeira de mesclagem (recuperável por 30 dias, mesma
lixeira da Fase 2) — nada é apagado de vez. O evento fica no
histórico do sobrevivente.

## Uma limitação pequena, registrada

Se existirem **3 ou mais** registros 100% idênticos ao mesmo tempo, a
mesclagem automática une 2 por vez numa passada — o 3º (e além)
converge numa passada seguinte (próxima verificação agendada ou
clique em "Verificar agora"), não tudo de uma vez. Cenário raro (3+
duplicatas exatas simultâneas), mas registrado por transparência.

## Achado e correção extra — durante esta fase

Ao atualizar a versão de cache, descobri que `js/notificacoes.js`
usava uma versão própria e desatualizada (`20260820sinofix`),
desalinhada do padrão compartilhado que venho seguindo — significa
que a correção de notificação de "Lead Adicionado" (de uma sessão
anterior) também corria o risco de ficar em cache desatualizado.
Corrigido — conferi que os outros 2 arquivos com essa mesma versão
antiga genuinamente não foram tocados por mim, então está correto
deixá-los como estão.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | frequência na config, checagem agendada, mesclagem automática, núcleo de mesclagem extraído/reutilizado |
| `js/notificacoes.js` | gatilho da checagem agendada + correção da versão de cache desalinhada |

## Verificação

```
node --check js/kanban.js js/notificacoes.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Em "⚙️ Configurar", conferir o seletor de frequência por tipo.
2. Criar 2 leads com nome+telefone idênticos, mesmo responsável, mesma
   etapa → clicar "⚡ Verificar agora" → devem mesclar sozinhos.
3. Repetir com responsáveis diferentes → NÃO devem mesclar sozinhos,
   devem aparecer como candidato pra mesclagem manual.
4. Conferir que o registro mesclado automaticamente aparece na
   Lixeira, recuperável.

## Status geral do documento

| Item | Situação |
|---|---|
| 0 — conversão Lead→Negócio | ✅ Completo |
| 1 — Controle de Duplicados | ✅ Completo |
| 2 — Verificação agendada | ✅ Completo (com a limitação arquitetural registrada acima) |
| 3 — Mesclagem automática | ✅ Completo |
| 4 — Mesclagem manual | ✅ Completo |
| 5 — Observador | ✅ Completo (com a limitação de alcance de sincronização já registrada na Fase 2) |
| 6 — Lead repetido (conceito separado de duplicado) | 🔲 Não implementado ainda |

## Reversão

Reversível arquivo por arquivo, sem migração de dado.

## Próximo passo

Só falta o item 6 do documento (flag de "Lead repetido", quando o
telefone/e-mail já bate com um Contato/Empresa existente — conceito
diferente de duplicado). Me avisa se quiser que eu feche esse último
item.
