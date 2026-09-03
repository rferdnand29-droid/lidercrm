# RELATORIO-ARQUITETURA-DUPLICATAS-CI-TESTES-20260911

## Pedido

Executar de verdade as melhorias de arquitetura mais viáveis (itens 1,
2 e 4 do plano apresentado), sendo honesto sobre o que não cabe numa
sessão só.

## 1. Varredura sistemática de duplicações invisíveis

Escrevi um script que lista **todo** nome de função/constante global
definido em mais de um arquivo do projeto inteiro (não só uma
suspeita pontual). Rodou sobre 2.697 nomes únicos; 309 apareceram em
mais de um arquivo.

A grande maioria é ruído esperado e seguro — nomes genéricos (`_log`,
`safe`, `el`, `arr`) repetidos entre patches, cada um isolado dentro
do seu próprio escopo privado, sem colisão real entre si (confirmei
isso manualmente nos casos que pareciam mais arriscados, como
`canEditForeign` e `STATUS_NORMAL`).

**Achado real e sério**: `src/auth.js` e `src/usuarios.js` eram
cópias **completas e desatualizadas** de `js/auth.js`/`js/usuarios.js`
— faltavam nelas correções que já foram feitas há semanas, incluindo
o fix do "tremor" e o fix de aparar a senha do login. Confirmei que
**não estavam sendo carregadas em lugar nenhum** (zero referência em
qualquer HTML ou config) — ou seja, não causavam bug ativo agora, mas
eram uma mina-terrestre real: se algum dia alguém referenciasse esses
arquivos por engano (uma nova página, uma refatoração futura), todas
as correções feitas ao longo de meses seriam desfeitas de uma vez, do
mesmo jeito que já aconteceu com a proteção de "recém-excluído" antes.
Removidos os dois.

## 2. CI automático (GitHub Actions)

Criado `.github/workflows/ci.yml`, rodando em todo push/PR a mesma
checklist que já faço manualmente em toda entrega: reconstrução do
`www/`, `ai-guard`, `verify-mirror`, `lint` e os testes automatizados.
Não faz deploy nenhum — só verifica, avisando antes de algo quebrado
chegar até você sem ninguém perceber.

**Testado de verdade**, não só escrito: simulei os 9 passos do
workflow localmente (incluindo inicializar um repositório git do
zero, exatamente como o GitHub Actions faz) — todos passaram.

## 4. Testes automatizados pros pontos mais frágeis

Adicionados 13 testes novos, carregando o **código-fonte real** de
produção (mesma técnica já usada em `retry-queue-cross-tab.test.js`
— sem isso, um teste contra uma cópia não pegaria uma regressão no
arquivo de verdade):

- **`_lfListsEqualById`** (6 testes) — a causa raiz do bug do
  "tremor". Cobre: mesmos itens em ordem diferente (deve dizer
  "igual"), item realmente mudado (deve dizer "diferente"),
  tamanhos diferentes, entrada inválida.
- **`_lfMarkRecentlyDeleted`/`_lfIsRecentlyDeleted`** (7 testes) — a
  proteção contra item excluído "ressuscitando". Cobre o TTL de 7
  dias (protegido pouco antes de expirar, desprotegido pouco depois),
  e um teste de regressão **explícito** contra o bug real já corrigido
  (a implementação duplicada que só durava 5 minutos) — se alguém
  reduzir o TTL de novo por engano, esse teste específico avisa.

## O que fica de fora desta sessão — e por quê

Os itens 3, 5 a 12 do plano (destino do scaffold React, consolidação
dos mecanismos de sincronização, empacotamento, TypeScript,
monitoramento de erro, tempo real, migração de framework, auditoria
de autorização, atualização nativa de verdade) **não foram
executados**. Não é falta de vontade — são mudanças que:
- Precisam de uma decisão sua antes de eu mexer (ex.: item 3 depende
  de confirmar com o suporte da Lovable; item 8 depende de você
  escolher e criar conta num serviço de monitoramento);
- Ou são trabalho de semanas/meses que merece ser feito aos poucos,
  com revisão sua em cada etapa, não de uma vez só numa sessão —
  fazer às pressas aumentaria muito o risco de quebrar algo em
  produção.

Se quiser, posso detalhar um plano passo a passo pra qualquer um
desses itens específicos, ou começar pelo que você achar mais
prioritário.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/auth.js`, `src/usuarios.js` | removidos (cópias mortas e desatualizadas) |
| `.github/workflows/ci.yml` | novo — CI automático |
| `tests/lf-lists-equal-by-id.test.js` | novo — 6 testes |
| `tests/lf-recently-deleted-protection.test.js` | novo — 7 testes |

## Verificação

```
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 59/59 testes (46 originais + 13 novos)
npx cap sync                     → android/ios sincronizados
Workflow do GitHub Actions       → simulado localmente, 9/9 passos OK
```

## Reversão

`src/auth.js`/`src/usuarios.js`: eram cópias mortas, não precisam
voltar. `.github/workflows/ci.yml` e os 2 arquivos de teste: apagar
os arquivos, sem efeito em nenhum outro lugar do sistema.
