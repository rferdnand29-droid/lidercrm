# RELATÓRIO — Correção de erros no console (v1 + correções de fundo A/C)

Data: 2026-08-18
Pacote: `lidercrm_corrigido_v2.zip` (reentregue com verificação integral)

## Escopo

Este pacote consolida, no bundle principal, as três correções descritas
em `lidercrm-fix-console-errors-v1.zip` **e mais as duas correções de
fundo opcionais** (`[A]` em `notificacoes.js` e `[C]` em `chat.js`)
que agora tratam a origem dos sintomas, não só o patch runtime.

| Grupo | Sintoma no console | Nível da correção |
|-------|--------------------|-------------------|
| [A]   | `404` em `assets/sounds/*.wav` e `*.ogg`             | **Origem** (`notificacoes.js`) + patch runtime |
| [B]   | `403` em `/api/v1/atividades/list?uid=<alheio>`      | Patch runtime (wrap de `LF.fetchAndCacheActivities`) |
| [C]   | `[chat] acesso a conv alheia bloqueado` repetido     | **Origem** (`chat.js` → `_chatNormalizeConv`) + patch runtime |

O patch runtime continua no pacote como cinto‑de‑segurança para bundles
antigos servidos pelo Service Worker até o próximo hard‑reload.

---

## [A] Correção de fundo em `js/notificacoes.js` e `www/js/notificacoes.js`

Antes (bundle só tinha `.mp3` — os `<source>` de `.wav/.ogg` geravam 404):

```js
var _notifSoundPaths={
  chat:['assets/sounds/chat.mp3','assets/sounds/chat.wav','assets/sounds/chat.ogg'],
  late:['assets/sounds/atrasada.mp3','assets/sounds/atrasada.wav','assets/sounds/atrasada.ogg'],
  geral:['assets/sounds/geral.mp3','assets/sounds/geral.wav','assets/sounds/geral.ogg']
};
```

Depois (linhas 77‑83, ambas as árvores):

```js
// FIX-CE1[A] (2026-08-18): bundle só tem .mp3 em assets/sounds/ — remover
// os fallbacks .wav/.ogg elimina os 404 no console na origem.
var _notifSoundPaths={
  chat:['assets/sounds/chat.mp3'],
  late:['assets/sounds/atrasada.mp3'],
  geral:['assets/sounds/geral.mp3']
};
```

Arquivos reais presentes em ambas as árvores (`assets/sounds/` e
`www/assets/sounds/`): `atrasada.mp3`, `chat.mp3`, `geral.mp3`. Nenhum
outro formato é necessário — sem `<source>` para `.wav/.ogg`, o browser
não gera mais requisição 404.

## [B] Patch runtime `lf-fix-console-errors-v1-20260818.js`

Presente em `js/patches/` e `www/js/patches/`, injetado em `app.html`,
`index.html`, `www/app.html` e `www/index.html` (linhas 2509‑2510 e
2687‑2688 respectivamente), marcado com o comentário idempotente
`<!-- PATCH: lf-fix-console-errors-v1-20260818 -->`.

Envolve `LF.fetchAndCacheActivities(uid)` para forçar `uid === S.userId`:
chamadas com `uid` alheio caem no cache local silenciosamente, sem gerar
o `GET` que dispararia 403. O caminho ADM legítimo
(`loadAllActivitiesAdmin`, que usa `adminUI`) continua intocado.

## [C] Correção de fundo em `js/chat.js` e `www/js/chat.js`

Dentro de `_chatNormalizeConv` (chamado por `_chatRepairConvBuckets`,
`_chatGetConvs`, `_chatSaveConvs` e todos os pontos de leitura),
linhas 217‑228:

```js
// FIX-CE1[C] (2026-08-18): conversas antigas (merge de inbox) chegavam com
// participants vazio e id no padrão "<uidA>__<uidB>" — o safety-net logava
// "acesso a conv alheia bloqueado" a cada leitura. Reconstrói participants
// a partir do id quando o usuário logado é um dos lados (segurança).
if(!conv.isGroup && (!conv.participants||!conv.participants.length)){
  var _parts=String(conv.id||'').split('__');
  if(_parts.length===2 && _parts[0] && _parts[1]){
    var _me=(typeof S!=='undefined'&&S&&S.userId)||'';
    if(_me && (_parts[0]===_me||_parts[1]===_me)){
      conv.participants=[_parts[0],_parts[1]];
    }
  }
}
```

Reconstrói `participants` **apenas quando o próprio `S.userId` é um dos
lados** — nunca injetamos participants para terceiros (safety‑net do
chat continua sendo a autoridade sobre convs alheias).

---

## Verificação integral (SHA‑256)

Patch runtime idêntico em todas as cópias:

```
45f1c63c94093ae8268a271f549c1f7945e9313485bb127096628a88b56e94a8  js/patches/lf-fix-console-errors-v1-20260818.js
45f1c63c94093ae8268a271f549c1f7945e9313485bb127096628a88b56e94a8  www/js/patches/lf-fix-console-errors-v1-20260818.js
```

`chat.js` idêntico entre raiz e `www/`:

```
22e3048c7ce904c105148e6b6b8aa4989e366e23198f7c2cb05ebf52f1c193d4  js/chat.js
22e3048c7ce904c105148e6b6b8aa4989e366e23198f7c2cb05ebf52f1c193d4  www/js/chat.js
```

`notificacoes.js` difere entre raiz e `www/` **apenas** pelo bloco
`MULTI-TAB-SYNC-20260818` (linhas 450‑514), presente só na raiz — como
já era antes deste patch. O trecho `_notifSoundPaths` é idêntico
(linhas 77‑83) em ambas.

## Injeção nos HTMLs

```
app.html       :2509  <!-- PATCH: lf-fix-console-errors-v1-20260818 -->
app.html       :2510  <script src="js/patches/lf-fix-console-errors-v1-20260818.js?v=20260818ce1"></script>
index.html     :2687  <!-- PATCH: lf-fix-console-errors-v1-20260818 -->
index.html     :2688  <script src="js/patches/lf-fix-console-errors-v1-20260818.js?v=20260818ce1"></script>
www/app.html   :2509  (idem)
www/index.html :2687  (idem)
```

Todas as injeções idempotentes (uma única ocorrência por HTML).

---

## Como recarregar em produção

1. Hard‑reload (Ctrl+Shift+R) para invalidar cache do browser.
2. Se o SW ainda estiver servindo `js/notificacoes.js` velho, bumpe a
   versão do SW — os `.wav/.ogg` cacheados vão desaparecer no próximo
   ciclo.
3. O patch runtime é auto‑protegido por `window.__lfCE1Installed`,
   então executar duas vezes não causa efeito colateral.

## Rollback (se necessário)

- **[B] Patch runtime:** remover o par `<!-- PATCH: ... -->` +
  `<script src="...lf-fix-console-errors-v1-20260818.js...">` dos 4 HTMLs
  e apagar o `.js` de `js/patches/` e `www/js/patches/`.
- **[A]** e **[C]** são correções de origem — para reverter, restaurar
  os blocos originais nas linhas indicadas acima. Os comentários
  `FIX-CE1[A]` e `FIX-CE1[C]` marcam com precisão o ponto de edição.
