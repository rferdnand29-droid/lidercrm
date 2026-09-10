# RELATÓRIO — FIX cache: mudanças recentes "não apareciam" mesmo após deploy

**Data:** 22/08/2026
**Relatado:** mudanças do Analytics não apareciam na tela mesmo depois
do deploy mais recente.

## Causa raiz — e é mais abrangente do que só o Analytics

Conferi o arquivo que entreguei — a recalibração do Analytics **está
lá**, correta. O problema não era o código: era **cache**.

Toda tag de script/estilo no CRM tem um parâmetro no final da URL
(tipo `dashboard.js?v=20260819leadchat1`) que existe justamente pra
avisar o navegador "esse arquivo mudou, busca de novo em vez de usar o
que já tem guardado". **Esse parâmetro não estava sendo atualizado**
quando eu editava um arquivo já existente — só quando eu criava um
arquivo novo do zero. Resultado: o navegador (ou a rede/CDN de vocês)
via a mesma URL de sempre e continuava servindo a versão antiga, guardada
em cache, mesmo com o conteúdo do arquivo tendo mudado de verdade no
servidor.

**Isso não afetava só o Analytics** — encontrei **186 arquivos**
(praticamente todo o CRM: Kanban, Papo, login, Configurações, CSS
etc.) presos nessa mesma data de cache parada em 19/08. Ou seja,
qualquer correção que eu tenha feito em qualquer um desses arquivos ao
longo de várias sessões corria o risco de ficar "invisível" pra quem
não limpasse o cache manualmente (Ctrl+Shift+R, ou modo anônimo) depois
de cada deploy.

## Correção

Atualizei esse parâmetro de cache pra uma versão nova, de hoje, em
todos os 186 pontos — de uma vez, nos 2 arquivos principais
(`index.html`, `app.html`). Isso força QUALQUER navegador ou CDN a
tratar esses arquivos como novos e buscar a versão atual, sem precisar
de nenhuma ação manual de quem estiver usando o CRM.

## O que fica valendo daqui pra frente

A partir de agora, toda vez que eu editar um arquivo já existente
(não só quando crio um novo), vou atualizar esse mesmo parâmetro de
cache — pra esse problema não se repetir em nenhuma entrega futura.

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

Depois de subir este zip, abra o CRM (pode ser numa aba normal mesmo,
não precisa ser anônima) e confira o Analytics — os cards devem
aparecer com os nomes novos (Leads Adicionados, Leads Agendados,
Taxa Conversão, Taxa Vídeo/Loja → Ficha etc.) sem precisar limpar
cache manualmente.

## Reversão

Reversível — é só um parâmetro de URL, não muda nenhuma lógica nem
dado. Não afeta nada além de forçar o recarregamento dos arquivos.
