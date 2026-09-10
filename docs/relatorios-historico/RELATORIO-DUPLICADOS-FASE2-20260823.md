# RELATÓRIO — Fase 2: Mesclagem Manual (padrão Bitrix24)

**Data:** 23/08/2026
**Escopo:** item 4 do documento (mesclagem manual, inclusive entre
donos diferentes) + item 5 (Observador, acoplado ao fluxo de
mesclagem) + a parte de item 3/7 que fala em lixeira recuperável.

---

## O que foi implementado

### Fluxo completo de mesclagem (a partir do botão "🔀 Mesclar" na lista de duplicatas)

1. **Escolher o registro base** — os dois cards lado a lado, toque
   pra escolher qual sobrevive.
2. **Comparação campo a campo** — Nome, Nicho (só Leads), Etapa (só
   quando os dois são do mesmo tipo), Observação:
   - Iguais nos dois → preenchido automaticamente, sem ação.
   - Diferentes → botões pra escolher qual valor manter.
3. **Telefone — campo multi-valor de verdade** — em vez de escolher
   um, uma lista com **todos os números dos dois registros**,
   cada um com checkbox (incluir/excluir) e um botão "tornar
   principal". Nenhum número é perdido.
4. **Responsável** — campo de valor único (como o documento pede);
   quando os donos são diferentes, escolhe qual permanece, com um
   atalho de um clique: "+ Adicionar [outro] como observador".
5. **Pré-visualização** mostrando como o registro final vai ficar,
   antes de confirmar.
6. **"Mesclar" e "Mesclar e editar"** — o segundo já abre o detalhe
   do registro final pra revisão, como pedido.

### Lixeira de mesclagem (30 dias)
O registro "perdedor" de uma mesclagem não é apagado — vai pra uma
lixeira dedicada, com botão "🗑 Lixeira" no topo do modal de
Duplicatas, cada item com "↩ Restaurar". Expira sozinho depois de 30
dias.

### Observador (item 5)
Novo campo `observadores` (lista de usuários) em Leads e Negócios. O
atalho de um clique no fluxo de mesclagem adiciona o dono "perdedor"
como observador do registro final. Um observador consegue **abrir e
visualizar** o registro (somente leitura) mesmo sem ser mais o
responsável — estendi a checagem de permissão que já existia
(`openKBDet`) pra reconhecer isso.

---

## Adaptações e limitações — registradas, não improvisadas

- **Telefone multi-valor**: este app sempre teve telefone como um
  campo único (`tel`). Criei um campo novo e aditivo (`telefones`,
  lista) que guarda todos os números vistos numa mesclagem — `tel`
  continua existindo e sendo o "principal" (é o que todo o resto do
  app já usa pra ligar/WhatsApp). Não retro-adaptei a lista de cards
  nem outras telas pra mostrar múltiplos telefones — isso ficaria
  pra uma polida futura, se for importante; o que importava pro
  critério de aceite (nenhum telefone perdido) está garantido no
  dado.
- **E-mail**: não existe esse campo no Lead/Negócio deste app (já
  registrado na Fase 1) — não faz parte da mesclagem por não existir.
- **Observador — alcance real**: o atalho de um clique funciona e o
  campo é gravado corretamente. A checagem de acesso (`openKBDet`)
  agora reconhece o observador. **Mas** isso cobre bem o caso comum
  (observador dentro do mesmo departamento/equipe, onde o dado já
  chega sincronizado no aparelho por conta da regra de visibilidade
  que já existe). Um observador **totalmente fora** do escopo normal
  de sincronização do app ainda não teria esse registro baixado no
  aparelho pra visualizar — resolver isso por completo pediria mudar
  a camada de sincronização (que dados cada usuário baixa), não só a
  checagem de permissão. Registrado como limitação, não escondido.
- **Armazenamento local**: mesma limitação já registrada na Fase 1 —
  lixeira de mesclagem e configuração de campos ficam por aparelho,
  não sincronizados entre dispositivos/usuários por enquanto.
- **Mesclagem só entre pares** (2 registros por vez) — o documento
  descreve o fluxo inteiro em termos de "dois registros"; mesclagem
  de 3+ de uma vez ficaria pra uma extensão futura, se precisar.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | fluxo de mesclagem completo, lixeira, campo Observador, permissão de visualização estendida |
| `index.html`, `app.html` | modais de Mesclagem e Lixeira de Mesclagem |
| `css/style.css` | estilo da tela de mesclagem |

## Verificação

```
node --check js/kanban.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

Renderizei a tela de mesclagem com o CSS real antes de entregar —
prévia no zip.

## Como validar manualmente

1. Como ADM, achar um par de duplicatas com donos diferentes.
2. Clicar "🔀 Mesclar" → escolher a base → conferir que campos iguais
   vêm preenchidos e diferentes pedem escolha.
3. Desmarcar um telefone, marcar o outro como principal → conferir na
   pré-visualização.
4. Escolher o responsável diferente do base → clicar "Adicionar como
   observador" → Mesclar.
5. Conferir que o registro perdedor sumiu da lista ativa.
6. Abrir "🗑 Lixeira" → Restaurar → conferir que volta.
7. Logar como o "dono perdedor" (agora observador) → tentar abrir o
   registro mesclado → deve conseguir ver, mesmo não sendo mais dono.

## Reversão

Reversível arquivo por arquivo, sem migração de dado — `observadores`
e `telefones` são campos novos e aditivos; cards existentes sem eles
continuam funcionando normalmente.

## Próxima fase

Item 2 (verificação automática agendada) e item 3 (mesclagem
automática quando 100% idêntico) — me avisa quando quiser seguir.
