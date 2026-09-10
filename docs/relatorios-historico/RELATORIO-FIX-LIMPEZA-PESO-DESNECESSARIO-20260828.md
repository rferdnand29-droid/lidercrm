# RELATORIO-FIX-LIMPEZA-PESO-DESNECESSARIO-20260828

## Bug

Pedido explícito: limpar arquivos que só pesam e não influenciam o
funcionamento do CRM.

## Causa raiz

Não é um bug de código — é acúmulo natural de duas fontes:
1. 85 relatórios `.md`/`.txt` de correções concluídas, gerados um por
   um ao longo do projeto (conforme o próprio `AI_CONTRACT.md` §2.3),
   acumulados direto na raiz sem organização.
2. As pastas `android/` e `ios/` (build nativo do Capacitor) somavam
   quase 20MB dos 40MB totais do projeto — são geradas do zero a cada
   `npx cap sync` a partir do mesmo código-fonte que já vai no zip,
   então cada entrega vinha carregando uma cópia regenerável.

## Achado importante — investigado, mas NÃO removido

Encontrei ~600KB em `src/components/`, `src/hooks/`, `src/lib/` e
`src/routes/` — só arquivos `.tsx`/`.ts`, zero `.js` — que parecem ser
um scaffold completo de React/TanStack (shadcn/ui, rotas, hooks).
Confirmei que **nada disso é carregado** por `index.html`/`app.html`
(que só referenciam `.js` via `<script>`) nem por `src/modules/**`
(o código real do CRM). Achei também o motivo: `vitest.config.ts` tem
um comentário explícito dizendo que `vite.config.ts` depende de um
pacote privado do Lovable (`@lovable.dev/vite-tanstack-config`) não
instalado no projeto — ou seja, essa estrutura provavelmente pertence
ao scaffold padrão que o Lovable cria ao conectar um projeto, não ao
CRM em si.

**Não removi** porque esse projeto está conectado ao Lovable
(`AGENTS.md`), e essa estrutura pode ser esperada pelo editor da
plataforma mesmo sem ser usada pelo CRM — o risco de atrapalhar sua
conta Lovable não compensa os ~600KB economizados (1,5% do total).
Fica registrado caso você confirme que pode remover com segurança.

## Estratégia

1. **Relatórios históricos organizados**: os 85 arquivos
   `RELATORIO-*.md`/`README-PATCH-*.md`/`CORRECOES-APLICADAS-*.txt`
   foram movidos pra `docs/relatorios-historico/`, com um índice
   (`README.md`) listando todos. Nada de código referencia esses
   arquivos pelo caminho — confirmado antes de mover.
2. **`AI_CONTRACT.md` atualizado**: a convenção do §2.3 agora aponta
   novos relatórios pra `docs/relatorios-historico/` em vez da raiz —
   sem isso, a próxima correção (minha ou de outra IA) voltaria a
   acumular na raiz.
3. **`android/`/`ios/` removidos desta entrega**: confirmado que são
   saída de build 100% regenerável (`npx cap sync`), sem nenhum
   arquivo apontando pra dentro deles que não seja o próprio processo
   de sync. `www/` (o que de fato sobe no Cloudflare Pages) foi
   mantido.

## Fluxos cobertos

- Deploy web (Cloudflare Pages): usa `www/`, que continua intacto —
  nenhuma mudança de comportamento.
- Quem for compilar o app nativo: precisa rodar `npx cap add android`
  e/ou `npx cap add ios` uma vez (recria as pastas do zero a partir de
  `capacitor.config.json`), depois `npx cap sync` normalmente. Se
  você já tem essas pastas configuradas localmente (assinatura, ícone
  customizado), **não sobrescreva com o comando acima** — é só pra
  quem não tem nada local ainda.
- Se preferir que eu volte a incluir `android/`/`ios/` em toda
  entrega, é só avisar.

## Arquivos

| Arquivo/Pasta | Mudança |
|---|---|
| `docs/relatorios-historico/` | novo — 85 relatórios movidos + índice |
| `AI_CONTRACT.md` | §2.3 atualizado (novo destino dos relatórios) |
| `android/`, `ios/` | removidos desta entrega (regeneráveis) |

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → pulado (sem android/ios pra sincronizar nesta entrega)
```

## Tamanho

| | Antes | Depois |
|---|---|---|
| Total do projeto | 40MB | 20MB |

## Reversão

- Relatórios: mover de volta de `docs/relatorios-historico/` pra raiz
  (nenhum path é lido por código).
- `android/`/`ios/`: `npx cap add android && npx cap add ios && npx cap sync`.
- `AI_CONTRACT.md`: reverter a edição do §2.3 se quiser voltar à raiz.

Nenhum dado apagado; nenhum backend/SQL/migration tocado; nenhuma
lógica do CRM alterada.
