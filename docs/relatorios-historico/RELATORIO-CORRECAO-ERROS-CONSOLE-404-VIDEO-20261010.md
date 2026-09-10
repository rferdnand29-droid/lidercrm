# RELATORIO-CORRECAO-ERROS-CONSOLE-404-VIDEO-20261010

## Pedido

Investigar e corrigir os erros aparecendo no console do navegador.

## Erro 1 — `login-video-desktop.mp4: Failed to load resource (404)`

### Confirmado e corrigido

Esse 404 era esperado pelo desenho da funcionalidade de vídeo opcional
(entrega anterior, 2026-10-07): o sistema sempre pergunta ao servidor
se o arquivo de vídeo existe antes de tentar usá-lo, e como nenhum
vídeo tinha sido adicionado ainda, essa pergunta sempre resultava em
404. Funcionalmente inofensivo — a foto aparecia normalmente — mas
poluía o console com um erro que parecia mais grave do que era.

**Correção**: criado um manifesto leve
(`assets/login/manifest.json`), que **sempre existe** no projeto. A
tela agora consulta esse manifesto primeiro — só tenta buscar o
arquivo `.mp4` de verdade se o manifesto confirmar que ele foi
adicionado. Sem vídeo adicionado, nenhuma tentativa de buscar o `.mp4`
acontece, eliminando o 404 por completo.

`scripts/trocar-fundo-login.mjs` (a ferramenta de autoatendimento já
entregue) foi atualizada pra manter esse manifesto sincronizado
sozinha — você não precisa editar esse arquivo na mão em nenhum
momento. Também adicionei um modo novo, `remove-video`, pra cobrir o
ciclo completo (adicionar E remover vídeo) pela mesma ferramenta:

```
node scripts/trocar-fundo-login.mjs remove-video desktop
node scripts/trocar-fundo-login.mjs remove-video mobile
```

## Erro 2 — `Uncaught TypeError: Cannot read properties of undefined (reading 'startTime') at et.reportAllChanges`

### Investigado, confirmado como externo ao projeto — não é algo que eu possa corrigir daqui

`reportAllChanges` é uma função específica e documentada da biblioteca
pública "web-vitals" do Google, usada por ferramentas de medição de
performance de página. Busquei essa string, e qualquer variação
relacionada (`web-vitals`, `PerformanceObserver`, `LCP`/`FID`/`INP`,
carregamento de script externo que pudesse trazer essa biblioteca) em
**todo o código do projeto** — não existe em nenhum lugar.

O identificador do erro (`VM206`, sem nome de arquivo real) é a
assinatura típica de um script injetado por uma extensão do
navegador — não um arquivo servido pelo nosso domínio. Confirmei esse
padrão via pesquisa: extensões injetam scripts via
`document.createElement('script')` diretamente na página, e esses
scripts aparecem no DevTools como "VM" (sem URL de arquivo) por não
terem uma origem de arquivo real.

**Conclusão**: esse erro vem de alguma extensão instalada no seu
navegador (comum em ferramentas de SEO, bloqueadores de anúncio ou
monitoramento de performance que injetam esse tipo de medição em
qualquer página visitada) — não da aplicação. Não há nada no nosso
código pra corrigir aqui. Se quiser confirmar, teste abrir o CRM numa
janela anônima/privada (que desativa a maioria das extensões por
padrão) — se o erro sumir, confirma que é uma extensão específica.

## Erro cometido e corrigido durante a implementação

Lint pegou um `unlinkSync` importado no arquivo de teste mas nunca
usado (sobra de uma versão anterior do teste que cheguei a escrever
e depois simplifiquei). Corrigido antes da entrega.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `assets/login/manifest.json` | novo — sempre existe, evita o 404 |
| `js/lf-login-video.js` | checa o manifesto antes de tentar o `.mp4` |
| `scripts/trocar-fundo-login.mjs` | mantém o manifesto sincronizado; novo modo `remove-video` |
| `assets/login/README.md` | documenta o modo de remoção e o manifesto |
| `tests/trocar-fundo-login.test.js` | +6 testes (manifesto) |
| `tests/lf-login-video.test.js` | novo — 5 testes |

## Verificação

```
node --check (arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 237/237 testes (226 + 11 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
Testado de ponta a ponta         → adicionar vídeo (manifesto atualiza), remover vídeo (manifesto reverte), sem vídeo (nenhum fetch do .mp4)
```

## Reversão

Reversível arquivo por arquivo. O manifesto pode ser removido sem
quebrar nada — `readManifest` volta ao padrão seguro (nenhum vídeo)
se o arquivo não existir, só reintroduzindo o 404 original.
