#!/usr/bin/env node
/**
 * Correção definitiva: prazo de Lead Livre e abertura da aba Time.
 * Uso: node scripts/apply-time-and-stale-leads-fix.mjs [diretório-do-projeto]
 * O script cria cópias .bak antes de alterar cada arquivo.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const edits = [
  {
    file: 'js/kanban.js',
    replacements: [
      {
        old: "var _kbViewUid={leads:null,negocios:null}\n",
        next: "var _kbViewUid={leads:null,negocios:null};\n\n// Regra de negócio única: um Lead só vai automaticamente para Livre após 3 dias completos na etapa atual.\n// Centralizar o valor evita divergência entre o indicador visual e a movimentação persistida.\nvar KB_STALE_TO_LIVRE_DAYS=3;\nvar KB_STALE_TO_LIVRE_MS=KB_STALE_TO_LIVRE_DAYS*24*60*60*1000;\n"
      },
      {
        old: "  var _staleMs=2*24*60*60*1000;/* R15-01: 2 dias → etapa livre automática */",
        next: "  var _staleMs=KB_STALE_TO_LIVRE_MS;/* Regra única: 3 dias → etapa livre automática */"
      },
      {
        old: "/* Relógio da etapa do Lead: a regra de auto-envio para \"livre\" deve contar 2 dias na\n",
        next: "/* Relógio da etapa do Lead: a regra de auto-envio para \"livre\" deve contar 3 dias na\n"
      },
      {
        old: "/* Etapa Livre: após 2 dias sem movimentação, o Lead é enviado automaticamente para a\n",
        next: "/* Etapa Livre: após 3 dias sem movimentação, o Lead é enviado automaticamente para a\n"
      },
      {
        old: "  var staleMs=2*24*60*60*1000;",
        next: "  var staleMs=KB_STALE_TO_LIVRE_MS;"
      },
      {
        old: "    _pushHistorico(c,'⏱ Auto-movido para Etapa Livre (parado 2 dias) — Responsável anterior: '+prevRespNome+' · Data: '+dataStr+' · Horário: '+horaStr);",
        next: "    _pushHistorico(c,'⏱ Auto-movido para Etapa Livre (parado '+KB_STALE_TO_LIVRE_DAYS+' dias) — Responsável anterior: '+prevRespNome+' · Data: '+dataStr+' · Horário: '+horaStr);"
      }
    ]
  },
  {
    file: 'js/notificacoes.js',
    replacements: [
      {
        old: "      if(rule.trigger.tipo==='stale'){\n        var dias=parseInt(rule.trigger.params.dias,10)||7;\n        var last=c.updatedAt||c.createdAt;\n        if(last&&closedCols.indexOf(origCols[c.id])<0&&(now-new Date(last).getTime())>dias*86400000)fire=true;\n",
        next: "      if(rule.trigger.tipo==='stale'){\n        var dias=parseInt(rule.trigger.params.dias,10)||7;\n        /* A regra estrutural de Lead Livre não pode ser encurtada por uma\n           automação antiga salva no servidor (por exemplo, stale=2 + mover\n           para livre). Mantemos a regra configurada, mas aplicamos o mínimo\n           de 3 dias exclusivamente nesse destino. */\n        if(board==='leads'&&rule.action&&rule.action.tipo==='move'&&rule.action.params&&rule.action.params.col==='livre'){\n          var minDiasLivre=(typeof KB_STALE_TO_LIVRE_DAYS==='number')?KB_STALE_TO_LIVRE_DAYS:3;\n          dias=Math.max(dias,minDiasLivre);\n        }\n        var last=c.updatedAt||c.createdAt;\n        if(last&&closedCols.indexOf(origCols[c.id])<0&&(now-new Date(last).getTime())>dias*86400000)fire=true;\n"
      }
    ]
  },
  {
    file: 'js/relatorios.js',
    replacements: [
      {
        old: "function timeGoTab(tab,btn){\n  document.querySelectorAll('.time-tab').forEach(function(b){b.classList.remove('on');});\n  document.querySelectorAll('.time-pane').forEach(function(p){p.classList.remove('on');});\n  if(btn)btn.classList.add('on');\n  var p=document.getElementById('time-pane-'+tab);if(p)p.classList.add('on');\n  if(tab==='ativ')renderTimeAtividades();\n  if(tab==='metrics')renderTimeMetrics();\n  if(tab==='clientes')renderTimeTable();\n  if(tab==='feed'){renderTimeLigacoes();renderTimeFeed();}\n}\n",
        next: "function timeGoTab(tab,btn){\n  document.querySelectorAll('.time-tab').forEach(function(b){b.classList.remove('on');});\n  document.querySelectorAll('.time-pane').forEach(function(p){p.classList.remove('on');});\n  if(btn)btn.classList.add('on');\n  var p=document.getElementById('time-pane-'+tab);if(p)p.classList.add('on');\n  // A Equipe é a aba padrão e também precisa disparar sua carga, não só alternar CSS.\n  if(tab==='equipe')renderTimePage();\n  if(tab==='ativ')renderTimeAtividades();\n  if(tab==='metrics')renderTimeMetrics();\n  if(tab==='clientes')renderTimeTable();\n  if(tab==='feed'){renderTimeLigacoes();renderTimeFeed();}\n}\n\n// Usa a mesma autorização que liberou a página Time na navegação.\n// Antes, Time podia estar visível por escopo de departamento, mas seus renderizadores\n// abortavam por exigir apenas hasSupervisorAccess(), deixando a primeira aba vazia.\nfunction _timePageAllowed(){\n  try{if(typeof _lfTimeTabAllowed==='function')return _lfTimeTabAllowed();}catch(_e){}\n  return hasSupervisorAccess();\n}\n"
      },
      {
        old: "  if(!hasSupervisorAccess()){el.innerHTML='';return;}",
        next: "  if(!_timePageAllowed()){el.innerHTML='';return;}"
      },
      {
        old: "function renderTimePage(){\n  if(!hasSupervisorAccess())return;",
        next: "function renderTimePage(){\n  if(!_timePageAllowed())return;"
      },
      {
        old: "    if(pg&&pg.classList.contains('on')&&hasSupervisorAccess())renderTimePage();",
        next: "    if(pg&&pg.classList.contains('on')&&_timePageAllowed())renderTimePage();"
      }
    ]
  },
  {
    file: 'js/app.js',
    replacements: [
      {
        old: "  if(p==='time')_lfSafeCall(function(){renderTimePage();},'renderTimePage');",
        next: "  if(p==='time')_lfSafeCall(function(){\n    // Sempre abre Time na sub-aba Equipe e inicia sua carga de dados.\n    // Não depende de o usuário clicar em outra sub-aba primeiro.\n    var equipeBtn=document.querySelector('.time-tab');\n    if(typeof timeGoTab==='function')timeGoTab('equipe',equipeBtn);\n    else if(typeof renderTimePage==='function')renderTimePage();\n  },'renderTimePage');"
      }
    ]
  }
];

for (const edit of edits) {
  const file = path.join(root, edit.file);
  let text = fs.readFileSync(file, 'utf8');
  const original = text;
  for (const replacement of edit.replacements) {
    if (!text.includes(replacement.old)) {
      throw new Error(`Trecho esperado não encontrado em ${edit.file}. Nenhuma alteração adicional foi aplicada.`);
    }
    text = text.replace(replacement.old, replacement.next);
  }
  fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`Corrigido: ${edit.file} (backup: ${edit.file}.bak)`);
}
console.log('Correção aplicada com sucesso.');
