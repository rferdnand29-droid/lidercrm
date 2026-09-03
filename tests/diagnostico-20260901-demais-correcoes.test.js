// =====================================================================
// tests/diagnostico-20260901-demais-correcoes.test.js
// Cobre os achados restantes do diagnóstico 2026-09-01 que não se
// prestam a teste funcional isolado (dependem de closures internas
// muito grandes/interligadas — actConfirmDone, initDB) — verifica o
// padrão exato no código-fonte real, mesmo raciocínio já usado em
// outros arquivos de teste desta mesma leva de correções.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AGENDA_SRC = readFileSync(path.join(ROOT, 'js', 'agenda.js'), 'utf8');
const SUPABASE_SRC = readFileSync(path.join(ROOT, 'js', 'supabase.js'), 'utf8');
const INDEX_HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP_HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');

describe('Problema 2 (parte 3) — actConfirmDone redesenha o Kanban na hora', () => {
  it('chama renderKBLocal logo após marcar a atividade como concluída, não só refreshLinkedActivitySummaries', () => {
    const fnStart = AGENDA_SRC.indexOf('function actConfirmDone');
    const fnEnd = AGENDA_SRC.indexOf('\nfunction ', fnStart + 10); // próxima função top-level
    const fnBody = AGENDA_SRC.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refreshLinkedActivitySummaries()');
    expect(fnBody).toMatch(/renderKBLocal\(a\.board\)/);
  });

  it('só redesenha se a página do board estiver visível (mesma checagem já usada em outros pontos do arquivo)', () => {
    const fnStart = AGENDA_SRC.indexOf('function actConfirmDone');
    const fnEnd = AGENDA_SRC.indexOf('\nfunction ', fnStart + 10);
    const fnBody = AGENDA_SRC.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/pg-['"+]/);
    expect(fnBody).toContain("classList.contains('on')");
  });
});

describe('Problema 5 — guarda de idempotência em _connectSupabase', () => {
  it('retorna o cliente já existente em vez de criar outro, se _sbClient já estiver setado', () => {
    const fnStart = SUPABASE_SRC.indexOf('function _connectSupabase()');
    const fnBody = SUPABASE_SRC.slice(fnStart, fnStart + 700);
    expect(fnBody).toMatch(/if\(_sbClient\)return _sbClient;/);
  });

  it('continua existindo só UMA chamada real a createClient() no arquivo', () => {
    const matches = SUPABASE_SRC.match(/\.createClient\(/g) || [];
    expect(matches.length).toBe(1);
  });
});

describe('Problema 4 — retry de signInAnonymously estendido também pra web', () => {
  it('_SIGNIN_LIMIT não depende mais de _LF_CAPACITOR.native (mesmo valor pros dois ambientes)', () => {
    expect(SUPABASE_SRC).toMatch(/_SIGNIN_LIMIT = _LF_CAPACITOR\.native \? 2 : 2/);
  });

  it('REGRESSÃO EXPLÍCITA: nenhum dos dois pontos de retry exige mais _LF_CAPACITOR.native explicitamente', () => {
    // Antes desta correção, ambos os pontos de retry tinham
    // "_LF_CAPACITOR.native && _signinAttempts < _SIGNIN_LIMIT" — a
    // condição agora deve ser só "_signinAttempts < _SIGNIN_LIMIT".
    const retryConditions = SUPABASE_SRC.match(/if\(([^)]*_signinAttempts < _SIGNIN_LIMIT[^)]*)\)/g) || [];
    expect(retryConditions.length).toBeGreaterThanOrEqual(2);
    retryConditions.forEach((cond) => {
      expect(cond).not.toContain('_LF_CAPACITOR.native &&');
    });
  });

  it('o atraso do retry por erro agora é progressivo (multiplicado pela tentativa), não fixo', () => {
    expect(SUPABASE_SRC).toMatch(/setTimeout\(_doSignin, 800\*_signinAttempts\)/);
  });
});

describe('Problema 3 — cache-buster do vídeo de login foi renovado', () => {
  it('index.html e app.html usam a versão nova (não a antiga, de antes do fix do manifesto)', () => {
    expect(INDEX_HTML).not.toContain('lf-login-video.js?v=20261006loginvideo1');
    expect(APP_HTML).not.toContain('lf-login-video.js?v=20261006loginvideo1');
    expect(INDEX_HTML).toMatch(/lf-login-video\.js\?v=\d+loginvideo\d+/);
    expect(APP_HTML).toMatch(/lf-login-video\.js\?v=\d+loginvideo\d+/);
  });
});

describe('Problema 7 — preloads redundantes de CSS removidos', () => {
  it('index.html não tem mais preload de style.css/chat.css/etc. (redundante com o stylesheet logo abaixo)', () => {
    expect(INDEX_HTML).not.toMatch(/rel="preload" as="style" href="css\/style\.css/);
    expect(INDEX_HTML).not.toMatch(/rel="preload" as="style" href="css\/chat\/chat\.css/);
  });

  it('index.html continua carregando esses CSS normalmente como stylesheet (não removeu o CSS em si, só o preload)', () => {
    expect(INDEX_HTML).toMatch(/rel="stylesheet" href="css\/style\.css/);
    expect(INDEX_HTML).toMatch(/rel="stylesheet" href="css\/chat\/chat\.css/);
  });

  it('mantém o preload da fonte e das imagens de login (esses não têm duplicação equivalente)', () => {
    expect(INDEX_HTML).toMatch(/rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com/);
    expect(INDEX_HTML).toMatch(/rel="preload" as="image" href="assets\/login\/login-bg-desktop\.jpg"/);
  });

  it('app.html teve a mesma limpeza aplicada', () => {
    expect(APP_HTML).not.toMatch(/rel="preload" as="style" href="css\/style\.css/);
    expect(APP_HTML).toMatch(/rel="stylesheet" href="css\/style\.css/);
  });
});
