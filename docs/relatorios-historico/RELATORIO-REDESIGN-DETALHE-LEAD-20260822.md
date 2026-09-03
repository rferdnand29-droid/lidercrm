# RELATÓRIO — Redesign da tela de detalhes do Lead

**Data:** 22/08/2026
**Pedido:** reorganizar a tela de detalhe do lead seguindo o mockup de
referência (layout/hierarquia/comportamento — não o código), mantendo
100% da funcionalidade existente.

---

## 1. Investigação prévia (antes de mexer em qualquer coisa)

**Tela/componente encontrado:** modal `#mo-kb-det`, em `index.html` e
`app.html` (mantidos em paridade), com a lógica em `js/kanban.js`
(`openKBDet`) e `src/modules/documentos/runtime/attachments-helpers.js`
(abas, histórico, anexos).

**Stack identificada:** HTML/CSS/JS puro — sem framework, sem
biblioteca de componentes. Um único `css/style.css` com variáveis CSS
(design tokens) já estabelecidas.

**Tokens já existentes, reaproveitados (não copiei a paleta do
mockup):**
- `--amber`/`--al`/`--ad` (dourado) — já muito próximo do "gold" do
  mockup.
- `--bg`/`--bg2`/`--bg3`/`--card`/`--card2` (superfícies escuras).
- `--tx`/`--mu`/`--m2` (texto primário/secundário/terciário).
- `--b1`/`--b2` (bordas, já tingidas de dourado — característica de
  marca do app, preservada).
- `--ok` (verde) / `--rl` (vermelho) — já correspondem aos "green"/
  "red" do mockup.
- Fonte `Outfit` (já usada em todo o app).

---

## 2. O que mudou — mapeado item a item do pedido

| Pedido | Implementado |
|---|---|
| Etapa como trilha horizontal | Trilha com pontos conectados por linha, estado "concluída" (dourado preenchido) / "atual" (contorno dourado + brilho) / "pendente" (contorno cinza) — calculado pela posição da etapa atual na lista, sem inventar dado novo. |
| Ações rápidas em linha única | Ligar / WhatsApp / Lembrete — mesmos 3 botões que já existiam, agora lado a lado, ícone em cima + rótulo embaixo, compactos. |
| Anotações/Lembretes/Comentários recolhíveis | 3 cartões, fechados por padrão, expandem ao tocar no cabeçalho. Subtítulo mostra um resumo (ex.: "2 pendentes", "Nenhum comentário") — usando só dado que já existe, sem rastrear nada novo. |
| Anexos: dropzone compacta + chips | Área de soltar arquivo virou uma linha só (ícone + texto + botão); a frase longa "PDF · Word · Excel · Imagens · Áudio · Vídeo · Máx 10MB..." virou chips com ícone. |
| Histórico como linha do tempo | Trilha vertical com um ícone por evento — inferido por palavra-chave no texto que já existia (criado→➕, movido→↗, excluído→🗑 etc.), sem precisar de campo novo no dado. |
| Barra inferior com hierarquia | Editar em destaque (dourado); Excluir isolado (vermelho); Fechar e Descartar neutros. |

---

## 3. Funcionalidade preservada — nada de lógica reescrita

- Todos os `id` e `onclick` existentes continuam exatamente iguais
  (`moveCard`, `callClient`, `openWhatsApp`, `openQuickActivity`,
  `autoSaveKBObs`, `autoSaveKBValor`, `editKBFromDet`,
  `discardKBFromDet`, `deleteKBCard`, `addLeadComment` etc.) — só a
  marcação visual ao redor mudou.
- `switchDetTab()` (troca de aba) não foi tocada.
- `_linkedActsSummaryHTML()` (conteúdo de Lembretes) não foi tocada —
  só passou a ficar dentro de um cartão recolhível.
- Nenhuma classe **compartilhada com outras telas** foi alterada
  (`.kb-call-btn`, `.kb-wa-btn`, `.kb-act-btn`, `.mbtns`, `.att-dropzone`
  continuam servindo o card do board e outros modais exatamente como
  antes) — tudo novo é classe própria ou escopado por `#mo-kb-det`.

## 4. Um ajuste que fiz por conta própria, e por quê

O botão "Descartar" usa a mesma classe (`.bd`) de outros modais de
confirmação do app, onde o vermelho faz sentido. Aqui especificamente,
isso deixava "Descartar" visualmente quase idêntico a "Excluir" — o
oposto da hierarquia pedida (só Excluir deveria chamar atenção).
Adicionei uma correção pontual, só para este botão neste modal
específico, deixando-o neutro — sem mexer na classe `.bd` em si, que
continua vermelha em todo o resto do app.

## 5. Testado visualmente antes de entregar

Renderizei o modal de verdade (com o CSS real do projeto, dados de
exemplo) pra conferir cada peça antes de fechar — encontrei e corrigi
um bug real nesse processo: a linha de ações rápidas usava
`display:contents` num wrapper, que não é confiável em todo motor de
navegador (especialmente WebViews Android mais antigas). Troquei por
uma abordagem flexbox padrão, mais robusta.

## 6. Se algo no mockup não fazia sentido — registrado, não improvisado

- O mockup mostra "Última edição há 2 dias" e datas de eventos
  específicas — isso exigiria rastrear quando cada campo foi editado
  pela última vez, um dado que **não existe hoje**. Optei por
  subtítulos baseados no que já existe (tem/não tem conteúdo,
  contagem), em vez de inventar rastreamento novo — mantendo a
  reorganização como pedida, sem virar reescrita de lógica.
- Não adicionei o avatar circular do mockup (ícone de contato) — é
  puramente decorativo, sem função, e não estava claro que fosse
  essencial ao pedido; posso adicionar se quiser.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html` | estrutura do modal reorganizada |
| `css/style.css` | todo o CSS novo do redesign |
| `js/kanban.js` | geração da trilha de etapa + ações rápidas + subtítulos dos cartões |
| `js/documentos.js` | alias de `toggleDetCard` |
| `src/modules/documentos/runtime/attachments-helpers.js` | `toggleDetCard()`, histórico como timeline, subtítulo de Comentários |

## Verificação

```
node --check (todos os JS alterados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Abrir o detalhe de um Lead — conferir a trilha de etapa, ações
   rápidas em linha, cartões fechados por padrão.
2. Tocar em "Anotações"/"Lembretes"/"Comentários" — devem expandir.
3. Ir na aba Anexos — conferir a área de soltar compacta e os chips.
4. Ir na aba Histórico — conferir a linha do tempo com ícones.
5. Conferir a barra inferior — Editar em destaque, Excluir isolado.
6. Testar em Negócios também (etapas diferentes, com "Valor da Venda").

## Reversão

Reversível arquivo por arquivo, sem migração de dado — puramente
estrutural/visual.
