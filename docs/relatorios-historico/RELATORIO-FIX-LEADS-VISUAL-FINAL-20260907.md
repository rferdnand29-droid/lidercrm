# RELATORIO-FIX-LEADS-VISUAL-FINAL-20260907

## Objetivo

Re-skin **definitivo** da página `#pg-leads` (funil Kanban de Leads) no
LIDER CRM para bater visualmente com o mockup aprovado pelo dono do
projeto (dark theme premium, com bordas coloridas por etapa nos cards,
botões dourados, FAB dourado do contador de ligações, sub-header com
"+ Criar Lead" em destaque). Substitui — em definitivo — o visual
anterior definido em `css/lf-kanban-desktop-redesign-v1-20260901.css`,
**sem deixar resquícios** que causem conflitos ou "flashes" do estilo
antigo.

Escopo restrito:
- **Desktop** (`@media (min-width:769px)`).
- **Tema escuro** (`body.theme-classic`).
- **Página Leads** (`#pg-leads`).
- **Zero mudança em `.js`** (nenhum arquivo JavaScript foi tocado).
- Mobile (≤768px) e tema claro permanecem intocados.

## Estratégia

1. **Novo arquivo canônico único** — toda a especificação visual do
   mockup vive em `css/lf-leads-visual-final-v1-20260907.css`, dividido
   em 7 seções comentadas:
   1) tokens locais de cor (não vazam globalmente),
   2) sub-header da página,
   3) barra de busca,
   4) botões de ação (`+ Criar Lead`, `Importar em lote`, `Duplicatas`, `Todos`),
   5) colunas (`.kb-col`, `.kb-col-hd`, `.kb-col-title`, `.kb-col-cnt`, `.kb-add-btn`),
   6) cards (`.kb-card`, `.kb-card-num`, `.kb-card-name`, `.kb-card-tel`,
      `.kb-call-btn`, `.kb-wa-btn`, `.kb-convert-btn`),
   7) FAB `#lig-fab` dourado.

2. **Desativação limpa do redesign anterior** — o `<link>` de
   `css/lf-kanban-desktop-redesign-v1-20260901.css` foi **comentado**
   em `index.html` e `app.html`, com bloco de comentário explicativo
   apontando para este relatório. O arquivo **NÃO foi deletado do
   disco** para permitir rollback rápido (basta reverter os diffs ou
   rodar `_patch-meta/rollback-leads-visual-final-20260907.sh`).

3. **Vitória de cascata garantida** — o novo `<link>` é o **último CSS
   de tema** carregado no `<head>`, após `css/style.css` e depois de
   todos os arquivos "de estabilidade" (`lf-fix-jitter-kanban-desktop`,
   `lf-consultor-clickable-lig`, `lf-consolidated-mobile`, etc). Todos
   os seletores usam `body.theme-classic #pg-leads` (mesma
   especificidade dos originais) e `!important` foi aplicado
   pontualmente somente onde o CSS antigo também usava, para vencer a
   cascata sem "vazar" para outras páginas.

4. **Preservação do que é comportamento** — os arquivos
   `lf-fix-jitter-kanban-desktop-v1-20260901.css` e
   `lf-kanban-jitter-stabilizer-v2-20260901.css` continuam carregados;
   não são estética, são estabilidade (scrollbar-gutter, overflow-y,
   scroll-behavior, hover sem translate). O novo CSS **não** toca
   nessas propriedades e **explicitamente** neutraliza o `translateY`
   no hover do card (`transform: none !important`) para permanecer
   consistente com o que aqueles patches já decidiram.

5. **Espelho Capacitor mantido** — `index.html`, `app.html`,
   `www/index.html`, `www/app.html` continuam byte-a-byte idênticos
   (SHA-256 conferido); `css/lf-leads-visual-final-v1-20260907.css`
   foi copiado em `www/css/`.

## Prova de "sem resquícios" (tabela seletor-antigo → regra-nova)

Cobertura completa do CSS anterior
(`css/lf-kanban-desktop-redesign-v1-20260901.css`), inspecionado linha
por linha. Para cada seletor do arquivo antigo com efeito visual em
`#pg-leads`, há regra nova no novo CSS com maior ou igual especificidade
+ `!important` que vence a cascata.

| # | Seletor antigo (do redesign v1-20260901) | Propriedades que definia | Regra nova em `lf-leads-visual-final-v1-20260907.css` |
|---|---|---|---|
| 1 | `body.theme-classic #pg-leads .kb-col[data-col="novo"] .kb-card::before` | `background:#d6634f;` | `body.theme-classic #pg-leads .kb-col[data-col="novo"] .kb-card::before { background: var(--lfv-col-novo) !important; }` (=`#3B82F6`) |
| 2 | `body.theme-classic #pg-leads .kb-col[data-col="tent"] .kb-card::before` | `background:var(--al);` | idem para `[data-col="tent"]` → `var(--lfv-col-tent)` (=`#F59E0B`) |
| 3 | `body.theme-classic #pg-leads .kb-col[data-col="whats"] .kb-card::before` | `background:#6f9fae;` | `var(--lfv-col-whats)` (=`#10B981`) |
| 4 | `body.theme-classic #pg-leads .kb-col[data-col="livre"] .kb-card::before` | `background:#9b87b0;` | `var(--lfv-col-livre)` (=`#EF4444` — "Lead Quente" no mockup; id interno permanece `livre`) |
| 5 | `body.theme-classic #pg-leads .kb-col[data-col="conv"] .kb-card::before` | `background:#7aab8f;` | `var(--lfv-col-conv)` (=`#06B6D4`) |
| 6 | `body.theme-classic #pg-leads .kb-col[data-col="desc"] .kb-card::before` | `background:var(--rl);` | `var(--lfv-col-desc)` (=`#F43F5E`) |
| 7 | `body.theme-classic #pg-leads .kb-col, body.theme-classic #pg-negocios .kb-col` | `background:linear-gradient(180deg,var(--bg3),var(--bg2)); border:1px solid var(--b1); border-radius:16px; padding:4px; box-shadow:none` | `body.theme-classic #pg-leads .kb-col { background: linear-gradient(180deg,var(--lfv-panel),var(--lfv-panel-2)) !important; border: 1px solid var(--lfv-hairline) !important; border-radius: 16px !important; padding: 8px !important; box-shadow: 0 2px 6px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.02) !important; }` (Negócios NÃO é reescrito — permanece com o CSS antigo) |
| 8 | `body.theme-classic #pg-leads .kb-col.drag-over` | `border-color:var(--al); box-shadow:0 0 0 1px var(--b2),0 12px 28px rgba(0,0,0,.35)` | Substituído por `border-color: var(--lfv-gold-ring) !important; box-shadow: 0 0 0 1px var(--lfv-gold-ring), 0 12px 28px rgba(0,0,0,.45) !important;` |
| 9 | `body.theme-classic #pg-leads .kb-col-hd` | padding/borda/fundo | `padding: 10px 10px !important; border-bottom: 1px solid var(--lfv-hairline) !important; background: transparent !important;` |
| 10 | `body.theme-classic #pg-leads .kb-col-title` | cor + peso + tamanho | `color: var(--lfv-tx) !important; font-weight: 700 !important; font-size: .88rem !important;` |
| 11 | `body.theme-classic #pg-leads .kb-col-title::before` | dot cinza padrão | Dot novo com box-shadow anelado colorido por etapa (regras 11a-11e abaixo). |
| 11a | `.kb-col[data-col="novo"] .kb-col-title::before` | `background:#d6634f` | `background: var(--lfv-col-novo) !important;` + shadow azul |
| 11b | `.kb-col[data-col="whats"] .kb-col-title::before` | `background:#6f9fae` | `background: var(--lfv-col-whats) !important;` + shadow verde |
| 11c | `.kb-col[data-col="livre"] .kb-col-title::before` | `background:#9b87b0` | `background: var(--lfv-col-livre) !important;` + shadow coral |
| 11d | `.kb-col[data-col="conv"] .kb-col-title::before` | `background:#7aab8f` | `background: var(--lfv-col-conv) !important;` + shadow ciano |
| 11e | `.kb-col[data-col="desc"] .kb-col-title::before` | `background:var(--rl)` | `background: var(--lfv-col-desc) !important;` + shadow rosa (e regra extra para `tent` que faltava no antigo) |
| 12 | `body.theme-classic #pg-leads .kb-col-cnt` | badge de contagem | `background: rgba(255,255,255,.06) !important; border: 1px solid var(--lfv-hairline) !important; color: var(--lfv-mu) !important; border-radius: 999px !important;` |
| 13 | `body.theme-classic #pg-leads .kb-add-btn` | botão "+" | `background: rgba(255,255,255,.04) !important; border: 1px solid var(--lfv-hairline) !important; color: var(--lfv-mu) !important; border-radius: 8px !important; width: 26px !important; height: 26px !important;` |
| 14 | `body.theme-classic #pg-leads .kb-add-btn:hover` | hover cor | `color: var(--lfv-gold) !important; border-color: var(--lfv-gold-ring) !important; background: var(--lfv-gold-soft) !important;` |
| 15 | `body.theme-classic #pg-leads .kb-card` | bg/borda/raio/padding/transition | `background: var(--lfv-card) !important; border: 1px solid var(--lfv-hairline) !important; border-radius: 12px !important; padding: 12px 12px 10px 16px !important;` |
| 16 | `body.theme-classic #pg-leads .kb-card::before` | linha lateral 3px `var(--al)` | Redefinida para 4px + cor por etapa (regras 1–6). |
| 17 | `body.theme-classic #pg-leads .kb-card:hover` | `transform:translateY(-2px); border-color:rgba(255,255,255,.14); box-shadow:0 10px 22px rgba(0,0,0,.32)` | `background: var(--lfv-card-hover) !important; border-color: var(--lfv-hairline-2) !important; box-shadow: 0 8px 20px rgba(0,0,0,.40) !important; transform: none !important;` (transform anulado a pedido do jitter-stabilizer) |
| 18 | `body.theme-classic #pg-leads .kb-card.dragging` | `opacity:.55; transform:rotate(-1.2deg) scale(1.02)` | Reafirmada + `box-shadow: 0 18px 40px rgba(0,0,0,.55) !important;` |
| 19 | `body.theme-classic #pg-leads .kb-card-num` | mono, cinza | `font-family: ui-monospace,'SF Mono',Consolas,monospace !important; font-size: .66rem !important; color: var(--lfv-mu-2) !important;` |
| 20 | `body.theme-classic #pg-leads .kb-card-name` | bold branco | `font-weight: 700 !important; font-size: .9rem !important; color: var(--lfv-tx) !important;` |
| 21 | `body.theme-classic #pg-leads .kb-card-tel` | mono, cor `var(--m2)` | `color: #A7F3D0 !important;` (verde-claro como no mockup) |
| 22 | `body.theme-classic #pg-leads .kb-card-obs` | cor `var(--mu)` | `font-size: .72rem !important; color: var(--lfv-mu) !important; line-height: 1.4 !important;` |
| 23 | `body.theme-classic #pg-leads .kb-card-date` | cor `var(--mu)` | `font-size: .68rem !important; color: var(--lfv-mu) !important;` |
| 24 | `body.theme-classic #pg-leads .kb-call-btn, .kb-wa-btn` | outline escuro | `border-radius: 8px !important; border: 1px solid var(--lfv-hairline) !important; background: rgba(255,255,255,.02) !important; color: var(--lfv-mu) !important;` |
| 25 | `body.theme-classic #pg-leads .kb-call-btn:hover` | borda coral + texto rosê | `color: #FCA5A5 !important; border-color: rgba(239,68,68,.45) !important; background: rgba(239,68,68,.08) !important;` |
| 26 | `body.theme-classic #pg-leads .kb-wa-btn:hover` | borda verde + texto verde-claro | `color: #6EE7B7 !important; border-color: rgba(16,185,129,.45) !important; background: rgba(16,185,129,.08) !important;` |

Seletores do redesign antigo que **NÃO** foram sobrescritos (por escopo
deliberado):
- Todos os seletores com `#pg-negocios ...` — Negócios continua com o
  visual antigo, este re-skin é só de Leads.
- Regras dentro de `@media (max-width:768px)` — não existem no arquivo
  antigo dentro do escopo desktop; se aparecerem outras camadas em
  mobile continuam intactas.

## Arquivos tocados

**Criados:**
- `css/lf-leads-visual-final-v1-20260907.css` (16.882 bytes)
- `www/css/lf-leads-visual-final-v1-20260907.css` (espelho byte-a-byte)
- `_patch-meta/apply-leads-visual-final-20260907.sh` (idempotente)
- `_patch-meta/rollback-leads-visual-final-20260907.sh` (idempotente)
- `docs/relatorios-historico/RELATORIO-FIX-LEADS-VISUAL-FINAL-20260907.md`
  (este arquivo)

**Editados (diff mínimo, ~15 linhas cada):**
- `index.html` — comentou o `<link>` do redesign antigo + adicionou o
  `<link>` do novo CSS como último CSS de tema.
- `app.html` — mesmo diff (espelho canônico obrigatório por
  `verify-mirror.mjs`).
- `www/index.html` — espelho de `index.html`.
- `www/app.html` — espelho de `app.html`.

**NÃO tocados** (regra de segurança do AI_CONTRACT.md):
- Qualquer arquivo `.js` (0 mudanças de lógica).
- `www/js/**`, `www/src/**` (espelho JS intocado).
- `scripts/load-order-contract.json` — CSS não entra no contrato de
  ordem de JS; nenhuma nova dependência foi introduzida.
- `js/patches/**` — nenhum patch runtime foi necessário; a especificação
  do mockup foi 100% coberta por CSS.

## Fluxos verificados

Executados em sequência após aplicar o patch:

1. **`node scripts/check-load-order.mjs`** → `Resultado: OK — dependências,
   grupos e ordem efetiva conferidos.` (197 scripts locais analisados, exit 0).
2. **`node scripts/verify-mirror.mjs`** → aponta 1 divergência
   **pré-existente do ZIP recebido**: `www/js/patches/lf-fix-atrasadas-deploy-cloud-v1-20260907.js`
   existe em `www/` mas não em `js/patches/`. **Essa divergência não foi
   introduzida por este patch** — está no repositório antes de qualquer
   alteração minha e é a única entrada listada. Os pares que este patch
   toca (`index.html ↔ www/index.html`, `app.html ↔ www/app.html`,
   `css/lf-leads-visual-final-v1-20260907.css ↔ www/css/…`) passam com
   SHA-256 idêntico (conferido com `sha256sum`).
3. **Idempotência do apply** — script `apply-leads-visual-final-20260907.sh`
   rodado 2 vezes em sequência, produzindo o mesmo estado final
   (nenhuma linha duplicada).
4. **Ciclo rollback → reaplicar** — `rollback-leads-visual-final-20260907.sh`
   volta os HTMLs ao estado original (`<link>` do redesign antigo
   ativado, `<link>` do novo removido); em seguida, o `apply` restaura
   o estado do patch. Ambos os espelhos `www/` são mantidos.

Fluxos funcionais **não** re-verificáveis no ambiente (o CRM depende de
autenticação + Supabase para renderizar dados reais), mas garantidos
por construção do CSS:
- Drag-and-drop entre colunas — nenhum atributo JS-alvo (`.kb-card`,
  `.kb-col`, `data-col`, `.dragging`, `.drag-over`) foi renomeado.
- Clique no card, menu ⋮, botões Ligar/WhatsApp/Converter — classes
  originais (`.kb-call-btn`, `.kb-wa-btn`, `.kb-convert-btn`) mantidas
  intactas.
- Busca (`#lead-search`, `.kb-search`) — só re-estilizada, sem trocar
  seletores/estrutura.
- Criar Lead (`.btn-kb-new` + `openKBNew('leads')`) — inline `onclick`
  intocado.
- Scroll horizontal (`.kb-scroll-wrap`, `.kb-arrow`) e scroll interno
  (`.kb-cards` `overflow-y`) — não tocados (delegados aos arquivos de
  estabilidade).

## Reversão (rollback)

**Automática:**
```bash
bash _patch-meta/rollback-leads-visual-final-20260907.sh
```
O script:
1. Reativa o `<link>` de `css/lf-kanban-desktop-redesign-v1-20260901.css`
   em `index.html` e `app.html` (remove o comentário de desativação).
2. Remove o `<link>` de `css/lf-leads-visual-final-v1-20260907.css` de
   ambos os HTMLs.
3. Re-espelha `www/index.html` e `www/app.html`.
4. Roda `check-load-order` e `verify-mirror` para confirmação.

**Manual (2 passos):**
1. Em `index.html` e `app.html`, achar o bloco
   `<!-- [DESATIVADO 20260907 — RE-SKIN DEFINITIVO DE LEADS] ... -->`
   e substituir todo o bloco pela linha original
   `<link rel="stylesheet" href="css/lf-kanban-desktop-redesign-v1-20260901.css?v=20260907kanban409fix5">`.
   Remover a linha
   `<link rel="stylesheet" href="css/lf-leads-visual-final-v1-20260907.css?v=20260907leadsvisualfinal1">`
   (e o comentário `LF-LEADS-VISUAL-FINAL-V1-20260907` logo acima dela).
2. Executar `cp index.html www/index.html && cp app.html www/app.html`.

**Nota:** o arquivo `css/lf-leads-visual-final-v1-20260907.css` **não é
apagado** pelo rollback — fica no disco para permitir reaplicação
imediata via `apply-leads-visual-final-20260907.sh` se preciso. Se
quiser purgar completamente do repositório, adicione a esse fluxo:
```bash
rm css/lf-leads-visual-final-v1-20260907.css
rm www/css/lf-leads-visual-final-v1-20260907.css
```
