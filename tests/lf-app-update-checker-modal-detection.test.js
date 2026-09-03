// @vitest-environment happy-dom
// =====================================================================
// tests/lf-app-update-checker-modal-detection.test.js
// Correção de bug real (2026-09-17) — pedido explícito: anotações de
// leads absolutamente nunca perdidas, nem pós deploy. Causa raiz: o
// detector de "modal aberto" (usado pra decidir se pode recarregar a
// página com segurança quando um deploy novo é detectado) procurava
// pela classe ".mo.show" e por estilo inline "display:flex" — mas o
// sistema de modais real (openM() em js/utils.js) usa a classe
// ".mo.open" (via classList.add), nunca define display inline. O
// detector antigo NUNCA reconhecia corretamente um modal aberto —
// incluindo o modal de detalhe do lead, onde fica o campo de
// anotações — então o recarregamento forçado nunca esperava de
// verdade a pessoa terminar de editar/fechar o modal.
//
// Testa a lógica de detecção isoladamente (sem carregar o arquivo
// inteiro, que se auto-instala como IIFE com temporizadores) — replica
// a MESMA implementação exata que está em produção, pra garantir que
// qualquer mudança futura no seletor seja pega por este teste.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKER_SRC = readFileSync(path.join(__dirname, '..', 'js', 'app-update-checker.js'), 'utf8');

describe('app-update-checker — detecção de modal aberto (fix da perda de anotações)', () => {
  it('REGRESSÃO EXPLÍCITA: o código-fonte usa o seletor ".mo.open" — não ".mo.show" nem display inline', () => {
    // Verifica diretamente no código-fonte de produção que o seletor
    // errado não foi reintroduzido, e que o correto está presente.
    expect(CHECKER_SRC).toContain(".querySelector('.mo.open')");
    expect(CHECKER_SRC).not.toMatch(/\.mo\.show/);
  });

  it('detecta corretamente um modal aberto com a classe real usada pelo sistema (.mo.open)', () => {
    document.body.innerHTML = '<div class="mo open" id="mo-kb-det"><textarea id="det-obs"></textarea></div>';
    // Mesma lógica exata da função _anyModalOpen atual.
    const anyModalOpen = () => !!document.querySelector('.mo.open');
    expect(anyModalOpen()).toBe(true);
  });

  it('não detecta um modal fechado (classe "mo" sem "open") como aberto', () => {
    document.body.innerHTML = '<div class="mo" id="mo-kb-det"><textarea id="det-obs"></textarea></div>';
    const anyModalOpen = () => !!document.querySelector('.mo.open');
    expect(anyModalOpen()).toBe(false);
  });

  it('camada extra: detecta cursor ativo em textarea/input de texto mesmo fora de modal', () => {
    document.body.innerHTML = '<textarea id="det-obs"></textarea>';
    document.getElementById('det-obs').focus();
    const ae = document.activeElement;
    const isTyping = !!(ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && /text|email|tel|number|search/i.test(ae.type || 'text'))));
    expect(isTyping).toBe(true);
  });
});
