# Especificação funcional — Card de Lead/Negócio e tela de detalhe

Documento de referência com **tudo que a visualização atual faz**, pra usar
como briefing na hora de desenhar um layout novo. Cobre a lista mobile
(a que aparece nas abas Leads/Negócios do CRM), o menu de opções, e a tela
de detalhe que abre ao tocar num card. Nenhuma função pode ficar de fora
do redesenho — cada item abaixo é algo que alguém usa no dia a dia.

---

## 0. Contexto — os dois funis

O CRM tem duas listas separadas que usam o **mesmo tipo de card e a mesma
tela de detalhe**, só muda o conteúdo:

**Funil de Leads** (contato ainda não confirmado como negócio real):
1. Novo Lead
2. 2° Tentativa
3. WhatsApp
4. Lead Livre *(pool sem dono — qualquer consultor pode assumir)*
5. Convertido *(virou Negócio)*
6. Descartado

**Funil de Negócios** (depois que o lead vira uma venda em andamento):
1. Retornar
2. AG Vídeo
3. Presencial
4. Reagendar
5. Cartela
6. Video/Loja
7. Liberação de Ficha
8. Cliente Aprovado
9. Fechamento
10. Fechado
11. No-Show/Desistência

Cada etapa tem uma cor própria (usada na "etiqueta" da etapa no card — ver
seção 1). Algumas etapas de Negócios são **travadas** pra quem não é
Gestor: não dá pra mover um card *pra* Liberação de Ficha / Cliente
Aprovado / Fechamento / Fechado, nem *sair* dessas + de Video/Loja, sem
ser Gestor.

Categorias de "Nicho" (tipo de negócio), usadas como etiqueta colorida no
card: **Imóvel, Caminhão, Carro/Moto, Pesados, Outro.**

---

## 1. O CARD (lista vertical — Leads e Negócios)

Isso é o que aparece empilhado na tela principal de cada funil. Um card
por lead/negócio, nessa ordem de cima pra baixo:

1. **Cabeçalho**: identificador curto (`Lead #2_M0BW` ou `Neg. #28_6HR`
   — 6 caracteres do ID) + botão **"⋯"** no canto (abre o menu de opções,
   ver seção 2).
2. **Tempo relativo**: "há 11d" (há quanto tempo foi criado). Se for uma
   entrada duplicada, mostra "· repetido" do lado.
3. **Etiqueta de etapa**: um botão colorido (cor vem da etapa atual, ver
   lista da seção 0) com o nome da etapa dentro (ex: "2° Tentativa").
   **Tocar nele abre um seletor de etapa em tela cheia** pra mover o
   card pra outra etapa do funil.
4. **Sub-etapa** (barra de progresso secundária, opcional): um botão menor
   abaixo da etapa principal. Pra Leads, o rótulo padrão é
   "2° tentativa"; as opções são **1ª tentativa → 2° tentativa → 3ª
   tentativa → Aguardando retorno → Confirmado** (uma barrinha de
   progresso embaixo do botão enche conforme avança nessa lista — é
   estilo Bitrix24). Pra Negócios o rótulo padrão é "Sub-etapa" (livre,
   sem lista fixa). Tocar abre um seletor próprio.
5. **Valor** *(só em Negócios)*: campo mostrando o valor da venda em R$,
   ou "—" se ainda não preenchido.
6. **Nome do cliente** — tocar abre a tela de detalhe (seção 3). Ao lado,
   se tiver telefone cadastrado, aparece uma etiqueta com o número.
7. **Responsável**: avatar circular colorido com a inicial do nome +
   primeiro nome + cargo da pessoa responsável pelo lead.
8. **Botão "✋ Assumir Lead"** — só aparece quando o card está na etapa
   **Lead Livre** e não pertence ao usuário atual. Transfere o lead pro
   usuário que tocou o botão.
9. **Barra de ações**, sempre visível embaixo do card, 5 botões lado a
   lado:
   - **📞 Ligar** — abre o discador do celular já com o número (adiciona
     prefixo `021` automaticamente se não tiver) e conta a ligação no
     contador de métricas do consultor.
   - **💬 WhatsApp** — abre o WhatsApp (app nativo no celular, aba nova no
     navegador) direto na conversa com aquele número, via `wa.me`
     (adiciona código do país `55` automaticamente).
   - **📊 Linha do tempo** — atalho pra abrir a tela de detalhe direto na
     aba Histórico.
   - **⬆️ Mover pra cima** / **⬇️ Mover pra baixo** — reordena manualmente
     a posição do card dentro da mesma etapa (não muda etapa, só a ordem
     de exibição entre cards da mesma coluna).

---

## 2. MENU "⋯" (toque longo/botão no card)

Um menu pop-up com estas opções, nesta ordem:

| Ícone | Ação | O que faz |
|---|---|---|
| 👁 | Ver detalhes | Abre a tela de detalhe completa (seção 3) |
| ✎ | Editar | Abre a tela de detalhe **e já pula direto** pro formulário de edição (nome, telefone, nicho, etapa, observação) |
| 🔔 | Lembrete | Abre o formulário de "atividade rápida" (ligação/reunião/tarefa/nota agendada) |
| ✨ | Converter em Negócio | *(só aparece em Leads)* Abre modal pra escolher a etapa inicial do negócio + valor + observação, e move o lead pro funil de Negócios |
| 🚫 | Descartar | Abre modal pedindo o **motivo** (já comprou / sem interesse / em tratativa / outro) e move o card pra etapa de descarte — o card continua existindo, só sai do funil ativo |
| 🗑 | Excluir | Remove o card **permanentemente** (pede confirmação) — diferente de Descartar, aqui não sobra registro. Usado pra duplicata/cadastro errado |

---

## 3. TELA DE DETALHE (abre ao tocar no nome do card, no "📊", ou em "Ver detalhes")

Modal em tela cheia (mobile) com esta estrutura, de cima pra baixo:

### Cabeçalho
- Nome do cliente (grande, título)
- Telefone + data/hora de criação, uma linha abaixo
- **Botões de contato** (só se tiver telefone): **📞 Ligar** e **✉️
  WhatsApp** — mesmas ações da barra do card (seção 1)
- Etiqueta do Nicho no canto (Imóvel/Caminhão/Carro-Moto/Pesados/Outro)

### Ação rápida
- Botão **"🔔 Adicionar Lembrete / Atividade"** — mesma função do item
  "Lembrete" do menu "⋯"

### Barra de etapa (sempre visível, acima das abas)
- Todas as etapas do funil, uma do lado da outra, como botões — a etapa
  atual vem destacada (borda/fundo dourado). Tocar em outra etapa move
  o card na hora (etapas travadas ficam desabilitadas pra quem não é
  Gestor).

### Coluna lateral (visível só pra ADM/Gestor)
- **Responsável**: dropdown pra trocar o dono do lead/negócio
- **Continua como**: dois dropdowns — tipo (Lead ou Negócio) + etapa —
  pra já decidir se ele continua no mesmo funil ou muda de funil nessa
  mesma troca de responsável
- **Motivo da alteração** (texto obrigatório, exigido antes de salvar)
- Botão "Salvar Responsável/Etapa"
- **Valor da Venda (R$)** *(só em Negócios)* — campo numérico, salva
  sozinho ao digitar (sem precisar de botão "Salvar")

### Abas de conteúdo (3)

**📋 Aba Detalhes** (aberta por padrão):
- Campo de **Anotações** (texto livre, salva sozinho ao digitar,
  confirmação visual "Salvo")
- Botão **"Converter em Negócio"** *(Leads, quando ainda não convertido)*
  ou selo "✓ Convertido em Negócio" *(quando já convertido)*
- **Lembretes e atividades vinculadas** — resumo das atividades
  agendadas pra esse lead/negócio específico

**📎 Aba Anexos**:
- Zona de arrastar-e-soltar (ou tocar pra escolher arquivo) — aceita
  PDF, Word, Excel, imagens, áudio, vídeo, até 10MB (vídeo grande
  recomendado até 3MB)
- Barra de progresso de upload
- Contador "X anexos" + alternância entre visualização em **grade** ou
  em **lista**
- Cada anexo tem seu próprio menu: 📌 Fixar, 👁 Visualizar, ⬇ Baixar,
  ✏️ Renomear, 🗑 Excluir

**🕒 Aba Histórico**:
- Linha do tempo de tudo que já aconteceu com aquele card (mudanças de
  etapa, quem editou o quê, quando foi convertido, remarcações etc.)

### Rodapé (botões fixos)
- **Fechar**
- **Editar** (mesma função do menu "⋯")
- **🗑 Descartar** (mesma função do menu "⋯")
- **✕ Excluir** (mesma função do menu "⋯", com aviso de que é diferente
  de Descartar)

---

## 4. Modal "Novo Lead / Novo Negócio / Editar" (formulário)

Usado tanto pra criar quanto editar (o título muda: "Novo Lead" / "Novo
Negócio" / "Editar"). Campos:

1. **Nome / Cliente** (texto)
2. **Telefone** (campo tipo telefone)
3. **Nicho** (dropdown: Imóvel, Caminhão, Carro/Moto, Pesados, Outro)
4. **Etapa** (dropdown com as etapas do funil correspondente)
5. **Observação** (texto livre, opcional)
6. Resumo de lembretes/atividades vinculadas (só aparece editando um já
   existente)
7. Botões: **Cancelar** / **Salvar**

---

## 5. Modal "Converter em Negócio"

Aberto a partir do menu "⋯" → Converter, ou do botão na aba Detalhes:

1. **Etapa do Negócio** (dropdown — em qual etapa do funil de Negócios
   ele entra)
2. **Valor da Venda (R$)** (opcional, pode preencher depois)
3. **Observação** (opcional)
4. Botões: **Cancelar** / **✨ Converter**

---

## Resumo — toda ação disponível, num lugar só

| Ação | Onde | Resultado |
|---|---|---|
| Ligar | Card, Detalhe | Abre discador |
| WhatsApp | Card, Detalhe | Abre WhatsApp na conversa |
| Ver linha do tempo | Card ("📊") | Abre Detalhe → aba Histórico |
| Mover etapa | Card (etiqueta), Detalhe (barra de etapas), Editar | Muda a coluna do funil |
| Mover sub-etapa | Card | Progresso interno dentro da etapa |
| Reordenar | Card (⬆️/⬇️) | Muda posição dentro da mesma etapa |
| Assumir Lead | Card, Detalhe | Transfere lead "Livre" pro usuário atual |
| Ver detalhes | Card, Menu ⋯ | Abre modal de Detalhe |
| Editar | Menu ⋯, Detalhe | Abre formulário preenchido |
| Adicionar lembrete | Card (Detalhe), Menu ⋯ | Agenda atividade (ligação/reunião/tarefa/nota) |
| Converter em Negócio | Menu ⋯, Detalhe | Abre modal de conversão |
| Trocar responsável | Detalhe (ADM/Gestor) | Reatribui o card |
| Anotar | Detalhe → aba Detalhes | Texto livre, salvamento automático |
| Anexar arquivo | Detalhe → aba Anexos | Upload com preview/download/renomear |
| Descartar | Menu ⋯, Detalhe | Move pra etapa de descarte, com motivo |
| Excluir | Menu ⋯, Detalhe | Remove o card de vez |

---

*Gerado a partir do código-fonte real (`js/kanban.js`, `js/whatsapp.js`,
`app.html`) em 2026-08-05 — reflete exatamente o que está em produção
hoje, não uma versão idealizada.*
