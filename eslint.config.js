// =====================================================================
// eslint.config.js
// AUDITORIA-FINAL-10 (2026-08-01, item 3.7) — lint mínimo, sem quebrar
// o estilo já estabelecido no projeto (var, funções grandes, etc. não
// são reformatados aqui — isso seria uma reescrita, fora de escopo).
//
// Duas configurações separadas, porque o projeto tem duas arquiteturas
// de módulo genuinamente diferentes (ver docs/architecture.md):
//   • _worker_src/worker/**  → ES modules de verdade (import/export)
//   • js/**, src/**          → scripts globais concatenados, sem
//                              import/export (ver docs/dependencies.md)
//
// `no-undef` fica LIGADO só no worker: lá, uma variável não-importada
// é quase sempre um bug real. No client, ligar `no-undef` geraria
// centenas de falsos positivos (toda função definida em outro <script>
// aparenta "não existir" pro ESLint, que não sabe da ordem de
// carregamento do HTML) — o sinal ficaria afogado em ruído e ninguém
// prestaria atenção nele. Regras que pegam bug real independente de
// escopo global (chave duplicada, código inalcançável, etc.) continuam
// ligadas nos dois lados.
// =====================================================================
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'sql/**',
      'tools/**',
      'docs/**',
      'assets/**',
      'css/**',
      '.github/**',
      'www/**', // gerado por scripts/build-capacitor-www.mjs (espelha js/ e src/)
      'android/**', // projeto nativo Gradle/Kotlin, fora do escopo do lint JS
      'ios/**', // projeto nativo Xcode/Swift, fora do escopo do lint JS
      'resources/**', // fonte de ícone/splash (imagem), não código
    ],
  },

  // ---------- Worker (ES modules de verdade) ----------
  {
    files: ['_worker_src/worker/**/*.js', 'functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.worker,
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }], // padrão deliberado: catch(e){} silencioso (ver docs/coding-standards.md)
      'no-control-regex': 'off', // regexes com \x00/\x1f são sanitização deliberada de input (validate.js, upload-binary-controller.js), não bug
    },
  },

  // ---------- Client (scripts globais, sem módulo) ----------
  {
    files: ['js/**/*.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off', // ver nota no topo do arquivo — arquitetura sem bundler
      'no-unused-vars': 'off', // padrão do projeto: patches frequentemente definem
      // helpers "por via das dúvidas"/compat; muito ruído pra ligar hoje.
      'no-redeclare': 'off', // vários patches redeclaram a mesma var global de
      // propósito (guarda de idempotência via `var jaArmado`, etc.)
      'no-empty': ['warn', { allowEmptyCatch: true }], // padrão comum: catch(e){} silencioso
      'no-cond-assign': ['error', 'except-parens'],
    },
  },

  // ---------- Testes (Vitest) ----------
  {
    files: ['tests/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },
];
