// @vitest-environment happy-dom
// =====================================================================
// tests/lf-realtime-kanban.test.js
// Tempo real, Fase 1 (2026-09-26) — cobre js/lf-realtime-kanban.js, o
// conector SSE do lado cliente. Foco: confirma que é puramente aditivo
// (não conecta sem token, não quebra sem EventSource, e ao receber um
// aviso de mudança dispara a MESMA função de sincronização que já
// existe — sem duplicar lógica nenhuma de merge).
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'lf-realtime-kanban.js'), 'utf8');

class FakeEventSource {
  constructor(url) {
    FakeEventSource.instances.push(this);
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
  }
  addEventListener(type, cb) { this.listeners[type] = cb; }
  close() { this.readyState = 2; }
  // helper de teste — simula o servidor empurrando um evento
  _emit(type, data) { if (this.listeners[type]) this.listeners[type]({ data: JSON.stringify(data) }); }
  // helpers de teste — simulam onerror (conexão caiu de vez) e onopen
  // (conectou com sucesso), usados pela lógica de backoff.
  _triggerError() { this.readyState = 2; if (this.onerror) this.onerror(); }
  _triggerOpen() { if (this.onopen) this.onopen(); }
}
FakeEventSource.instances = [];

function loadModule() {
  FakeEventSource.instances = [];
  window.EventSource = FakeEventSource;
  window.__LF_REALTIME_KANBAN_INSTALLED__ = false;
  (0, eval)(SRC);
}

describe('lf-realtime-kanban — conector SSE do cliente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '';
    delete window.EventSource;
    delete window._syncKBRemoteBG;
    delete window.__LF_REALTIME_KANBAN_INSTALLED__;
    delete window.S;
    delete window.LF;
    delete window.loadNotifsRemote;
    delete window.updateNotifBadge;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não conecta se não houver token salvo (usuário deslogado)', () => {
    loadModule();
    vi.advanceTimersByTime(3000);
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it('não quebra se o navegador não tiver EventSource — sondagem de 15s cobre', () => {
    window.EventSource = undefined;
    expect(() => { (0, eval)(SRC); }).not.toThrow();
  });

  it('conecta usando o token salvo em localStorage, no formato real usado pelo resto do app', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123', expiresAt: Date.now() + 999999 }));
    loadModule();
    vi.advanceTimersByTime(3000);
    expect(FakeEventSource.instances.length).toBe(1);
    expect(FakeEventSource.instances[0].url).toContain('token=abc123');
    expect(FakeEventSource.instances[0].url).toContain('/api/v1/kanban/stream');
  });

  it('REGRESSÃO EXPLÍCITA: ao receber "changed", dispara _syncKBRemoteBG só pro board com a página visível (mesma checagem da sondagem de 15s)', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123', expiresAt: Date.now() + 999999 }));
    document.body.innerHTML = '<div id="pg-leads" class="on"></div><div id="pg-negocios"></div>';
    window._syncKBRemoteBG = vi.fn();
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._emit('changed', { boards: ['leads', 'negocios'] });
    expect(window._syncKBRemoteBG).toHaveBeenCalledWith('leads');
    expect(window._syncKBRemoteBG).not.toHaveBeenCalledWith('negocios');
  });

  it('não dispara nada se a página do board não estiver visível', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123', expiresAt: Date.now() + 999999 }));
    document.body.innerHTML = '<div id="pg-leads"></div>'; // sem classe "on"
    window._syncKBRemoteBG = vi.fn();
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._emit('changed', { boards: ['leads'] });
    expect(window._syncKBRemoteBG).not.toHaveBeenCalled();
  });

  it('token salvo mal-formado (JSON inválido) não quebra o módulo', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', '{isso não é json válido');
    expect(() => { loadModule(); vi.advanceTimersByTime(3000); }).not.toThrow();
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it('instalar duas vezes não duplica a instalação (idempotente)', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));
    loadModule();
    const before = window.__LF_REALTIME_KANBAN_INSTALLED__;
    (0, eval)(SRC); // carrega de novo
    expect(window.__LF_REALTIME_KANBAN_INSTALLED__).toBe(before);
  });

  it('REGRESSÃO EXPLÍCITA (Fase 1.5): ao receber "activities-changed", dispara fetchAndCacheActivities com o uid da sessão', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));
    window.S = { userId: 'user-42' };
    window.LF = { fetchAndCacheActivities: vi.fn(() => Promise.resolve([])) };
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._emit('activities-changed', {});
    expect(window.LF.fetchAndCacheActivities).toHaveBeenCalledWith('user-42');
  });

  it('não dispara fetchAndCacheActivities se o usuário não estiver logado (sem window.S.userId)', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));
    window.LF = { fetchAndCacheActivities: vi.fn(() => Promise.resolve([])) };
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._emit('activities-changed', {});
    expect(window.LF.fetchAndCacheActivities).not.toHaveBeenCalled();
  });

  it('REGRESSÃO EXPLÍCITA (Fase 1.6): ao receber "notifications-changed", dispara loadNotifsRemote e depois updateNotifBadge', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));
    window.loadNotifsRemote = vi.fn((cb) => cb());
    window.updateNotifBadge = vi.fn();
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._emit('notifications-changed', {});
    expect(window.loadNotifsRemote).toHaveBeenCalled();
    expect(window.updateNotifBadge).toHaveBeenCalled();
  });

  it('não quebra se loadNotifsRemote não existir ainda (arquivo carregando fora de ordem)', () => {
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));
    loadModule();
    vi.advanceTimersByTime(3000);
    expect(() => {
      FakeEventSource.instances[0]._emit('notifications-changed', {});
    }).not.toThrow();
  });
});

describe('lf-realtime-kanban — backoff exponencial na reconexão (achado do diagnóstico 2026-09-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('REGRESSÃO EXPLÍCITA: depois de uma falha, a próxima tentativa de reconexão espera mais que 10s (dobrou)', () => {
    loadModule();
    vi.advanceTimersByTime(3000); // conecta a 1ª vez
    expect(FakeEventSource.instances.length).toBe(1);

    FakeEventSource.instances[0]._triggerError(); // conexão cai

    // Nos primeiros ~15s (menos que os 20s do backoff dobrado) NÃO
    // deveria ter reconectado ainda — antes desta correção, reconectava
    // em até 10s fixos sempre.
    vi.advanceTimersByTime(15000);
    expect(FakeEventSource.instances.length).toBe(1);

    // Completando os ~20s (10s×2), aí sim reconecta.
    vi.advanceTimersByTime(6000);
    expect(FakeEventSource.instances.length).toBe(2);
  });

  it('conexão bem-sucedida (onopen) reseta o backoff — comparado contra 2 falhas seguidas sem reset', () => {
    // Cenário A: 2 falhas seguidas, SEM sucesso no meio — o atraso
    // deveria dobrar duas vezes (10s→20s→40s).
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._triggerError(); // 10s→20s
    vi.advanceTimersByTime(21000);
    expect(FakeEventSource.instances.length).toBe(2); // reconectou com ~20s
    FakeEventSource.instances[1]._triggerError(); // 20s→40s
    vi.advanceTimersByTime(21000);
    // Só 20s se passaram desde a 2ª falha — se tivesse dobrado pra 40s
    // (sem reset), NÃO deveria ter reconectado ainda.
    expect(FakeEventSource.instances.length).toBe(2);

    vi.useRealTimers();
    vi.useFakeTimers();
    localStorage.setItem('lidercrm_worker_jwt_v1', JSON.stringify({ token: 'abc123' }));

    // Cenário B: 1 falha, depois SUCESSO (reset), depois outra falha —
    // o atraso deveria voltar a dobrar A PARTIR de 10s (→20s), não
    // continuar de onde a 1ª falha tinha deixado.
    loadModule();
    vi.advanceTimersByTime(3000);
    FakeEventSource.instances[0]._triggerError(); // 10s→20s
    vi.advanceTimersByTime(21000);
    expect(FakeEventSource.instances.length).toBe(2);
    FakeEventSource.instances[1]._triggerOpen(); // conectou de verdade — reseta pra 10s
    FakeEventSource.instances[1]._triggerError(); // 10s→20s (não 20s→40s, por causa do reset)
    // Com o reset, 20s (não 40s) já é suficiente pra reconectar de novo.
    vi.advanceTimersByTime(21000);
    expect(FakeEventSource.instances.length).toBe(3);
  });

  it('backoff tem um teto — não cresce indefinidamente', () => {
    loadModule();
    vi.advanceTimersByTime(3000);
    // Simula várias falhas seguidas, sem nunca conectar de novo —
    // backoff deveria parar de crescer no teto (60s), não continuar
    // dobrando pra sempre (o que deixaria a reconexão cada vez mais
    // distante, indefinidamente).
    for (let i = 0; i < 5; i++) {
      FakeEventSource.instances[FakeEventSource.instances.length - 1]._triggerError();
      vi.advanceTimersByTime(65000); // mais que o teto — sempre deveria reconectar
    }
    // 1 conexão inicial + 5 reconexões = 6 no total.
    expect(FakeEventSource.instances.length).toBe(6);
  });
});
