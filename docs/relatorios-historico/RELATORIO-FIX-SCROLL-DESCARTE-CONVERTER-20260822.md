# RELATÓRIO — FIX rolagem voltando ao topo em Descartar/Converter

**Data:** 22/08/2026
**Relatado:** descartar ou converter um lead faz a rolagem (que estava
no final da lista) voltar pro topo, exigindo rolar tudo de novo.

## Causa raiz — duas, uma pra cada ação

### Descartar

A confirmação de "Descartar" (mover Lead/Negócio pra etapa Descartado/
No-Show) redesenhava o board **sem nenhuma proteção de rolagem** — as
duas ações "vizinhas" (Converter, Excluir permanentemente) já tinham
essa proteção há sessões; Descartar tinha ficado de fora.

**Correção:** mesma proteção que as outras duas já usam.

### Converter (e principalmente Converter em Massa)

A conversão individual **já tinha** a proteção — só que a conversão
**em massa** (selecionar vários leads e converter de uma vez) chama a
função de conversão individual **em loop, um atrás do outro, sem
esperar nenhuma pausa entre eles**. Cada conversão individual já tenta
proteger a rolagem por conta própria — só que essa proteção não é
instantânea (agenda a restauração pra rodar logo em seguida, não na
hora). Convertendo vários de uma vez, essas proteções ficavam
disputando entre si: uma conversão posterior podia "medir" a posição
da rolagem bem no meio da tela ainda se ajustando pela conversão
anterior — e a última a terminar vencia com uma medição errada,
deixando tudo no topo.

**Correção:** a conversão em massa agora protege a rolagem **uma vez
só, em volta do lote inteiro** — mede a posição antes de começar
qualquer conversão, e restaura só depois que todas terminaram. As
proteções individuais de cada conversão continuam rodando por dentro
(inofensivas), mas a proteção externa (medida antes de qualquer coisa
mudar) tem a palavra final.

Também corrigi um ponto menor: converter um Lead que **já tinha sido
convertido antes** (ex.: clicar duas vezes) tinha esse mesmo problema
— sem proteção nenhuma. Corrigido igual.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | proteção de rolagem na confirmação de Descartar; conversão em massa protegida como um lote só |
| `js/relatorios.js` | proteção no caminho de "já convertido antes" |

## Verificação

```
node --check js/kanban.js js/relatorios.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Numa etapa com vários leads, rolar até o final da lista.
2. Descartar um lead do meio/fim da lista — a rolagem deve continuar
   aproximadamente no mesmo lugar.
3. Repetir com Converter (individual).
4. Selecionar vários leads (uns 5-10) e converter em massa — a
   rolagem deve continuar no lugar, mesmo convertendo vários de uma
   vez.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
