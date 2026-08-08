# src/shared/utils/

Biblioteca de utilitários **nova e aditiva**, colocada dentro do
`src/shared/` que **já existia** no projeto (junto com `config/`,
`http/`, `state/`) — não criei uma pasta paralela. `namespace.js`, que
já estava aqui, fornece `LiderCRM.utils.ensureNamespace/resolveGlobal/
safeCall/safePromise/session`; os arquivos novos abaixo usam o MESMO
namespace (`window.LiderCRM.utils.*`), só que com nomes diferentes —
sem colisão nenhuma com o que já existia.

Nenhum arquivo existente foi alterado para usar esta biblioteca nova.
Hoje ela não é carregada por `index.html` nem `app.html`; é código
pronto pra qualquer patch futuro importar quando fizer sentido, sem
ter reescrito nada que já funciona.

## Por que não foi conectada automaticamente

Trocar a formatação de telefone/dinheiro/data que já existe espalhada
em `leads.js`, `clientes.js`, `financeiro-service.js` etc. por chamadas
a esta biblioteca é uma **migração de comportamento**, não uma
reorganização — teria que ser revisada tela por tela. Isso ficou de
fora de propósito (ver conversa sobre a "missão de arquitetura":
dividir/organizar sim, mudar comportamento não).

## O que tem aqui

| Arquivo | Namespace | O que faz |
|---|---|---|
| `cpf-cnpj.js` | `LiderCRM.utils.cpf` / `LiderCRM.utils.cnpj` | Validação (dígito verificador) + formatação. Não existia validação de CPF/CNPJ em lugar nenhum do projeto antes disso. |
| `telefone.js` | `LiderCRM.utils.telefone` | Validação + formatação de telefone BR (fixo/celular, com/sem DDI 55). |
| `dinheiro.js` | `LiderCRM.utils.dinheiro` | Formatação de R$ (superset de `fmtBRL()` — tem `parse()` de volta pra número, que `fmtBRL` não tem). `fmtBRL()` continua sendo a função usada pelo app hoje. |
| `datas.js` | `LiderCRM.utils.datas` | Label relativo ("há 5 min", "ontem às..."), evita duplicar de novo a mesma lógica que já existe solta em `lf-presence-group-login-final-20260730.js`. |
| `validators.js` | `LiderCRM.utils.validators` | email/required/minLength/maxLength/inRange — genéricos de formulário. |
| `debounce-throttle.js` | `LiderCRM.utils.debounceFn` / `LiderCRM.utils.throttleFn` | Versões "padrão de mercado" (recebem função, devolvem função). Diferente do `debounce(key, fn, wait)` de `js/utils.js`, que é por-chave e continua em uso em ~20 lugares — não mexemos nele. |

## Convenção

Tudo pendurado em `window.LiderCRM.utils.*` — nunca em globais soltas — para
não colidir com nada que já existe no projeto (o app inteiro hoje usa
globais soltas tipo `fmtBRL`, `toast`, `debounce`; um namespace próprio
evita qualquer sombreamento acidental).

Cada arquivo é auto-suficiente (idempotente, sem depender de ordem de
carregamento entre eles) — pode ser incluído em qualquer combinação,
em qualquer posição do `<script>`, sem se preocupar com os outros
patches do projeto.

## Se um dia quiser conectar de verdade

1. Adicionar `<script src="shared/utils/cpf-cnpj.js">` (etc.) em
   `index.html` **e** `app.html`, na mesma posição relativa, sem
   `defer` (mesma convenção da maioria dos módulos de base).
2. Trocar, tela por tela, as validações manuais existentes pelas
   chamadas `LiderCRM.utils.*` — com teste manual de cada tela trocada.
3. Não fazer as duas coisas na mesma sessão/deploy — separar "disponibilizar
   a lib" de "migrar uma tela pra usar ela" em entregas diferentes.
