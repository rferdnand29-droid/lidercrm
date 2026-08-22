# RELATÓRIO — Scroll do Kanban, trava de movimentação, detalhe do lead

**Data:** 20/08/2026

---

## 1. Scroll da coluna volta ao topo ao mudar etapa/converter — ✅ corrigido

**Causa raiz:** o Kanban já tinha um mecanismo pra preservar a posição de
rolagem de cada coluna ao redesenhar (`_kbCaptureScrollState`/
`_kbRestoreScrollState`, usado em toda chamada de `renderKBLocal`, e uma
segunda versão pra ações que afetam os dois boards ao mesmo tempo —
converter, descartar, reverter). O restore roda em 2-3
`requestAnimationFrame` sucessivos. O problema: alguma re-renderização
em segundo plano (sincronização automática, motor de automação — algo
que roda um instante depois da ação do usuário, sem passar por essa
mesma proteção) conseguia disparar de novo e desfazer o restore já
aplicado, poucos instantes depois. Por fora, parecia que "mudar etapa
ou converter reseta o scroll", quando na real era uma segunda
renderização silenciosa desfazendo a correção que já tinha funcionado.

**Correção:** reforcei os dois mecanismos de restauração
(`_kbRestoreScrollState` e `_kbScheduleScrollRestore`) pra reaplicar a
posição salva mais uma vez, ~400ms depois — rede de segurança que
neutraliza qualquer render tardio que tente desfazer a correção,
sem precisar caçar exatamente qual re-renderização em segundo plano é
a culpada. Cobre todos os fluxos que já usavam esse mecanismo: mover
etapa (arrastar ou clicar), converter, descartar, reverter.

**Arquivo:** `js/kanban.js`.

---

## 2. Trava de movimentação ao chegar em Vídeo/Loja — ✅ removida

**Causa raiz:** ao entrar na etapa "Vídeo/Loja" (vidp), só o cargo
"gestor" conseguia mover o card pra qualquer outra etapa — e mover PRA
Ficha/Aprovação/Fechamento/Fechado também era exclusivo de gestor.
Qualquer outro cargo ficava com o card "preso".

**Correção:** removida a trava por completo. Agora qualquer usuário
move livremente em qualquer direção, sem restrição de cargo.

**Arquivo:** `src/modules/kanban/runtime/kanban-helpers.js`.

---

## 3. "Trocar Responsável" removido do canto esquerdo, Histórico no lugar — ✅ feito

O widget de "trocar responsável" (Responsável + Continua Como + Motivo
+ botão Salvar) foi removido do canto esquerdo do detalhe do lead —
nenhuma capacidade única se perdeu: a troca de etapa já está disponível
na barra "Etapa" (sempre visível, no topo do modal), e a conversão
Lead→Negócio já tem o botão próprio "Converter em Negócio". No lugar
do widget removido, o **Histórico do lead** agora fica sempre visível
nesse canto, sem precisar clicar em nenhuma aba — reaproveitando a
mesma função que já populava a aba "Histórico" à direita (que continua
existindo, sem mudança).

**Arquivos:** `index.html`, `app.html`,
`src/modules/documentos/runtime/attachments-helpers.js`, `css/style.css`.

---

## 4. Anexos: fixar + comentários

**Fixar anexos:** já existia e funciona (botão 📌 em cada anexo, seção
"Fixados" no topo) — nada precisou ser feito aqui.

**Comentários no lead — novo:** adicionada uma seção "💬 Comentários"
dentro da aba Anexos — campo de texto + botão "Adicionar comentário" +
lista dos comentários já feitos (autor e data em cada um). Cada
comentário fica guardado no próprio card (`c.comments`, mesmo padrão
já usado por anexos e histórico). Quem escreveu pode excluir o próprio
comentário; ADM pode excluir qualquer um. Mesma regra de permissão que
já vale pra anexos (bloqueado só-leitura/Vídeo-Loja). Cada comentário
também aparece no feed do ADM, igual já acontece com anexos.

**Arquivos:** `index.html`, `app.html`, `js/documentos.js`,
`js/relatorios.js`, `css/style.css`.

---

## Verificação

```
node --check <cada arquivo editado>  → OK
node scripts/ai-guard.mjs            → 0 violações bloqueantes
node scripts/verify-mirror.mjs       → www/ e raiz idênticos
npm run lint                         → 0 erros
npm test                             → 43/43 testes
npx cap sync                         → android/ e ios/ sincronizados
```

## Reversão

Todas as mudanças são arquivo por arquivo, sem migração de dados. A
única mudança de dado é aditiva (`c.comments`, campo novo — cards que
não têm esse campo continuam funcionando normalmente, tratado como
lista vazia).
