# RELATÓRIO — Remover sub-etapa do mobile + acelerar sincronização PC

**Data:** 21/08/2026

---

## 1. Sub-etapa removida do mobile — ✅ feito

O bloco visual de sub-etapa (barra segmentada de 5 blocos + botão
"2° tentativa"/"Sub-etapa") foi removido dos cards do celular.

Não mexi no dado por baixo (`card.sub`) nem apaguei as funções que o
gerenciam — cards que já tinham uma sub-etapa marcada não perdem essa
informação, só deixou de aparecer/ser editável na tela. O desktop
nunca teve essa feature, então nada muda lá.

**Arquivo:** `js/kanban.js`.

---

## 2. Ações do Capacitor demorando pra aparecer no PC — ✅ corrigido

**Causa raiz:** o PC verifica se algo mudou no servidor a cada **45
segundos** — e só nisso, enquanto a pessoa está parada na tela de
Leads/Negócios (proteção que já existia pra não gastar dado/bateria à
toa). Criar um lead no app do celular e o PC só "descobrir" isso até
45 segundos depois é exatamente o comportamento relatado — daí o F5
"resolver na hora": força uma busca imediata, pulando a espera.

**Correção:** reduzi esse intervalo de 45s pra **15s** — 3x mais
rápido. Mantive exatamente as mesmas proteções que já existiam (só
roda com a aba visível, só na página certa) — a diferença é
unicamente a frequência.

Também conferi: quando alguém troca de aba/app e volta pro PC, **já
existe** um gatilho que sincroniza na hora (não espera o próximo
tick) — isso já funcionava antes e continua funcionando igual. O
ajuste que fiz cobre o caso complementar: pessoa que já está com a
tela de Leads aberta, olhando, sem trocar de nada.

**Por que não deixei ainda mais rápido:** reduzir demais aumentaria o
consumo de rede/servidor proporcionalmente, sem necessidade — 15s já
é rápido o suficiente pra não precisar de F5 na prática, sem exagerar
no custo. Se depois de usar um tempo ainda achar lento, dá pra
reduzir mais.

**Arquivo:** `js/app.js`.

---

## Verificação

```
node --check js/kanban.js js/app.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. **Sub-etapa:** abrir Leads/Negócios no celular — o bloco de
   sub-etapa não deve mais aparecer em nenhum card.
2. **Sincronização:** criar um lead no app do celular, olhar o PC
   (já na tela de Leads, sem trocar de aba) — deve aparecer sozinho
   em até 15 segundos, sem precisar de F5.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
