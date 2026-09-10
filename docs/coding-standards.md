# Padrões de código — como escrever um novo patch sem quebrar o resto

Baseado em bugs REAIS encontrados e corrigidos neste projeto em
2026-08-01 (ver `docs/troubleshooting.md` pros casos completos).

## 1. Sempre com guarda de idempotência

Todo patch deve poder ser incluído duas vezes sem efeito colateral
(protege contra HTML desincronizado, cache de navegador, ou alguém
colar a tag duas vezes por engano):

```js
(function (global) {
  'use strict';
  if (global.__LF_MEU_PATCH__) return;   // já rodou, não rodar de novo
  global.__LF_MEU_PATCH__ = true;
  // ...resto do patch...
})(window);
```

## 2. Envelopar (wrap), nunca substituir sem checar o que já existe

```js
var orig = global.minhaFuncao;
if (typeof orig === 'function' && !orig.__meuPatchFlag) {
  var wrapped = function () {
    // ...antes...
    var r = orig.apply(this, arguments);
    // ...depois...
    return r;
  };
  wrapped.__meuPatchFlag = true;
  global.minhaFuncao = wrapped;
}
```

**Cuidado**: se outro patch, carregado DEPOIS, também envelopar a
mesma função, a flag `__meuPatchFlag` do seu wrapper vai ficar
"enterrada" — o `window.minhaFuncao.__meuPatchFlag` vai reportar do
wrapper mais recente, não do seu. Isso é esperado (a lógica ainda roda
em cadeia), só não confie na flag pra diagnosticar se especificamente
o SEU patch rodou — use `LF.diagnostics.logger` pra isso.

## 3. Nunca reative funções idempotentes sem trava dupla

Se seu patch tenta rodar via `DOMContentLoaded` **e** um `setTimeout`
de segurança (fallback caso o evento já tenha passado), garanta que só
UM dos dois efetivamente execute a lógica:

```js
var jaArmado = false;
function armar() {
  if (jaArmado) return;
  jaArmado = true;
  // ...cria interval/timeout aqui...
}
if (document.readyState !== 'loading') armar();
else document.addEventListener('DOMContentLoaded', armar, { once: true });
setTimeout(armar, 3000); // fallback — sem a trava acima, isso cria um SEGUNDO interval órfão
```

## 4. MutationObserver: nunca observe algo que sua própria reação muda

Se seu observer reage a mudanças no DOM re-renderizando algo, e essa
re-renderização MUDA o DOM, você criou um loop de auto-alimentação —
o mesmo bug que travava a aba inteira ao abrir "nova conversa" (ver
troubleshooting). Sempre cheque se já não há o que fazer ANTES de
mutar:

```js
function ensureAlgo() {
  if (jaTemConteudo()) return;  // idempotente — corta o loop na raiz
  renderizar();
}
```

## 5. `defer` muda ordem de execução relativa

Scripts `defer` sempre rodam DEPOIS de todo script normal, mesmo que
apareçam antes no HTML. Misturar os dois tipos no mesmo grupo de
patches interdependentes é a receita pra bug de ordem. Prefira manter
o padrão que já existe ao redor do ponto onde você está inserindo.

## 6. index.html é a fonte HTML

Toda tag `<script>`/`<link>` nova entra somente em `index.html`.
Depois rode `npm run html:sync` para regenerar `app.html`; nunca faça
edições manuais independentes nos dois arquivos. Ver
`docs/architecture.md`.

## 7. Nomes de coluna do banco

Ver `docs/database.md` — `nome`≠coluna real, `telefone`≠coluna real,
`ativo`≠coluna real.
