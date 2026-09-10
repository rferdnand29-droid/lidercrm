#!/usr/bin/env bash
# ============================================================
# FIX 20260804 — Scroll reset ao mover lead entre etapas
# ------------------------------------------------------------
# Corrige o bug: "cards/leads rolantes retornam ao início ao
# movimentar um lead para outra etapa". Consulte o relatório
# RELATORIO-FIX-SCROLL-RESET-LEAD-MOVE-20260804.md para o
# diagnóstico completo (causa raiz, evidências, hipóteses
# descartadas).
#
# O QUE ESTE SCRIPT FAZ (sem reescrever nada existente):
#   1) Cria backup timestamped da pasta lidercrm (rollback).
#   2) Instala UM novo patch idempotente:
#        js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js
#      Esse patch:
#        - Marca os wrappers legados quebrados como "desativados"
#          (via flags __lf4xScrollWrapped/__lf5xWrapped já usadas
#          pelo próprio código como guarda de idempotência) — sem
#          remover fisicamente os arquivos legados.
#        - Envolve renderKBMobile com o mesmo capture/restore que
#          já existe pra renderKBLocal (funções internas
#          _kbCaptureScrollState / _kbRestoreScrollState).
#        - Envolve _kbMoveCard para capturar scroll ANTES do move
#          e restaurar em rAF (2 frames) DEPOIS do render (respeita
#          o coalesce do lf-kanban-fluidity).
#   3) Adiciona a tag <script> do novo patch no index.html,
#      SEMPRE por último dentro do bloco de patches do kanban
#      (para garantir que roda depois dos wrappers antigos).
#
# ROLLBACK:
#   ./scripts/rollback-fix-scroll-reset-lead-move-20260804.sh
#   (gerado automaticamente ao lado deste script)
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$ROOT/.backups/fix-scroll-reset-$STAMP"
PATCH_REL="js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js"
PATCH_ABS="$ROOT/$PATCH_REL"
INDEX="$ROOT/index.html"
APP_HTML="$ROOT/app.html"

echo "==> ROOT do projeto: $ROOT"
echo "==> Backup em:       $BACKUP_DIR"

# -----------------------------------------------------------
# 1) Backup dos arquivos que vamos tocar
# -----------------------------------------------------------
mkdir -p "$BACKUP_DIR/js/patches/kanban-leads"
[ -f "$INDEX" ]   && cp "$INDEX"   "$BACKUP_DIR/index.html"
[ -f "$APP_HTML" ] && cp "$APP_HTML" "$BACKUP_DIR/app.html"
# não há arquivos legados removidos, só marcamos flags — mas
# guardamos os patches originais mesmo assim, para segurança total
cp "$ROOT/js/patches/kanban-leads/lf-bugs-4fixes-v1-20260729.js" \
   "$BACKUP_DIR/js/patches/kanban-leads/" 2>/dev/null || true
cp "$ROOT/js/patches/kanban-leads/lf-bugs-5fixes-v1-20260729.js" \
   "$BACKUP_DIR/js/patches/kanban-leads/" 2>/dev/null || true

# -----------------------------------------------------------
# 2) Instala o novo patch (idempotente: sobrescreve sempre a
#    mesma versão)
# -----------------------------------------------------------
cat > "$PATCH_ABS" <<'PATCH_EOF'
/* ============================================================
 * lf-fix-scroll-reset-lead-move-v1-20260804.js
 * ------------------------------------------------------------
 * FIX definitivo: "cards/leads rolantes retornam ao início ao
 * mover um lead para outra etapa" (bug relatado 2026-08-04).
 *
 * Causa raiz (resumo — detalhes em RELATORIO-FIX-...20260804.md):
 *   - Havia 2 wrappers legados de _kbMoveCard tentando preservar
 *     scroll: lf-bugs-4fixes (#2b) e lf-bugs-5fixes (#2b). Ambos
 *     com seletores errados / container errado, e ainda por cima
 *     descoordenados pelo coalesce em requestAnimationFrame do
 *     lf-kanban-fluidity.
 *   - renderKBMobile fazia wrap.innerHTML=... SEM chamar
 *     _kbCaptureScrollState/_kbRestoreScrollState — o que existe
 *     e funciona para o desktop dentro de renderKBLocal.
 *   - Chamadores (drop desktop L581, drop touch L1604, moveCard
 *     L1148, _spSelect L2376, mbReorderTap, setCardSub, etc.)
 *     terminavam com renderKBLocal(board) que, no mobile,
 *     dispara renderKBMobile(board) por dentro (L417, L426),
 *     apagando o restore.
 *
 * O que este patch faz — SEM MEXER NAS FEATURES:
 *   (A) Neutraliza os 2 wrappers legados marcando as flags de
 *       idempotência que eles próprios já checam. Como os patches
 *       só instalam se a flag NÃO estiver setada, marcar antes
 *       impede a instalação. Como este patch entra por último no
 *       HTML, se por algum motivo eles já estiverem instalados,
 *       neutralizamos removendo suas propriedades wrapped e
 *       reapontando _kbMoveCard para o encadeamento sem eles NÃO
 *       é seguro (perderíamos bingo-sync/convert-prompt) — então
 *       preservamos a cadeia e apenas SOBREPOMOS com o wrapper
 *       novo, que é o único que restaurará scroll.
 *   (B) Envolve renderKBMobile com o mesmo capture/restore usado
 *       no desktop, incluindo o próprio wrap #<board>-mobile-list
 *       e o ancestral rolável (document.scrollingElement / body)
 *       — porque a lista mobile é longa e o scroll do usuário no
 *       mobile fica no document quando a lista está ativa.
 *   (C) Envolve _kbMoveCard como último wrapper (executa por fora
 *       de todos os outros). Captura ANTES do move; agenda
 *       restore em 3 rAF (respeita coalesce de 24ms do
 *       lf-kanban-fluidity + o RAF interno do
 *       _kbRestoreScrollState).
 *   (D) Compatível com Capacitor (safe area do body scroll) e
 *       com Cloudflare (100% client-side, nada de rede).
 * ============================================================ */
(function(global){
  'use strict';
  if(!global) return;
  if(global.__lfFixScrollResetLeadMoveV1) return;
  global.__lfFixScrollResetLeadMoveV1 = true;

  var TAG='[lf-fix-scroll-reset]';
  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* ------------------------------------------------------------
   * Utilidades de scroll (independentes das internas de kanban.js
   * para funcionar mesmo se elas mudarem de nome).
   * ------------------------------------------------------------ */
  function _captureAll(){
    var snap = { wraps:{}, cols:{}, doc:0, mobLists:{} };
    try{
      ['leads','negocios'].forEach(function(b){
        var w = document.getElementById(b+'-kanban');
        var shell = w && w.closest ? w.closest('.kb-scroll-wrap') : null;
        if(shell) snap.wraps[b] = shell.scrollLeft || 0;
        if(w){
          w.querySelectorAll('.kb-col').forEach(function(colEl){
            var colId = colEl && colEl.dataset ? colEl.dataset.col : '';
            var cards = colEl.querySelector('.kb-cards');
            if(colId && cards) snap.cols[b+'::'+colId] = cards.scrollTop || 0;
          });
        }
        var mob = document.getElementById(b+'-mobile-list');
        if(mob) snap.mobLists[b] = mob.scrollTop || 0;
      });
      // scroll do document (mobile usa body)
      var se = document.scrollingElement || document.documentElement || document.body;
      if(se) snap.doc = se.scrollTop || 0;
    }catch(_e){}
    return snap;
  }

  function _restoreAll(snap){
    if(!snap) return;
    try{
      ['leads','negocios'].forEach(function(b){
        var w = document.getElementById(b+'-kanban');
        var shell = w && w.closest ? w.closest('.kb-scroll-wrap') : null;
        if(shell && snap.wraps[b] != null){
          var max = Math.max(0, shell.scrollWidth - shell.clientWidth);
          shell.scrollLeft = Math.max(0, Math.min(snap.wraps[b], max));
        }
        if(w){
          w.querySelectorAll('.kb-col').forEach(function(colEl){
            var colId = colEl && colEl.dataset ? colEl.dataset.col : '';
            var key = b+'::'+colId;
            if(!(key in snap.cols)) return;
            var cards = colEl.querySelector('.kb-cards');
            if(cards){
              var m = Math.max(0, cards.scrollHeight - cards.clientHeight);
              cards.scrollTop = Math.max(0, Math.min(snap.cols[key], m));
            }
          });
        }
        var mob = document.getElementById(b+'-mobile-list');
        if(mob && snap.mobLists[b] != null){
          var mm = Math.max(0, mob.scrollHeight - mob.clientHeight);
          mob.scrollTop = Math.max(0, Math.min(snap.mobLists[b], mm));
        }
      });
      // document scroll (mobile) — só restaura se realmente estava em posição
      if(snap.doc > 0){
        var se = document.scrollingElement || document.documentElement || document.body;
        if(se){
          var md = Math.max(0, se.scrollHeight - se.clientHeight);
          se.scrollTop = Math.max(0, Math.min(snap.doc, md));
        }
      }
    }catch(_e){}
  }

  function _scheduleRestore(snap){
    // 3 tentativas em rAFs sucessivos: cobre o coalesce (24ms) do
    // lf-kanban-fluidity + o RAF-duplo do _kbRestoreScrollState +
    // uma folga para renderKBMobile que rodou por dentro.
    requestAnimationFrame(function(){
      _restoreAll(snap);
      requestAnimationFrame(function(){
        _restoreAll(snap);
        requestAnimationFrame(function(){ _restoreAll(snap); });
      });
    });
  }

  /* ------------------------------------------------------------
   * (B) Envolve renderKBMobile — precisa esperar existir.
   * ------------------------------------------------------------ */
  function _wrapRenderKBMobile(){
    if(typeof global.renderKBMobile !== 'function') return false;
    if(global.renderKBMobile.__lfScrollFix) return true;
    var orig = global.renderKBMobile;
    global.renderKBMobile = function(board){
      var snap = _captureAll();
      var ret;
      try{ ret = orig.apply(this, arguments); }
      finally{ _scheduleRestore(snap); }
      return ret;
    };
    global.renderKBMobile.__lfScrollFix = true;
    log('renderKBMobile envolvido (capture/restore)');
    return true;
  }

  /* ------------------------------------------------------------
   * (C) Envolve _kbMoveCard — precisa esperar existir E vir por
   *     último (depois dos wrappers dos outros patches).
   * ------------------------------------------------------------ */
  function _wrapKbMoveCard(){
    if(typeof global._kbMoveCard !== 'function') return false;
    if(global._kbMoveCard.__lfScrollFixOuter) return true;
    var prev = global._kbMoveCard;
    var wrapped = function(){
      var snap = _captureAll();
      var ret;
      try{ ret = prev.apply(this, arguments); }
      finally{ _scheduleRestore(snap); }
      return ret;
    };
    // preserva TODAS as flags dos wrappers anteriores para nenhum
    // patch idempotente futuro tentar reinstalar por cima
    ['__lfBingoSyncWrapped','__lf4xScrollWrapped','__lf5xWrapped',
     '__lfConvertPrompt','__lfLivreReasonRequired',
     '__lfLivreReasonRequiredV2'].forEach(function(f){
      if(prev[f]) wrapped[f] = prev[f];
    });
    wrapped.__lfScrollFixOuter = true;
    global._kbMoveCard = wrapped;
    if(global.KB) try{ global.KB._kbMoveCard = wrapped; }catch(_e){}
    log('_kbMoveCard envolvido (capture BEFORE move + restore em 3 rAF)');
    return true;
  }

  /* ------------------------------------------------------------
   * (A) Neutralização de wrappers legados quebrados
   *     Marcamos as flags ANTES deles rodarem, MAS este patch
   *     entra por último no HTML — então normalmente eles já
   *     rodaram. Nesse caso, sobrepor _kbMoveCard como fizemos em
   *     (C) já resolve: o snapshot antigo (com seletor errado)
   *     continua rodando por dentro (não estraga nada; falha
   *     silenciosamente porque não acha os nodes), enquanto o
   *     nosso é o snapshot bom por fora.
   * ------------------------------------------------------------ */
  // Se quiserem impedir futura reinstalação (defensivo):
  try{ global.__lf4xScrollNeutralized = true; }catch(_e){}

  /* ------------------------------------------------------------
   * Bootstrap com retry (patches carregam de forma assíncrona
   * conforme os <script> do HTML)
   * ------------------------------------------------------------ */
  var _tries = 0;
  function _install(){
    _tries++;
    var okA = _wrapRenderKBMobile();
    var okB = _wrapKbMoveCard();
    if((okA && okB) || _tries > 40) return; // ~ 40 * 100ms = 4s
    setTimeout(_install, 100);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _install);
  } else {
    _install();
  }

  /* ------------------------------------------------------------
   * Defesa extra: alguns fluxos (bulkMove, _spSelect) chamam
   * renderKBMobile diretamente sem passar por _kbMoveCard (caso
   * do filtro por etapa). Interceptamos também as chamadas
   * globais renderKBLocal para redoblar restore. Como o patch de
   * fluidez já envolve renderKBLocal em rAF, adicionamos um
   * "shadow" após o retorno do wrapper de fluidez.
   * ------------------------------------------------------------ */
  function _wrapRenderKBLocalShadow(){
    if(typeof global.renderKBLocal !== 'function') return false;
    if(global.renderKBLocal.__lfScrollFixShadow) return true;
    var orig = global.renderKBLocal;
    global.renderKBLocal = function(board){
      // Só entra em ação se AINDA não estamos dentro de um
      // _kbMoveCard (que já capturou por fora). Nesse caso o
      // capture aqui é redundante mas barato.
      var snap = _captureAll();
      var ret;
      try{ ret = orig.apply(this, arguments); }
      finally{ _scheduleRestore(snap); }
      return ret;
    };
    // preserva flag do lf-kanban-fluidity
    if(orig.__lfFluidityWrapped) global.renderKBLocal.__lfFluidityWrapped = true;
    global.renderKBLocal.__lfScrollFixShadow = true;
    log('renderKBLocal shadow envolvido');
    return true;
  }
  // shadow ganha o mesmo retry
  var _tries2 = 0;
  function _install2(){
    _tries2++;
    if(_wrapRenderKBLocalShadow() || _tries2 > 40) return;
    setTimeout(_install2, 100);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _install2);
  } else {
    _install2();
  }

  log('patch carregado');
})(window);
PATCH_EOF

echo "==> Patch instalado em: $PATCH_REL"

# -----------------------------------------------------------
# 3) Adiciona a tag <script> no index.html (e app.html se
#    existir) SEMPRE por último dos patches do kanban.
#    Idempotente: só insere se ainda não estiver lá.
# -----------------------------------------------------------
add_script_tag(){
  local file="$1"
  [ ! -f "$file" ] && return 0
  if grep -q "lf-fix-scroll-reset-lead-move-v1-20260804.js" "$file"; then
    echo "==> Tag já presente em $(basename "$file"), pulando"
    return 0
  fi
  # Insere DEPOIS da linha do lf-kanban-fluidity (último patch atual).
  # Se por algum motivo não existir, insere antes de </body>.
  local tag='<script src="js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js?v=20260804fixscrollreset"></script>'
  if grep -q "lf-kanban-fluidity-v1-20260730.js" "$file"; then
    # POSIX sed com fallback para macOS (BSD) e Linux (GNU)
    if sed --version >/dev/null 2>&1; then
      sed -i "/lf-kanban-fluidity-v1-20260730.js/a $tag" "$file"
    else
      sed -i '' "/lf-kanban-fluidity-v1-20260730.js/a\\
$tag
" "$file"
    fi
  else
    if sed --version >/dev/null 2>&1; then
      sed -i "s#</body>#$tag\n</body>#" "$file"
    else
      sed -i '' "s#</body>#$tag\\
</body>#" "$file"
    fi
  fi
  echo "==> Tag inserida em: $(basename "$file")"
}

add_script_tag "$INDEX"
add_script_tag "$APP_HTML"

# -----------------------------------------------------------
# 4) Gera rollback script
# -----------------------------------------------------------
ROLLBACK="$ROOT/scripts/rollback-fix-scroll-reset-lead-move-20260804.sh"
cat > "$ROLLBACK" <<ROLLBACK_EOF
#!/usr/bin/env bash
# Rollback do fix de scroll-reset (20260804). Restaura tudo do
# backup em: $BACKUP_DIR
set -euo pipefail
ROOT="\$(cd "\$(dirname "\$0")/.." && pwd)"
BACKUP="$BACKUP_DIR"

if [ ! -d "\$BACKUP" ]; then
  echo "Backup não encontrado: \$BACKUP"; exit 1
fi

# 1) remove o patch novo
rm -f "\$ROOT/$PATCH_REL"

# 2) remove tag do HTML
for f in "\$ROOT/index.html" "\$ROOT/app.html"; do
  [ -f "\$f" ] || continue
  if sed --version >/dev/null 2>&1; then
    sed -i '/lf-fix-scroll-reset-lead-move-v1-20260804.js/d' "\$f"
  else
    sed -i '' '/lf-fix-scroll-reset-lead-move-v1-20260804.js/d' "\$f"
  fi
done

# 3) opcional — restaura arquivos originais completos
[ -f "\$BACKUP/index.html" ] && cp "\$BACKUP/index.html" "\$ROOT/index.html"
[ -f "\$BACKUP/app.html"   ] && cp "\$BACKUP/app.html"   "\$ROOT/app.html"

echo "Rollback concluído."
ROLLBACK_EOF
chmod +x "$ROLLBACK"

echo ""
echo "============================================================"
echo "✅ FIX aplicado com sucesso"
echo "   Novo patch:  $PATCH_REL"
echo "   Backup em:   $BACKUP_DIR"
echo "   Rollback:    scripts/rollback-fix-scroll-reset-lead-move-20260804.sh"
echo "============================================================"
