/* =====================================================================
 * lf-build-info.js
 * -----------------------------------------------------------------------
 * Marcador de build — a pedido do usuário, pra conseguir confirmar na
 * hora se o que está rodando (no navegador OU no app Capacitor) é
 * realmente o código mais recente entregue, antes de investigar um
 * "bug" que pode já estar corrigido só não publicado ainda.
 *
 * Este arquivo é reescrito TODA VEZ que um zip novo é gerado — o valor
 * de BUILT_AT muda a cada entrega. Visível em:
 *   - Configurações → rodapé
 *   - Menu (☰) → rodapé, abaixo de "Sair"
 *
 * Como conferir se o Cloudflare Pages está atualizado: abra o app (ou
 * o site) e compare esse horário com o que apareceu na última entrega
 * — se bater, o deploy está em dia; se for mais antigo, falta publicar.
 * ===================================================================== */
window.LF_BUILD_INFO = {
  version: (window.LiderCRM && window.LiderCRM.config && window.LiderCRM.config.appVersion) || window.LF_CONFIG_VERSION || 'dev',
  builtAt: ((window.LiderCRM && window.LiderCRM.config && window.LiderCRM.config.appVersion) || window.LF_CONFIG_VERSION || 'dev') + ' UTC',
  note: 'Fonte da versão: js/lf-config.js'
};

(function(){
  function paint(){
    var els = document.querySelectorAll('.lf-build-marker');
    els.forEach(function(el){ el.textContent = '🧩 Build: ' + window.LF_BUILD_INFO.builtAt; });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
  // Reaplica quando o menu (recriado dinamicamente em alguns fluxos) ou
  // configurações renderizam de novo.
  window.__lfPaintBuildMarker = paint;
})();
