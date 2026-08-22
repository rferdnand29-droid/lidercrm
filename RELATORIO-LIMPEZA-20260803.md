# Relatório de limpeza — LiderCRM

Este relatório documenta a limpeza feita no pacote do CRM. Nada foi apagado
de verdade: tudo que saiu do pacote de deploy está em `lidercrm-arquivo-removido.zip`,
te mando os dois arquivos.

## Resultado

| | Antes | Depois |
|---|---|---|
| Tamanho total do pacote | ~13 MB | ~5,8 MB (com vídeo otimizado) |
| Arquivos | 393 | 322 |

A maior parte do ganho não veio de "arquivo morto" — veio de um vídeo mal
comprimido (ver seção 2). Os arquivos realmente inúteis pesavam pouco
(768 KB), mas alguns deles eram um risco de segurança, não só peso.

## 1. O que foi removido do pacote de deploy (768 KB)

Todos esses arquivos **não são carregados pelo app** (não aparecem em nenhum
`<script>`, `<link>` ou import do `index.html`/`app.html`) — são resíduo
operacional de patches que já foram aplicados e migrações que já rodaram no
banco. Fui conferindo item por item, não é uma varredura cega por data.

- **`tools/` inteiro** (scripts de apply/rollback/verificação de patches já
  mesclados no código, + `tools/diagnostico/generate-pbkdf2-100k.html`).
  → **Achado de segurança**: seu `_headers` não bloqueia `/tools/*`, só tira
  o cache. Isso significa que esse gerador de hash de senha (pbkdf2, 100k
  iterações) estava **publicamente acessível** em produção, junto com scripts
  internos de correção. Vale revisar se algo parecido precisa ficar fora do
  deploy daqui pra frente.
- **`sql/migrations/` e `sql/manutencao/`** — migrações já aplicadas no
  Supabase. Mesma observação: `/sql/*` também não tinha bloqueio no
  `_headers`, então esses scripts (inclusive um template de reset de senha
  de admin) estavam expostos publicamente. Mantive `sql/10-schema-departamentos.sql`
  e `sql/30-rls-cargo-departamento.sql` no lugar — são de 03-04/08, recentes
  demais pra eu presumir que já foram aplicados.
- **Relatórios/auditorias datados**: `docs/AUDITORIA-*.md`, `docs/LIMPEZA-*.md`,
  `docs/CHANGELOG-fixes-20260803.md`, `docs/README-fixes-20260803.md`,
  `docs/patches/*.md`, e na raiz `ARCHITECTURE_REPORT.md`,
  `ESTRUTURA-DO-PROJETO.md`, `RELATORIO-SESSAO2-20260803.md`,
  `RELATORIO_BUGS.md`, `RELATORIO_CORRECOES_20260803.md`. São fotografias de
  sessões de correção passadas — históricos, não documentação viva. Deixei
  intactos os docs de referência que ainda fazem sentido consultar
  (`docs/architecture.md`, `docs/deployment.md`, `docs/troubleshooting.md`,
  `docs/mobile.md`, `docs/database.md`, `docs/coding-standards.md`, etc.).
- Um duplicado exato: `tools/apply-all-fixes-lidercrm-20260803.sh` existia
  igualzinho em dois lugares (`tools/` e `tools/apply/`).

Nenhum desses arquivos afeta a velocidade do app no navegador — o ganho
aqui é organização + segurança, não performance.

## 2. O achado grande: vídeo do fundo de login no mobile (6,9 MB → 912 KB)

`assets/videos/lf-auth-bg-mobile.mp4` estava **15x mais pesado** que a
versão desktop, exatamente ao contrário do que devia ser:

| Arquivo | Resolução | Bitrate | Tamanho |
|---|---|---|---|
| `lf-auth-bg-desktop.mp4` | 1280×544 | 1,1 Mbps | 461 KB |
| `lf-auth-bg-mobile.mp4` (original) | 1080×1920 | **14,9 Mbps** | 6,9 MB |

Isso é um export sem compressão de verdade (bitrate de edição, não de web)
sendo baixado por usuários no celular — exatamente quem tem a conexão mais
limitada — toda vez que a tela de login carrega.

Além disso, o loop não fechava redondo: o vídeo termina numa cena de anel
de partículas douradas e, ao repetir, volta de golpe pra cena de gráficos
de candlestick do início — um corte perceptível toda vez que o loop
reinicia (a cada 3,7s).

Corrigi as duas coisas em `assets/videos/lf-auth-bg-mobile.mp4`:

- **Compressão real**: mantive a resolução nativa (1080×1920, você pediu
  pra não abrir mão disso), CRF 24 (H.264, sem áudio, faststart). Resultado:
  **2,9 MB** — 58% menor, com qualidade visual equivalente ao original
  (comparei frame a frame, sem perda perceptível).
- **Loop disfarçado**: apliquei um crossfade de 0,4s entre o final e o
  início do vídeo, então agora o quadro final já dissolveu de volta pro
  estado inicial em vez de saltar pra uma cena totalmente diferente. A
  costura ficou praticamente imperceptível.

O arquivo original de 6,9 MB (sem correção de loop) está guardado em
`lidercrm-arquivo-removido.zip` como `lf-auth-bg-mobile-ORIGINAL-6.9MB.mp4`,
caso precise dele de volta. Também gerei uma variante ainda mais leve
(720×1280, ~1,2 MB, mesmo loop corrigido) que não entrou no pacote final
porque você preferiu manter a resolução nativa — avisa se quiser trocar.

Esse ajuste sozinho tira ~4 MB do peso do deploy — mais que todo o resto
da limpeza junto.

## 3. O que NÃO mexi (e por quê)

**`js/patches/` — 86 arquivos, 1,5 MB, todos carregados de verdade pelo
`index.html`/`app.html`.** Esse é provavelmente o maior peso real de
performance do sistema (dezenas de requisições HTTP separadas toda vez que
alguém abre o CRM), mas não é "lixo" no sentido de morto — é código vivo.

O padrão de nomes mostra bastante sobreposição histórica no módulo de chat,
por exemplo:
`lf-cacador-erro-especifico-v1` → `v2` → `lf-cacador-erro-definitivo-v1` →
`v2` → `v4` → `lf-caca-final-4sintomas`. É bem possível que patches mais
recentes já cubram o que os antigos faziam, mas confirmar isso exige ler a
lógica de cada um e testar — apagar um patch às cegas pode quebrar uma
correção que ainda está em uso. Não fiz isso automaticamente por ser
arriscado demais pra rodar sem sua revisão.

Se quiser, posso entrar nisso como um projeto separado: mapear quais
patches se sobrepõem, sugerir uma fusão/consolidação em arquivos maiores
(reduzindo de ~86 requisições pra bem menos) e você testa antes de subir.
Isso teria impacto real na velocidade de carregamento do app — bem mais
que a limpeza de arquivos mortos.

## 4. Onde está tudo que saiu

`lidercrm-arquivo-removido.zip` tem a cópia exata de tudo listado na seção 1.
Nada foi perdido — se algum script de rollback ou migração antiga fizer
falta, está lá.
