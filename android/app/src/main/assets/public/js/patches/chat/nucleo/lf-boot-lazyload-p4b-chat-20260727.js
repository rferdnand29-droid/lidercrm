/**
 * Hotfix 2026-07-31:
 * O lazy-load do núcleo do chat foi neutralizado porque os patches do chat
 * carregam de forma síncrona e dependem do chat já disponível no boot.
 * Manter chat.js assíncrono quebrava a ordem de instalação dos patches e
 * causava handlers globais ausentes, duplicidade de UI e falhas do menu.
 */
(function(){
  'use strict';
  if (window.__LF_BOOT_LAZYLOAD_P4B_CHAT__) return;
  window.__LF_BOOT_LAZYLOAD_P4B_CHAT__ = true;
})();
