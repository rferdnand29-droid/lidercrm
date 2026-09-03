# Fundo da tela de login — troque você mesmo, sem precisar pedir ajuste

Esta pasta controla a foto/vídeo de fundo da tela de login — no PC,
no celular (navegador) e no aplicativo instalado (Capacitor). **Existe
uma ferramenta que faz a troca inteira sozinha — validando o arquivo
e sincronizando o app nativo — sem precisar mexer em nenhum código.**

---

## Jeito mais fácil: a ferramenta automática

```
node scripts/trocar-fundo-login.mjs <caminho-do-arquivo> <desktop|mobile>
```

Ou, se preferir usar o atalho já registrado no projeto:

```
npm run trocar-fundo-login -- <caminho-do-arquivo> <desktop|mobile>
```

**Exemplos:**

```
node scripts/trocar-fundo-login.mjs ~/Downloads/foto-nova.jpg desktop
node scripts/trocar-fundo-login.mjs ~/Downloads/video-novo.mp4 mobile
```

A ferramenta faz tudo sozinha:
1. Detecta se é foto (`.jpg`/`.jpeg`) ou vídeo (`.mp4`) pela extensão.
2. Confere se as dimensões batem com o recomendado — **avisa, não
   bloqueia**, se a proporção for diferente (a troca acontece de
   qualquer forma, só com um aviso do que pode ficar menos perfeito).
3. Copia o arquivo pro lugar certo, com o nome certo.
4. **Sincroniza automaticamente o app nativo** (Android e iOS) —
   equivalente a rodar `npm run cap:www` e `npx cap sync` na mão.
5. Mostra um resumo do que fazer a seguir.

Não precisa de Python, `ffmpeg` nem nenhuma ferramenta externa — só o
Node.js que o projeto já exige pra tudo mais.

---

## Os arquivos desta pasta

| Arquivo | Onde aparece |
|---|---|
| `login-bg-desktop.jpg` | Fundo no PC (tela larga) — **sempre usado como base**, mesmo se você adicionar vídeo |
| `login-bg-mobile.jpg` | Fundo no celular e no app instalado (tela estreita) — **sempre usado como base** |
| `login-video-desktop.mp4` | *(opcional)* Se existir, substitui a foto do PC por um vídeo de verdade |
| `login-video-mobile.mp4` | *(opcional)* Se existir, substitui a foto do celular/app por um vídeo de verdade |

**Importante**: as duas fotos (`.jpg`) **precisam sempre existir** —
são a base garantida da tela, e também aparecem por uma fração de
segundo enquanto um vídeo (se você adicionar um) ainda está
carregando. Os vídeos (`.mp4`) são **opcionais** — o sistema detecta
sozinho se eles existem.

---

## Tamanhos recomendados

| Formato | Tamanho | Proporção |
|---|---|---|
| PC (`desktop`) | **1920×1080** pixels | paisagem, 16:9 |
| Celular/app (`mobile`) | **498×1080** pixels | retrato |

Se usar outra proporção, a ferramenta avisa mas não impede a troca —
só o efeito de vapor animado (se ainda estiver ativo) pode ficar um
pouco fora de posição, e a imagem pode aparecer levemente cortada.

**Nota sobre o vapor animado**: ele foi desenhado especificamente pra
uma xícara de café numa posição exata da foto original. Se você
trocar a foto por algo bem diferente, o vapor pode aparecer
"flutuando no ar" sem sentido. Se isso acontecer e incomodar, essa
parte fica em `css/style.css`, na seção comentada "TELA DE LOGIN —
fundo cinematográfico" — ou me avise numa próxima conversa que eu
desligo pra você.

---

## Trocando manualmente (sem a ferramenta), se preferir

1. Prepare uma imagem `.jpg` (ou vídeo `.mp4`) nas dimensões da
   tabela acima.
2. Renomeie **exatamente** para `login-bg-desktop.jpg`,
   `login-bg-mobile.jpg`, `login-video-desktop.mp4` ou
   `login-video-mobile.mp4` (tudo minúsculo, sem espaço) e substitua
   o que já está aqui.
3. Se for pro site (PC/celular no navegador): publique normalmente,
   pronto.
4. Se for pro app instalado (Capacitor): rode `npm run cap:www` e
   depois `npx cap sync`, e gere um novo build (APK/IPA) — o app só
   recebe a troca depois de reinstalado, diferente do site.

## Como voltar a usar só a foto (desligar o vídeo)

**Jeito mais fácil**: use a mesma ferramenta automática, no modo de
remoção:

```
node scripts/trocar-fundo-login.mjs remove-video desktop
node scripts/trocar-fundo-login.mjs remove-video mobile
```

Ela apaga o arquivo de vídeo, atualiza um pequeno manifesto interno
(`assets/login/manifest.json` — não precisa mexer nele na mão, a
ferramenta cuida disso sozinha) e já sincroniza o app nativo, tudo de
uma vez.

**Jeito manual**: apague o(s) arquivo(s) `.mp4` desta pasta **e**
edite `manifest.json`, colocando `false` no campo correspondente
(`hasVideoDesktop`/`hasVideoMobile`). Se só apagar o `.mp4` sem
atualizar o manifesto, a tela vai tentar buscar um arquivo que não
existe mais — prefira sempre o comando acima.

## E o app instalado (Capacitor)?

O celular (navegador) e o app instalado usam **o mesmo arquivo**
(`login-bg-mobile.jpg` / `login-video-mobile.mp4`) — não existe um
terceiro arquivo separado só pro app. A única diferença é que, pro
app instalado receber a troca, é preciso gerar um novo build
(APK/IPA) e reinstalar — a ferramenta automática já deixa os projetos
Android/iOS prontos pra esse build; o site (PC e celular no
navegador) atualiza sozinho assim que você publica.

---

## Histórico — por que só existe um sistema hoje (2026-10-07)

Até esta data, existiam DOIS sistemas de fundo de login funcionando
ao mesmo tempo, sem querer — um mais antigo (`assets/videos/`,
patches de julho/agosto), outro mais novo, este aqui. Os dois
brigavam pelo mesmo espaço visual, e o antigo não tinha garantia de
imagem de reserva (se o vídeo falhasse, sobrava um gradiente vazio) —
essa foi a causa raiz de "o vídeo que pedi não aparece" relatado
nessa data. O sistema antigo foi desativado (removidas as
referências no código; nenhum arquivo de vídeo foi apagado — os
vídeos antigos continuam em `assets/videos/`, sem uso, caso queira
reaproveitar algum). De hoje em diante, **este é o único sistema**
que controla o fundo da tela de login.
