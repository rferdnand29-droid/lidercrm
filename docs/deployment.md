# Deploy

## Fluxo usado (via linha de comando / GitHub)

```
cd <pasta do projeto>
rmdir /s /q .git          (Windows) — recomeça o histórico git local
git init
git branch -M main
git remote add origin https://github.com/<usuario>/<repo>.git
git add .
git commit -m "mensagem"
git push -u origin main --force
```

O `--force` sobrescreve o repositório remoto inteiro com o conteúdo
local. Cloudflare Pages está conectado a esse repositório GitHub e
publica automaticamente a cada push em `main`.

**Ponto crítico**: os arquivos (`index.html`, `js/`, `css/` etc.)
precisam estar na **raiz** da pasta que vira o repositório —
`index.html` tem que existir direto em `<pasta>/index.html`, não
`<pasta>/nome-do-projeto/index.html`. Se o ZIP entregue tiver uma
pasta-mãe por dentro, mover só o CONTEÚDO pra dentro da pasta de
deploy antes do `git add .`.

## Depois do deploy

Sempre, sem exceção:

1. Confirmar no dashboard do Cloudflare Pages que o deploy terminou
   sem erro.
2. No navegador: `DevTools > Application > Storage > Clear site data`
   e recarregar. O app é um PWA com cache agressivo — sem isso o
   navegador pode continuar servindo os arquivos antigos mesmo com o
   deploy novo já publicado.
3. Rodar `window.lfCacaFinalStatus()` (ou o diagnóstico relevante do
   patch mais recente) no console pra confirmar que a versão nova
   pegou.

## Arquivos de configuração do Cloudflare Pages

- `_headers` — headers HTTP customizados por rota.
- `_redirects` — redirecionamentos.
- `functions/[[path]].js` — captura todas as rotas não estáticas e
  delega pro código em `_worker_src/worker/` (backend). Ver
  `docs/cloudflare.md`.

## Rollback

Cada patch importante em `js/patches/` tem (às vezes) um script
irmão em `tools/rollback/` que reverte só aquele patch. Pra reverter o
deploy inteiro, é mais simples reverter o commit no GitHub e fazer
push de novo — o Cloudflare Pages publica o que estiver em `main`.
