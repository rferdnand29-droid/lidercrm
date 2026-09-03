// vitest.config.ts
// Motivo: `npm test` estava 100% quebrado — o Vitest carrega vite.config.ts
// por padrão, que importa "@lovable.dev/vite-tanstack-config" (pacote privado
// do editor Lovable, não instalado como dependência do projeto). Isso fazia
// TODA a suíte falhar no boot, antes de rodar um único teste.
// Estratégia: Vitest dá prioridade a vitest.config.ts quando ele existe,
// então isolamos a config de teste aqui SEM tocar em vite.config.ts (evita
// qualquer risco de o Lovable sobrescrever/gerenciar aquele arquivo).
// Environment 'happy-dom' porque tests/retry-queue-cross-tab.test.js (e o
// IIFE que ele exercita) dependem de `window`/`document` globais.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
});
