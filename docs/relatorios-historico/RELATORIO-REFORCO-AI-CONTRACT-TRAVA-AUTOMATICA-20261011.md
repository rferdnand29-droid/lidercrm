# RELATORIO-REFORCO-AI-CONTRACT-TRAVA-AUTOMATICA-20261011

## Pedido

Fortalecer o mecanismo que orienta/trava outras IAs (Genspark,
Lovable, etc.) a seguirem o mesmo rigor de trabalho — investigar
antes de mexer, testar de verdade, ler o arquivo antes de modificar.

## Resposta honesta antes de qualquer código: o que dá e o que não dá pra garantir

**O que JÁ existia**: `AI_CONTRACT.md` (regras de arquitetura,
padrão de patch, proibições) + `scripts/ai-guard.mjs` (checagem
automática de formato). Isso é real e funciona — mas focava no
FORMATO do resultado (é IIFE? está espelhado? o diff é pequeno?), não
no PROCESSO de investigação por trás.

**O que é tecnicamente impossível garantir**: nenhum arquivo de texto
força literalmente o RACIOCÍNIO de outra IA — cada ferramenta tem seu
próprio comportamento interno, e um arquivo de instruções só pode
ORIENTAR, nunca controlar de verdade o que está "por dentro" de outra
IA. Isso vale pra qualquer ferramenta, não é limitação deste projeto
específico.

**O que É possível garantir de verdade**: o RESULTADO FINAL, de forma
automática e objetiva — se os testes passam, se o código satisfaz
certos padrões checáveis. Isso não depende da IA "querer" seguir o
processo — é reforçado tecnicamente.

## O que fiz — duas frentes

### 1. Trava técnica real, reforçada (o que dá pra garantir de verdade)

**Achado real**: rodar `npm run lint` e `npm test` era só um passo
MANUAL documentado — nada impedia automaticamente um commit com teste
quebrado chegar ao repositório. Corrigido: `githooks/pre-commit` agora
roda os dois de verdade e **bloqueia o commit** se qualquer um falhar,
não importa quem (ou qual IA) escreveu o código.

**Testado em cenário controlado** antes de confiar nisso: quebrei um
teste de propósito, confirmei que o hook bloqueou com código de saída
1 e mensagem clara; restaurei o teste, confirmei que voltou a passar
normalmente.

### 2. Orientação mais explícita (o que só posso reforçar, não garantir tecnicamente)

Adicionei a seção `2.5` ao `AI_CONTRACT.md` — processo investigativo,
com 7 práticas concretas (não confiar cegamente em relatórios
externos, rastrear a cadeia causal completa, nunca declarar algo
corrigido sem rodar de verdade, escrever teste contra o código de
produção real, reler a área editada antes/depois, preferir a correção
conservadora quando incerto, ser honesto sobre erros cometidos) — cada
uma com um exemplo real e concreto de bug já encontrado neste projeto
seguindo exatamente esse padrão, pra qualquer IA que ler isso ter
contexto de verdade, não só regra abstrata.

## Nota irônica, deixada de propósito no relatório

Ao escrever a seção 2.5.5 (sobre reler a área editada depois de
qualquer `str_replace`, porque é fácil remover uma linha vizinha sem
querer), cometi exatamente esse erro na edição seguinte — removi
acidentalmente o cabeçalho "## 3." do próprio documento. Peguei
relendo a região logo em seguida, como a nova seção recomenda fazer.
Deixei essa nota aqui de propósito: é o tipo de coisa que reforça por
que a seção existe — o processo funciona porque a verificação pega o
erro, não porque o erro deixa de acontecer.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `githooks/pre-commit` | lint + testes agora bloqueiam o commit de verdade |
| `AI_CONTRACT.md` | seção 2.5 nova (processo investigativo); seções 5/6 atualizadas |

## Verificação

```
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 237/237 testes
npx cap sync                     → android/ios sincronizados
Hook testado em cenário controlado → bloqueia teste quebrado (confirmado), passa limpo (confirmado)
```

## O que continua sendo limitação genuína, não resolvida

Se uma IA (ou pessoa) commitar direto pulando o hook
(`git commit --no-verify`), ou usar uma ferramenta que não roda hooks
de git locais (algumas plataformas de deploy direto fazem isso), a
trava não se aplica. Isso é uma limitação real de qualquer sistema de
hook local — não tem solução 100% à prova de tudo sem controle também
do lado do servidor/CI (que já existe parcialmente — a Cloudflare
Pages roda o build de novo, mas hoje não roda `npm test` como parte
desse pipeline). Se quiser fechar essa lacuna também, dá pra
configurar isso no CI da Cloudflare Pages — mas é uma mudança de
infraestrutura de deploy, fora do escopo do que um arquivo do
repositório consegue controlar sozinho.

## Reversão

O hook pode ser revertido isolando o passo 3 novo — mas isso reabre a
lacuna real (commit com teste quebrado passando sem barreira nenhuma).
Não recomendo reverter sem substituir por outra proteção equivalente.
