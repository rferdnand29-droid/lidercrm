# RELATÓRIO — Fase 1: Controle de Duplicados (padrão Bitrix24)

**Data:** 23/08/2026
**Escopo:** item 1 do documento (configuração de campos + varredura
manual + "Não é duplicado" por usuário), sobre a correção da conversão
Lead→Negócio já entregue na resposta anterior.

---

## O que foi implementado

### 1. Tela "Controle de Duplicados" (⚙️ Configurar)
Escolha, por tipo de registro (Leads / Negócios), quais campos entram
na comparação — hoje **Nome** e **Telefone**. Acessível pelo botão
"⚙️ Configurar" dentro do próprio modal de Duplicatas.

### 2. Motor de comparação reescrito
Antes: agrupava só por telefone idêntico, sem configuração nenhuma.
Agora: compara CADA PAR de registros pelos campos configurados — se
**qualquer** campo marcado bater (nome OU telefone), os dois entram
como candidatos. Registros que batem em cadeia (A~B e B~C) são unidos
no mesmo grupo, mesmo que A e C não batam diretamente entre si.

### 3. "Não é duplicado" — por usuário
Marcar um par como "não é duplicado" esconde a sugestão só pra quem
marcou — outro usuário continua vendo, exatamente como pedido. Fica
salvo por dispositivo/navegador (ver limitação abaixo).

### 4. Permissão — feature inteira, não só a exclusão
Antes, qualquer usuário logado via o botão "🔍 Duplicatas" (só a
exclusão dentro do modal era restrita). Agora o botão inteiro só
aparece pra quem tem permissão administrativa — item 1.4 do
documento ("só aparece pra quem pode editar E excluir").

### 5. Exclusão por conversão preservada
A correção da resposta anterior (Lead convertido não aparece mais
como duplicata do próprio Negócio) continua funcionando — reescrevi o
motor de comparação, mas a mesma lógica de exclusão foi mantida
dentro dele.

---

## Adaptações ao modelo de dados real — registradas, não improvisadas

- O documento fala em Leads/**Contatos**/**Empresas**, com campos
  nome/**empresa**/telefone/**e-mail**. Este CRM não tem essas duas
  entidades separadas nem campo de e-mail em Lead/Negócio — ofereci
  só Nome e Telefone, que são os campos de identidade que realmente
  existem. Não inventei campo novo.
- **Limitação desta fase:** a configuração de campos e as marcações
  de "não é duplicado" ficam salvas **localmente** (no navegador/
  aparelho), não sincronizadas entre dispositivos ou compartilhadas
  automaticamente entre usuários. Sincronizar isso pra equipe toda
  precisaria de um endpoint novo no servidor — deixei de fora desta
  fase pra manter o escopo testável; posso entrar nisso numa fase
  futura se for importante pra vocês.
- "Buscar duplicados agora" continua sendo o próprio ato de abrir o
  modal (já era assim antes) — a varredura roda na hora, sob demanda.

## O que ainda falta do documento (fases seguintes)

- Job agendado de verificação automática (item 2).
- Mesclagem automática quando 100% idêntico (item 3).
- Mesclagem manual campo-a-campo, inclusive entre donos diferentes
  (item 4) — provavelmente a peça mais trabalhosa.
- Observador, separado de Responsável (item 5).
- Flag de "Lead repetido" (item 6).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | motor de comparação reescrito, config, dismissal, permissão |
| `index.html`, `app.html` | modal de configuração novo |

## Verificação

```
node --check js/kanban.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

Renderizei a tela de configuração com o CSS real antes de entregar —
prévia no zip.

## Como validar manualmente

1. Como ADM, abrir Leads → "🔍 Duplicatas" → "⚙️ Configurar".
2. Desmarcar "Nome", deixar só "Telefone" → Salvar — só deve mostrar
   quem bate por telefone.
3. Marcar um par como "Não é duplicado" — deve sumir só na sua sessão.
4. Como usuário sem permissão administrativa, conferir que o botão
   "🔍 Duplicatas" nem aparece mais.
5. Converter um Lead em Negócio, rodar a varredura — não deve aparecer
   como duplicata do Negócio recém-criado.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
