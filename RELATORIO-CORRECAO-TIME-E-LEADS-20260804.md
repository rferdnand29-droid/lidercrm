# Relatório de correção — Lead Livre e aba Time

## Escopo
1. Leads devem ser enviados automaticamente para **Livre somente após 3 dias completos** na etapa atual.
2. Ao abrir a página **Time**, a sub-aba **Equipe** deve aparecer carregada imediatamente.

## Diagnóstico

### 1. Prazo de envio automático para Livre
A regra automática estava duplicada em dois pontos de `js/kanban.js`:

- O indicador visual de card usava `2*24*60*60*1000`.
- A função persistente `_autoMoveStaleToLivre()` usava outro `2*24*60*60*1000` e registrava “parado 2 dias” no histórico.

Isso permitia divergência futura entre a interface e a movimentação persistida. Além disso, `js/notificacoes.js` permite automações configuráveis: uma regra já salva com “parado 2 dias” e ação “mover para Livre” poderia contornar a regra principal.

**Correção:**
- Centralizado o prazo em `KB_STALE_TO_LIVRE_DAYS=3` e `KB_STALE_TO_LIVRE_MS` em `js/kanban.js`.
- O indicador visual e `_autoMoveStaleToLivre()` agora usam a mesma constante.
- O histórico passa a registrar o número de dias pela constante.
- Em `js/notificacoes.js`, automações de Leads cujo destino é `livre` recebem um mínimo obrigatório de 3 dias, inclusive se uma configuração antiga armazenada no servidor tiver 2 dias.

### 2. Página Time abre vazia
A navegação libera a página Time com `_lfTimeTabAllowed()`, que aceita escopo `ALL` ou `DEPARTMENT`. Porém, `renderTimePage()` e `renderTimeConsFilter()` exigiam apenas `hasSupervisorAccess()`. Assim, uma pessoa autorizada via escopo de departamento podia entrar na página, mas a renderização retornava antes de preencher a sub-aba Equipe.

Havia também uma fragilidade de inicialização: entrar em Time chamava `renderTimePage()` diretamente, enquanto a sub-aba Equipe não acionava a própria carga ao ser selecionada.

**Correção:**
- Criada `_timePageAllowed()` em `js/relatorios.js`, reutilizando a mesma regra de autorização da navegação quando ela estiver disponível.
- `renderTimePage()`, `renderTimeConsFilter()` e a atualização agendada usam essa mesma autorização.
- `timeGoTab('equipe')` agora carrega `renderTimePage()`.
- `goPage('time')` seleciona e carrega explicitamente a sub-aba Equipe.

## Arquivos alterados

- `js/kanban.js`
  - Constante central do prazo de 3 dias.
  - Indicador visual de inatividade.
  - `_autoMoveStaleToLivre()` e texto do histórico.
- `js/notificacoes.js`
  - Proteção contra automação antiga que mova Leads para Livre antes de 3 dias.
- `js/relatorios.js`
  - Autorização coerente e carga da sub-aba Equipe.
- `js/app.js`
  - Inicialização explícita de Equipe ao entrar em Time.
- `scripts/apply-time-and-stale-leads-fix.mjs`
  - Script reaplicável; cria arquivos `.bak` antes das alterações.

## Hipóteses verificadas e descartadas

- **Capacitor / Cloudflare:** não há código de cache, permissão nativa ou rota de Worker que execute a mudança automática de coluna; o app é servido como site estático e o prazo é calculado no JavaScript do cliente.
- **Worker de notificações:** apenas persiste regras de automação e controla autorização; não calcula o prazo nem move cards. O comentário que cita “2 dias” não é lógica executável.
- **Outros limiares de 48 horas:** a referência encontrada em `src/modules/relatorios/runtime/feed-runtime.js` é relacionada a status de feed (`vence48`) e não move Leads para Livre.

## Verificação executada

- Script aplicado em uma cópia limpa do projeto.
- Verificação sintática executada com `node --check` em `js/kanban.js`, `js/notificacoes.js`, `js/relatorios.js` e `js/app.js`.
- Confirmações estáticas no projeto limpo:
  - os dois limiares de 2 dias em `js/kanban.js` deixaram de existir;
  - a constante de 3 dias foi criada;
  - a proteção de automação está presente;
  - Time chama `timeGoTab('equipe', ...)`;
  - a aba Equipe chama `renderTimePage()`.

## Como reaplicar / rollback

Na raiz do projeto:

```bash
node scripts/apply-time-and-stale-leads-fix.mjs .
```

O script gera `*.bak` ao lado de cada arquivo modificado. Para rollback, restaure os backups:

```bash
mv js/kanban.js.bak js/kanban.js
mv js/notificacoes.js.bak js/notificacoes.js
mv js/relatorios.js.bak js/relatorios.js
mv js/app.js.bak js/app.js
```
