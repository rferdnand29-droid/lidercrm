(function(global){
  'use strict';
  // Dicionário estático de objeções (dado puro, sem lógica de runtime).
  // Extraído de src/modules/leads/runtime/objections-runtime.js na rodada 2026-07-17 (parte 2).
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var leads = modules.leads = modules.leads || {};
  var data = leads.data = leads.data || {};

  var dicionarioObjecoes=[
  {id:1,objecao:"Onde você conseguiu meu número?",categoria:"Origem do contato",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Temos uma equipe de marketing que coleta os números de pessoas interessadas nas plataformas digitais. Você deixou o número em alguma delas.",
    intermediario:"Boa pergunta! Nosso time de marketing capta contatos de quem já demonstrou interesse em comprar imóvel nas redes. Inclusive é por isso que estou te ligando: pra entender melhor o que você procura.",
    experiente:"Isso vem da nossa equipe de marketing, que capta quem já demonstrou interesse em comprar. Já que estamos falando, me conta: você já está decidido a comprar ou ainda está só pesquisando?"}},
  {id:2,objecao:"É consórcio?",categoria:"Modalidade",canal:"preferir_ligacao",respostas:{
    iniciante:"Vai depender de onde você for aprovado. Hoje trabalhamos com bancos e cooperativas de crédito, então a modalidade exata sai depois da análise.",
    intermediario:"Não necessariamente. Trabalhamos com várias modalidades — bancos, cooperativas, consórcio — e a melhor pra você só é definida depois da análise de crédito, por isso é importante entender seu objetivo primeiro.",
    experiente:"Trabalhamos com todas as modalidades de parcelamento do mercado, então não fechamos numa só. O que define qual encaixa melhor é o seu perfil financeiro, e é exatamente isso que vamos descobrir juntos."}},
  {id:3,objecao:"Vocês têm a casa?",categoria:"Imóvel",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Você teria interesse só naquele imóvel específico, ou meu gestor pode te apresentar outras opções no mesmo padrão?",
    intermediario:"Esse imóvel específico pode já não estar disponível, mas trabalhamos com um catálogo bem maior. É só aquele ou você está aberto a ver opções parecidas?",
    experiente:"Nosso foco aqui não é vender só aquele imóvel, é te ajudar a estruturar a condição de compra. Então, independente de qual você escolher no fim, o mais importante agora é entender que valor e que tipo de imóvel cabem no seu orçamento."}},
  {id:4,objecao:"Onde fica a casa?",categoria:"Imóvel",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Em qual localidade você tem interesse? Esse imóvel fica em (X). Você procura casa ou apartamento?",
    intermediario:"Posso te falar a região, mas antes me conta: você está fechado nessa localização ou também olha outras regiões parecidas?",
    experiente:"A localização é só um dos fatores — o que realmente vai definir o que cabe pra você é o valor de entrada e parcela. Me fala, qual região te interessa mais, pra eu já direcionar certo?"}},
  {id:5,objecao:"Você é corretor / Vocês são imobiliária?",categoria:"Identidade da empresa",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Somos uma intermediadora. Hoje a gente consegue te ajudar tanto na parte do imóvel quanto na parte do parcelamento, caso precise.",
    intermediario:"Não somos imobiliária, somos uma intermediadora de crédito — ajudamos a estruturar a forma de pagamento, e também temos um catálogo de imóveis pra te apresentar opções.",
    experiente:"Nosso trabalho é estruturar crédito, ou seja, a condição de compra. O imóvel é consequência disso: depois que sabemos quanto cabe no seu bolso, aí sim entra a parte de mostrar opções de imóvel."}},
  {id:6,objecao:"Vocês fazem financiamento?",categoria:"Modalidade",canal:"preferir_ligacao",respostas:{
    iniciante:"Vai depender de onde você for aprovado, porque trabalhamos com bancos e cooperativas de crédito.",
    intermediario:"Sim, entre outras modalidades. Trabalhamos com financiamento bancário, cooperativa e consórcio — a melhor opção sai da análise do seu perfil.",
    experiente:"Trabalhamos com todas as modalidades de parcelamento, incluindo financiamento. Mas antes de te falar qual encaixa melhor, preciso entender sua situação financeira atual."}},
  {id:7,objecao:"Por que eu preciso ir ao escritório?",categoria:"Convite/Agendamento",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Aqui no nosso escritório, meu gestor vai fazer esse acompanhamento com você, montar um planejamento estratégico de compra e te mostrar o catálogo privado da empresa.",
    intermediario:"É porque o atendimento completo, com análise de perfil e o catálogo privado, só é feito pessoalmente — assim conseguimos te dar uma proposta sob medida, não genérica.",
    experiente:"Porque decisão de compra de imóvel não se resolve com informação solta — precisa de um planejamento. No escritório, meu gestor monta isso com você e ainda te mostra opções que nem chegaram a ser anunciadas."}},
  {id:8,objecao:"Não posso ver a casa antes?",categoria:"Imóvel",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Toda a visitação é feita depois que o cliente vem até a loja, para fazer o levantamento de perfil com o gestor.",
    intermediario:"A visita acontece depois da reunião, porque primeiro a gente entende o seu perfil financeiro — assim você só visita imóveis que realmente cabem no seu bolso.",
    experiente:"Visitar antes de saber o que cabe no seu orçamento normalmente gera frustração. Por isso o passo a passo é: primeiro o planejamento com o gestor, depois a visita certa."}},
  {id:9,objecao:"Pode mandar as casas pelo WhatsApp?",categoria:"Catálogo",canal:"somente_ligacao",respostas:{
    iniciante:"Hoje trabalhamos com um catálogo privado, com imóveis que ainda nem foram anunciados pra venda.",
    intermediario:"Esse catálogo é privado e só é apresentado pessoalmente — são imóveis que nem chegaram a ir pro mercado, por isso não circula por WhatsApp.",
    experiente:"O catálogo é exclusivo dos nossos clientes em atendimento presencial, justamente pra te dar acesso a algo que o público em geral não vê. Vou te mostrar isso direitinho na nossa reunião."}},
  {id:10,objecao:"Qual é o mínimo de entrada? / Qual a taxa de juros?",categoria:"Valores",canal:"somente_ligacao",respostas:{
    iniciante:"Vai depender de onde você for aprovado, mas geralmente quanto maior a entrada, melhor a taxa.",
    intermediario:"Isso varia de acordo com a instituição que te aprovar e o seu perfil de crédito — por isso o ideal é fazer a análise pra eu te dar um número real, não um chute.",
    experiente:"Te dar um número agora seria te enganar, porque cada instituição aprova diferente. O que eu posso garantir é: quanto maior a entrada, melhor a taxa tende a ficar — e a análise vai te mostrar o cenário exato."}},
  {id:11,objecao:"Podemos conversar pelo WhatsApp?",categoria:"Canal de atendimento",canal:"somente_ligacao",respostas:{
    iniciante:"Por conta da alta demanda aqui na empresa, e pra te atender melhor, a gente faz tudo por ligação. Que horas eu posso te retornar sem te atrapalhar?",
    intermediario:"Entendo a praticidade do WhatsApp, mas pra te dar uma resposta certa (e não genérica), o atendimento é por ligação. Qual o melhor horário pra eu te retornar?",
    experiente:"Consigo te ajudar muito mais rápido por ligação do que por texto, porque tiro suas dúvidas na hora. Me diz um horário que funciona pra você hoje ou amanhã."}},
  {id:12,objecao:"Vocês cobram alguma taxa antes de eu ser aprovado?",categoria:"Valores",canal:"preferir_ligacao",respostas:{
    iniciante:"Não cobramos nada pra fazer a análise do seu perfil. Os valores só entram em jogo depois que você decide seguir com a proposta aprovada.",
    intermediario:"A análise inicial não tem custo. Eventuais taxas variam por instituição financeira e só existem depois da aprovação, sempre explicadas com transparência antes de você assinar qualquer coisa.",
    experiente:"Nosso primeiro passo, a análise de perfil, é sem custo. Eu não teria motivo pra te cobrar algo antes de saber se você se encaixa — meu trabalho é te mostrar um caminho viável primeiro."}},
  {id:13,objecao:"Já tentei em outro lugar e não consegui aprovação, por que seria diferente agora?",categoria:"Objeção de confiança",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Cada instituição analisa de um jeito, e trabalhamos com várias ao mesmo tempo, então as chances de encontrar uma que aprove aumentam.",
    intermediario:"Entendo a frustração. A diferença é que a gente não trabalha com uma instituição só — analisamos seu perfil e buscamos entre bancos e cooperativas qual te aprova nas melhores condições.",
    experiente:"Justamente por isso vale a pena tentar com a gente: você não está limitado a uma instituição, e sim a várias ao mesmo tempo. Muita gente que foi negada em um lugar conseguiu por outro caminho com nosso acompanhamento."}},
  {id:14,objecao:"Não tenho pressa, posso decidir com calma e te retorno?",categoria:"Postergação",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Sem problema! Só pra eu não te incomodar, qual seria um prazo que faz sentido pra você pensar?",
    intermediario:"Tranquilo, decisão de imóvel não se faz com pressa mesmo. Posso já te marcar uma conversa sem compromisso pra você entender as opções com calma e decidir depois com mais informação?",
    experiente:"Faz total sentido pensar com calma — e é exatamente por isso que vale a pena já ter os números na mão. Vamos marcar uma conversa rápida só pra você sair sabendo o que cabe no seu bolso, sem nenhum compromisso de decidir hoje?"}},
  {id:15,objecao:"Vocês trabalham com ágio / transferência de contrato?",categoria:"Modalidade",canal:"preferir_ligacao",respostas:{
    iniciante:"Trabalhamos com todas as modalidades de parcelamento, então isso pode entrar como uma das opções analisadas.",
    intermediario:"Pode ser uma das alternativas, dependendo do seu perfil e do imóvel. O ideal é avaliar isso junto com as outras modalidades para ver qual sai mais vantajosa pra você.",
    experiente:"Existem várias formas de estruturar a compra, e ágio é uma delas. Mas antes de fechar nessa, vale comparar com as outras modalidades — muitas vezes existe uma opção com custo total menor."}},
  {id:16,objecao:"Prefiro falar direto com um gerente/responsável.",categoria:"Hierarquia",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Sem problema, posso já te encaminhar pra reunião com nosso gestor, que é quem monta o planejamento com você.",
    intermediario:"Claro. Inclusive a etapa seguinte já é exatamente essa: uma conversa com nosso gestor especialista, que vai te atender com mais profundidade.",
    experiente:"Com certeza, e é pra isso que estou aqui: organizar essa conversa com nosso gestor da melhor forma, já levando as informações certas pra ele te atender rápido e bem."}},
  {id:17,objecao:"Já estou negociando direto com o proprietário / já tenho corretor.",categoria:"Concorrência",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Que ótimo que você já está adiantado! Posso te ajudar com a parte de crédito mesmo assim, sem interferir na negociação do imóvel.",
    intermediario:"Perfeito, isso não é problema — a gente não compete com a negociação do imóvel, a gente entra justamente na parte de estruturar como você vai pagar por ele.",
    experiente:"Isso até facilita: você já resolveu a parte do imóvel, agora só falta resolver a parte de crédito da melhor forma possível — e é exatamente aí que eu posso te ajudar."}},
  {id:18,objecao:"Estou com nome sujo / negativado, ainda consigo aprovação?",categoria:"Crédito",canal:"preferir_ligacao",respostas:{
    iniciante:"Cada instituição analisa de um jeito, então o ideal é fazer a análise pra ver as opções reais pro seu caso.",
    intermediario:"Restrição não significa reprovação automática — depende do valor, do tempo da pendência e da instituição. Por isso vale a pena fazer a análise antes de descartar a possibilidade.",
    experiente:"Trabalhamos com instituições diferentes, e cada uma tem critério próprio pra esse tipo de situação. Em vez de presumir que não vai dar certo, o melhor caminho é deixar a análise te mostrar o cenário real."}},
  {id:19,objecao:"Posso usar o FGTS?",categoria:"Modalidade",canal:"preferir_ligacao",respostas:{
    iniciante:"Pode ser uma das opções, dependendo da modalidade e da instituição que aprovar seu crédito.",
    intermediario:"O FGTS pode entrar como parte da entrada ou amortização em algumas modalidades — isso é confirmado durante a análise, junto com as outras condições.",
    experiente:"O FGTS é uma ferramenta interessante dentro do planejamento, mas o uso dele depende da modalidade aprovada. Vamos avaliar isso junto com o restante do seu perfil financeiro."}},
  {id:20,objecao:"Quanto tempo demora a aprovação / pra sair as chaves?",categoria:"Prazo",canal:"preferir_ligacao",respostas:{
    iniciante:"Isso varia de acordo com a instituição e a modalidade, então o prazo certo sai depois da análise.",
    intermediario:"O prazo muda conforme banco, cooperativa ou consórcio, e também conforme a documentação de cada cliente. Por isso prefiro te passar um prazo real depois de entender seu caso, e não um número genérico.",
    experiente:"Prometer prazo sem analisar seria te dar uma expectativa que pode não se confirmar. O que posso garantir é que, assim que a análise sair, você vai saber exatamente o que esperar e quando."}},
  {id:21,objecao:"E se eu não conseguir pagar as parcelas depois?",categoria:"Segurança/Risco",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Por isso a análise existe: ela é feita justamente pra te aprovar num valor de parcela que cabe na sua realidade.",
    intermediario:"Entendo a preocupação. Todo o planejamento é montado em cima do que cabe no seu orçamento hoje, não no limite máximo — a ideia é que a parcela seja confortável, não um aperto.",
    experiente:"Essa preocupação é saudável e mostra que você pensa antes de decidir. O nosso trabalho no planejamento é exatamente esse: estruturar um valor de parcela que tenha folga, não que aperte seu mês."}},
  {id:22,objecao:"Trabalham com qual banco ou instituição?",categoria:"Modalidade",canal:"preferir_ligacao",respostas:{
    iniciante:"Trabalhamos com várias instituições ao mesmo tempo, não com uma só — assim conseguimos comparar e te oferecer a melhor condição.",
    intermediario:"Não fechamos com um banco único. Analisamos seu perfil e buscamos entre bancos e cooperativas parceiras qual te aprova com a melhor taxa e prazo.",
    experiente:"Justamente por trabalhar com várias instituições ao mesmo tempo, conseguimos comparar condições reais pro seu perfil, em vez de te empurrar a única opção de um banco fixo."}},
  {id:23,objecao:"Tem algum imóvel pronto pra morar, sem precisar esperar obra?",categoria:"Imóvel",canal:"preferir_ligacao",respostas:{
    iniciante:"Temos opções prontas e na planta no catálogo, depende da região e do seu orçamento. Vamos ver isso na análise.",
    intermediario:"Temos sim imóveis prontos no catálogo — a disponibilidade muda conforme região e faixa de valor, por isso o ideal é alinhar isso já no planejamento com o gestor.",
    experiente:"Sim, temos opções prontas pra entrega imediata. Pra eu já filtrar certo no catálogo, me conta: morar logo é prioridade pra você ou prazo não é problema?"}},
  {id:24,objecao:"Posso renegociar se eu atrasar uma parcela?",categoria:"Segurança/Risco",canal:"preferir_ligacao",respostas:{
    iniciante:"Cada instituição tem sua própria política pra isso, então o ideal é alinhar essa condição já na análise, antes de fechar.",
    intermediario:"Existem opções de renegociação, mas elas variam por instituição e por contrato. Vale a pena perguntar isso especificamente durante o planejamento, pra você já saber o cenário.",
    experiente:"Esse é exatamente o tipo de pergunta que vale tirar antes de assinar, porque a política muda de instituição pra instituição. Posso te explicar com calma na nossa conversa o que cada uma oferece."}},
  {id:25,objecao:"Quanto vou pagar de juros no total?",categoria:"Valores",canal:"somente_ligacao",respostas:{
    iniciante:"Isso depende da instituição que aprovar e do prazo escolhido, então o número certo só sai depois da análise.",
    intermediario:"O total de juros varia bastante conforme banco, prazo e perfil de crédito — por isso prefiro te passar uma simulação real, em vez de um número solto que pode nem se confirmar.",
    experiente:"Te dar um número de juros sem análise seria chute, e isso eu não faço. O que posso garantir é uma simulação completa e transparente assim que entendermos seu perfil — aí sim você vê exatamente quanto vai pagar."}},
  {id:26,objecao:"Vocês garantem a aprovação?",categoria:"Crédito",canal:"somente_ligacao",respostas:{
    iniciante:"Ninguém pode garantir aprovação antes da análise, isso depende da instituição. Mas trabalhamos com várias pra aumentar suas chances.",
    intermediario:"Garantia ninguém pode dar, porque quem aprova é a instituição financeira, não a gente. O que fazemos é te posicionar nas melhores condições possíveis, analisando seu perfil em várias frentes ao mesmo tempo.",
    experiente:"Se alguém te garantir aprovação sem analisar nada, desconfie. O que eu posso te garantir é um trabalho sério: vamos buscar entre várias instituições qual encaixa no seu perfil real."}},
  {id:27,objecao:"Se eu desistir depois de assinar, perco o dinheiro?",categoria:"Segurança/Risco",canal:"somente_ligacao",respostas:{
    iniciante:"Isso depende do contrato e da fase em que você está. É importante eu te explicar com calma os detalhes antes de qualquer assinatura.",
    intermediario:"As condições de desistência variam conforme o contrato e a instituição, e tem prazos legais envolvidos. Prefiro te explicar isso com cuidado numa ligação, pra não passar nenhuma informação incompleta.",
    experiente:"Essa é uma pergunta importante e a resposta certa depende de detalhes do seu contrato específico. Vou te explicar tudo com transparência numa ligação, porque isso envolve questões legais que merecem ser bem explicadas, não um resumo por texto."}},
  {id:28,objecao:"Atendem em qual cidade ou região?",categoria:"Cobertura",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Atendemos em várias regiões. Me conta onde você procura o imóvel que eu já te falo se temos cobertura por lá.",
    intermediario:"Trabalhamos com cobertura em várias cidades e regiões — me fala onde você tem interesse que eu confirmo certinho o que temos disponível por aí.",
    experiente:"Nossa cobertura é ampla, mas pra eu te dar uma resposta precisa e já adiantar opções reais, me conta a cidade e região que você tem em mente."}},
  {id:29,objecao:"Precisa ter conta em algum banco específico?",categoria:"Modalidade",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Não, não precisa ter conta em banco específico. Isso não é pré-requisito pra começar a análise.",
    intermediario:"Não é necessário ter conta em nenhum banco específico — trabalhamos com várias instituições e isso não interfere na sua análise.",
    experiente:"Pode ficar tranquilo, ter ou não conta em determinado banco não é pré-requisito. O que pesa de verdade na análise é o seu perfil financeiro como um todo."}},
  {id:30,objecao:"Vocês têm site ou Instagram pra eu ver mais?",categoria:"Identidade da empresa",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Sim, temos! Posso te passar nossas redes pra você conhecer mais sobre o nosso trabalho.",
    intermediario:"Temos sim, fico feliz em te passar. Mas além de ver por lá, recomendo a gente já marcar a conversa, porque o catálogo completo e as condições reais só aparecem no atendimento.",
    experiente:"Com certeza, posso te passar nossas redes agora mesmo. Só não deixa isso substituir nossa conversa — é nela que você vê as condições e opções feitas sob medida pra você, não genéricas."}},
  {id:31,objecao:"Prefiro esperar o mercado melhorar",categoria:"Postergação",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Entendo a preocupação, mas o mercado imobiliário tende a valorizar, então esperar pode custar mais caro depois.",
    intermediario:"Essa é uma dúvida comum. Posso te mostrar como os preços evoluíram nos últimos meses na sua região de interesse?",
    experiente:"Quem esperou o mercado 'melhorar' nos últimos anos viu os imóveis subirem. O melhor momento costuma ser antes que todos percebam que ele chegou."}},
  {id:32,objecao:"Já tenho uma proposta de outro banco",categoria:"Concorrência",canal:"preferir_ligacao",respostas:{
    iniciante:"Ótimo que você já tem uma proposta! Posso analisar com você para ver se conseguimos uma condição melhor ou igual.",
    intermediario:"Ter uma proposta já é um avanço. Me conta as condições que te ofereceram — assim comparo com o que consigo aqui e você decide com mais informação.",
    experiente:"Ótima posição pra você estar. Me mostra os números que te passaram: muitas vezes encontramos uma taxa menor, prazo melhor, ou menos burocracia em outra instituição."}},
  {id:33,objecao:"Meu cônjuge não quer comprar agora",categoria:"Decisor",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Tudo bem! O ideal seria você trazer seu cônjuge também pra gente conversar juntos, assim alinhamos as dúvidas de uma vez.",
    intermediario:"Faz todo sentido incluir quem decide junto. Que tal marcar uma reunião com os dois? Assim respondo as dúvidas dele/dela também e vocês saem com a mesma informação.",
    experiente:"Decisão de imóvel precisa mesmo ser dos dois. Me diz qual a principal preocupação do seu cônjuge — às vezes é algo que consigo esclarecer numa conversa rápida com vocês juntos."}},
  {id:34,objecao:"Não sei se minha renda é suficiente",categoria:"Crédito",canal:"zap_ou_ligacao",respostas:{
    iniciante:"A análise vai mostrar exatamente o que cabe no seu perfil, sem suposições. Vale fazer pra saber de verdade.",
    intermediario:"Não é possível saber sem analisar — muita gente se surpreende com o que consegue aprovação. Me conta sua renda aproximada e te dou uma ideia antes da análise formal.",
    experiente:"Esse é exatamente o ponto que a análise responde. O que define aprovação não é só a renda bruta, mas o comprometimento atual, o tempo de emprego e outros fatores. Deixa a análise te contar a resposta certa."}},
  {id:35,objecao:"Quero construir, não comprar pronto",categoria:"Imóvel",canal:"preferir_ligacao",respostas:{
    iniciante:"Trabalhamos com crédito para aquisição de terreno e construção também. Vale analisar as opções.",
    intermediario:"Construção tem modalidades específicas de financiamento. Posso te apresentar as opções disponíveis e compararmos com comprar um imóvel na planta, que muitas vezes sai mais em conta.",
    experiente:"Construir tem vantagens, mas também custos ocultos que raramente são considerados no início. Vou te mostrar um comparativo real entre construir e comprar, assim você decide com números na mão."}},
  {id:36,objecao:"Tenho medo de perder o emprego e não pagar",categoria:"Segurança/Risco",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Esse risco existe, mas a análise é feita pra aprovar uma parcela confortável, não no limite da sua renda.",
    intermediario:"É uma preocupação legítima. Por isso estruturamos a parcela dentro de uma margem segura do orçamento — e existem seguros de renda que cobrem exatamente essa situação.",
    experiente:"Você está pensando certo ao considerar isso. No planejamento, trabalhamos com uma parcela que não comprometa mais do que 30% da renda — e ainda existe o seguro prestamista que cobre parcelas em caso de desemprego."}},
  {id:37,objecao:"Posso fazer tudo online sem ir ao escritório?",categoria:"Convite/Agendamento",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Parte do processo é digital, mas a análise completa e o catálogo privado só acontecem presencialmente com o gestor.",
    intermediario:"Algumas etapas são online, mas o atendimento de qualidade — com análise de perfil e apresentação de opções sob medida — exige uma reunião presencial ou por vídeo com o gestor.",
    experiente:"O que posso adiantar por aqui é o básico, mas você vai ter uma experiência muito melhor presencialmente. O gestor tem acesso a um catálogo e condições que só apresenta ao vivo — e é rápido, menos de uma hora."}},
  {id:38,objecao:"Quero esperar meu 13º / bônus para dar entrada",categoria:"Postergação",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Faz sentido. Podemos já fazer a análise agora e alinhar a proposta para quando o valor estiver disponível.",
    intermediario:"Ótima estratégia! A análise pode ser feita agora e a proposta já deixamos preparada pra quando o 13º cair. Assim você não perde tempo depois.",
    experiente:"Excelente planejamento. O que posso fazer agora é analisar seu perfil, escolher a melhor instituição e deixar tudo pronto — quando o 13º entrar, é só ativar. Sem correria e sem perder oportunidade."}},
  {id:39,objecao:"Já fui enganado por uma empresa assim antes",categoria:"Objeção de confiança",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Entendo totalmente sua desconfiança. Posso te mostrar nossa documentação, registros e depoimentos de clientes reais.",
    intermediario:"Lamento que isso tenha acontecido. Nossa empresa é registrada e posso te passar o CNPJ, endereço físico e referências de clientes pra você verificar antes de qualquer compromisso.",
    experiente:"Essa cautela é saudável e mostra que você aprendeu. Não peço que confie só na minha palavra — me deixa te mostrar como trabalhamos, visitar nosso escritório e falar com clientes que já passaram pelo processo."}},
  {id:40,objecao:"Quanto vocês ganham nessa transação?",categoria:"Transparência",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Nossa remuneração vem da instituição financeira após a aprovação — você não paga nada pra gente diretamente.",
    intermediario:"Boa pergunta. Trabalhamos com comissão paga pela instituição que aprovar seu crédito, não pelo cliente. Ou seja, só recebemos se você for aprovado e fechar — nosso interesse é no seu sucesso.",
    experiente:"Transparência total: somos remunerados pela instituição financeira após o fechamento, não pelo cliente. Isso significa que só ganho se você ganhar — não tenho incentivo para te empurrar uma opção ruim."}},
  {id:41,objecao:"Preciso resolver uma dívida antes",categoria:"Crédito",canal:"preferir_ligacao",respostas:{
    iniciante:"Dependendo da dívida, ainda pode ser possível analisar seu crédito. Vale verificar antes de esperar.",
    intermediario:"Entendo. Dependendo do tipo e valor da dívida, ela pode não impactar tanto quanto você imagina na análise. Me conta a situação que oriento melhor.",
    experiente:"Às vezes resolver antes é o caminho, às vezes não é necessário. Cada caso é diferente — me conta o que está pendente e analiso se isso impacta realmente ou se podemos avançar mesmo assim."}},
  {id:42,objecao:"Não tenho comprovante de renda formal",categoria:"Crédito",canal:"preferir_ligacao",respostas:{
    iniciante:"Trabalhamos com algumas instituições que aceitam renda informal documentada. Vale analisar.",
    intermediario:"Renda informal não é necessariamente um impedimento. Algumas instituições aceitam extratos bancários, declaração de IR e outras formas de comprovação alternativa.",
    experiente:"Esse perfil é mais comum do que parece e já atendemos muitos clientes nessa situação. O que muda é a documentação — usamos extrato, declaração de faturamento ou outros comprovantes aceitos por instituições parceiras."}},
  {id:43,objecao:"O imóvel que quero é muito caro pra mim",categoria:"Valores",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Talvez existam opções dentro do seu orçamento com características parecidas. Me conta o que procura.",
    intermediario:"Vamos descobrir juntos o que cabe no seu bolso antes de descartar. Muitas vezes o que parece caro no total fica viável com a parcela certa.",
    experiente:"'Caro' é relativo antes da análise. Vamos olhar o quanto você consegue de crédito e qual parcela é confortável — às vezes o imóvel que você quer está mais acessível do que imagina."}},
  {id:44,objecao:"Tenho outro investimento em andamento agora",categoria:"Postergação",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Entendo. Podemos conversar sobre possibilidades sem compromisso para você avaliar quando fizer sentido.",
    intermediario:"Faz sentido. Posso fazer uma análise prévia do seu perfil agora, sem compromisso, para quando terminar o investimento atual você já saber o que tem disponível.",
    experiente:"Investimento e imóvel não são excludentes — muitas vezes usar parte do retorno como entrada é exatamente o plano ideal. Posso fazer uma análise agora pra você ter esse dado na sua tomada de decisão."}},
  {id:45,objecao:"Não quero meu nome envolvido em financiamento",categoria:"Segurança/Risco",canal:"preferir_ligacao",respostas:{
    iniciante:"Entendo a preocupação. Posso explicar melhor como o processo funciona e o que de fato aparece no seu histórico.",
    intermediario:"O financiamento aparece no seu histórico de crédito, mas não é algo negativo — na verdade, pagar as parcelas em dia melhora seu score. Posso te explicar como isso funciona.",
    experiente:"Essa preocupação faz sentido, mas financiamento ativo e bem gerido na verdade melhora seu histórico de crédito. Vou te explicar como funciona na prática, sem romantismo."}},
  {id:46,objecao:"Minha esposa/marido prefere alugar",categoria:"Decisor",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Que tal trazer seu cônjuge numa reunião? Posso apresentar uma comparação entre alugar e comprar.",
    intermediario:"A conta entre alugar e comprar muda muito dependendo do perfil. Posso montar um comparativo simples para vocês dois avaliarem juntos.",
    experiente:"Essa é uma discussão que vale ter com números reais na mesa. Posso montar uma simulação mostrando o que cada um paga ao longo de 10 anos — quem aluga vs quem financia — e vocês decidem com informação."}},
  {id:47,objecao:"Vocês garantem a aprovação?",categoria:"Crédito",canal:"somente_ligacao",respostas:{
    iniciante:"Ninguém pode garantir aprovação antes da análise, isso depende da instituição. Mas trabalhamos com várias pra aumentar suas chances.",
    intermediario:"Garantia ninguém pode dar, porque quem aprova é a instituição financeira, não a gente. O que fazemos é te posicionar nas melhores condições possíveis, analisando seu perfil em várias frentes ao mesmo tempo.",
    experiente:"Se alguém te garantir aprovação sem analisar nada, desconfie. O que eu posso te garantir é um trabalho sério: vamos buscar entre várias instituições qual encaixa no seu perfil real."}},
  {id:48,objecao:"Posso parcelar a entrada?",categoria:"Valores",canal:"preferir_ligacao",respostas:{
    iniciante:"Depende da modalidade e da instituição. Isso é uma das coisas que avaliamos na análise.",
    intermediario:"Em alguns casos sim, dependendo do produto e da instituição. Vale incluir essa condição na análise pra ver as possibilidades reais pro seu perfil.",
    experiente:"Essa é uma das estruturações possíveis em algumas modalidades. Vamos incluir isso na análise e ver exatamente quais instituições aceitam e em quais condições — assim você decide com números reais."}},
  {id:49,objecao:"Ouvi falar que está difícil aprovar crédito imobiliário agora",categoria:"Objeção de confiança",canal:"zap_ou_ligacao",respostas:{
    iniciante:"O mercado varia, mas continuamos conseguindo aprovações. O perfil de cada cliente é o que mais define.",
    intermediario:"Existem momentos de maior exigência, mas os critérios mudam por instituição — o que é difícil num banco pode ser viável em cooperativa ou consórcio. Só a análise mostra o cenário real pro seu caso.",
    experiente:"'Difícil' é diferente de 'impossível', e depende muito do perfil. Já aprovamos clientes em períodos ditos 'travados'. O que de fato define são os seus números — renda, comprometimento, histórico. Deixa a análise falar por você."}},
  {id:50,objecao:"Prefiro comprar à vista quando juntar o dinheiro",categoria:"Postergação",canal:"zap_ou_ligacao",respostas:{
    iniciante:"Juntar o valor total pode demorar muitos anos. Nesse tempo, o imóvel valoriza e o aluguel continua saindo do bolso.",
    intermediario:"Entendo a lógica. Mas vale comparar: quanto você paga de aluguel enquanto junta o dinheiro? Muitas vezes financiar custa menos do que esperar.",
    experiente:"Comprar à vista parece mais seguro, mas matematicamente nem sempre é a melhor jogada. Posso te mostrar uma simulação comparando as duas estratégias — você decide com os números na mão."}}
];

  data.dicionarioObjecoes = dicionarioObjecoes;

  /* R14-18: expor variáveis ao escopo global */
  if(typeof root !== 'undefined') global.root = root;
  if(typeof modules !== 'undefined') global.modules = modules;
  if(typeof leads !== 'undefined') global.leads = leads;
  if(typeof data !== 'undefined') global.data = data;
  if(typeof dicionarioObjecoes !== 'undefined') global.dicionarioObjecoes = dicionarioObjecoes;
  if(typeof e !== 'undefined') global.e = e;
  if(typeof seu !== 'undefined') global.seu = seu;
  if(typeof num !== 'undefined') global.num = num;
  if(typeof e !== 'undefined') global.e = e;
  if(typeof uma !== 'undefined') global.uma = uma;
  if(typeof seu !== 'undefined') global.seu = seu;
  if(typeof cr !== 'undefined') global.cr = cr;

})(window);
