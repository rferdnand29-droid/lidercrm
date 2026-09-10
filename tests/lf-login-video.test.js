// @vitest-environment happy-dom
// =====================================================================
// tests/lf-login-video.test.js
// Correção de causa raiz real (achado do console, 2026-10-10) —
// js/lf-login-video.js fazia uma sondagem HTTP direta no arquivo de
// vídeo opcional, gerando um 404 visível no console sempre que nenhum
// vídeo tinha sido adicionado ainda (o caso mais comum). Corrigido
// checando primeiro um manifesto leve (assets/login/manifest.json),
// que SEMPRE existe — só tenta buscar o .mp4 de verdade se o
// manifesto confirmar que ele foi adicionado.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'lf-login-video.js'), 'utf8');

function loadModule() {
  window.__LF_LOGIN_VIDEO_INSTALLED__ = false;
  document.body.innerHTML = '<div class="login-bgframe"></div>';
  (0, eval)(SRC);
}

describe('lf-login-video.js — checa o manifesto antes de tentar o vídeo (fix do 404 no console)', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1280); // desktop por padrão
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('REGRESSÃO EXPLÍCITA: manifesto diz que NÃO há vídeo => nunca faz fetch do .mp4 (elimina o 404 do bug original)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ hasVideoDesktop: false, hasVideoMobile: false }) })
    );
    vi.stubGlobal('fetch', fetchMock);
    loadModule();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const mp4Calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('.mp4'));
    expect(mp4Calls.length).toBe(0);
    // Confirma que buscou o manifesto (não simplesmente não fez nada).
    expect(fetchMock).toHaveBeenCalledWith('assets/login/manifest.json', expect.any(Object));
  });

  it('manifesto diz que HÁ vídeo desktop => insere o elemento <video> no frame', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ hasVideoDesktop: true, hasVideoMobile: false }) })
    );
    vi.stubGlobal('fetch', fetchMock);
    loadModule();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const frame = document.querySelector('.login-bgframe');
    expect(frame.querySelector('video')).not.toBeNull();
    expect(frame.classList.contains('has-video')).toBe(true);
  });

  it('checa a chave certa pro mobile (hasVideoMobile, não hasVideoDesktop)', async () => {
    vi.stubGlobal('innerWidth', 390); // mobile
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ hasVideoDesktop: true, hasVideoMobile: false }) })
    );
    vi.stubGlobal('fetch', fetchMock);
    loadModule();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // hasVideoDesktop:true não deveria importar no mobile — só hasVideoMobile.
    const frame = document.querySelector('.login-bgframe');
    expect(frame.querySelector('video')).toBeNull();
  });

  it('manifesto falha ao carregar (rede/404 dele mesmo) => não quebra, não tenta o vídeo', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false }));
    vi.stubGlobal('fetch', fetchMock);
    expect(() => loadModule()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    const frame = document.querySelector('.login-bgframe');
    expect(frame.querySelector('video')).toBeNull();
  });

  it('manifesto lança exceção de rede => não quebra, não tenta o vídeo', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('rede fora')));
    vi.stubGlobal('fetch', fetchMock);
    expect(() => loadModule()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const frame = document.querySelector('.login-bgframe');
    expect(frame.querySelector('video')).toBeNull();
  });
});
