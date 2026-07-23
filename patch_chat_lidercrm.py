from pathlib import Path

p = Path('/home/user/work_lidercrm/lidercrm-MERGED/js/chat.js')
text = p.read_text(encoding='utf-8')

repls = []

repls.append((
"function _chatSaveMsgs(convId, list){ ss(CHAT_MSG_PREFIX+convId, list.slice(-500)); }\nfunction _chatMsgKey(convId){ return CHAT_MSG_PREFIX+convId; }\n",
"function _chatSaveMsgs(convId, list){ ss(CHAT_MSG_PREFIX+convId, list.slice(-500)); }\nfunction _chatMsgKey(convId){ return CHAT_MSG_PREFIX+convId; }\nfunction _chatTouchConv(convId, ts){\n  var convs = _chatGetConvs();\n  var conv = convs.find(function(c){ return c && c.id === convId; });\n  if(!conv) return null;\n  conv.updatedAt = ts || new Date().toISOString();\n  _chatLastMsgTs[convId] = conv.updatedAt;\n  _chatSaveConvs(convs);\n  return conv;\n}\n"
))

repls.append((
"  _chatSaveMsgs(_chatCurrentConv, msgs);\n  // Update conv timestamp\n  conv.updatedAt = msg.ts;\n  _chatLastMsgTs[conv.id] = msg.ts;\n  _chatSaveConvs(_chatGetConvs());\n",
"  _chatSaveMsgs(_chatCurrentConv, msgs);\n  // Update conv timestamp\n  _chatTouchConv(conv.id, msg.ts);\n"
))

repls.append((
"  // Sync to cloud (if available)\n  _chatSyncMsg(msg);\n  // Notificar destinatário\n  if(msg.toUid && msg.toUid !== (S&&S.userId)){\n    if(typeof pushNotif === 'function') pushNotif(msg.toUid, 'chat', '💬 '+(S&&S.nome||'?')+': '+text.slice(0,50), {convId: _chatCurrentConv});\n  }\n}\n",
"  // Sync to cloud / índice / notificação\n  _chatSyncMsg(msg);\n}\n"
))

repls.append((
"function _chatSendAttachment(name, data){\n",
"function _chatSendAttachment(name, data, meta){\n"
))

repls.append((
"        _chatSendAttachmentLocal(name, data, conv);\n      }else{\n        _chatSendAttachmentRemote(name, res.url, res.path, conv);\n      }\n    }).catch(function(){\n      _chatSendAttachmentLocal(name, data, conv);\n    });\n  }else{\n    _chatSendAttachmentLocal(name, data, conv);\n  }\n}\n\nfunction _chatSendAttachmentLocal(name, data, conv){\n",
"        _chatSendAttachmentLocal(name, data, conv, meta);\n      }else{\n        _chatSendAttachmentRemote(name, res.url, res.path, conv, meta);\n      }\n    }).catch(function(){\n      _chatSendAttachmentLocal(name, data, conv, meta);\n    });\n  }else{\n    _chatSendAttachmentLocal(name, data, conv, meta);\n  }\n}\n\nfunction _chatSendAttachmentLocal(name, data, conv, meta){\n"
))

repls.append((
"    attachmentName: name,\n    attachmentData: data,\n    attachmentUrl: null,\n    ts: new Date().toISOString(),\n    read: false\n  };\n",
"    attachmentName: name,\n    attachmentData: data,\n    attachmentUrl: null,\n    attachmentKind: meta && meta.kind || null,\n    attachmentDurationSec: meta && meta.durationSec || null,\n    attachmentMimeType: meta && meta.mimeType || null,\n    ts: new Date().toISOString(),\n    read: false\n  };\n"
))

repls.append((
"function _chatSendAttachmentRemote(name, url, filePath, conv){\n",
"function _chatSendAttachmentRemote(name, url, filePath, conv, meta){\n"
))

repls.append((
"    attachmentName: name,\n    attachmentData: null,\n    attachmentUrl: url,\n    attachmentPath: filePath,\n    ts: new Date().toISOString(),\n    read: false\n  };\n",
"    attachmentName: name,\n    attachmentData: null,\n    attachmentUrl: url,\n    attachmentPath: filePath,\n    attachmentKind: meta && meta.kind || null,\n    attachmentDurationSec: meta && meta.durationSec || null,\n    attachmentMimeType: meta && meta.mimeType || null,\n    ts: new Date().toISOString(),\n    read: false\n  };\n"
))

repls.append((
"function _chatPushMsg(msg, conv){\n  var msgs = _chatGetMsgs(_chatCurrentConv);\n  msgs.push(msg);\n  _chatSaveMsgs(_chatCurrentConv, msgs);\n  conv.updatedAt = msg.ts;\n  _chatSaveConvs(_chatGetConvs());\n  renderChatMsgs(_chatCurrentConv);\n  renderChatList();\n  _chatSyncMsg(msg);\n}\n",
"function _chatPushMsg(msg, conv){\n  var msgs = _chatGetMsgs(_chatCurrentConv);\n  msgs.push(msg);\n  _chatSaveMsgs(_chatCurrentConv, msgs);\n  _chatTouchConv(msg.convId || _chatCurrentConv, msg.ts);\n  renderChatMsgs(_chatCurrentConv);\n  renderChatList();\n  _chatSyncMsg(msg);\n  if(msg && msg.toUid && msg.toUid !== (S&&S.userId) && typeof pushNotif === 'function'){\n    var preview = msg.text || (msg.attachmentKind === 'audio' ? '🎤 Áudio' : (msg.attachmentName ? '📎 ' + msg.attachmentName : 'Nova mensagem'));\n    try{ pushNotif(msg.toUid, 'chat', '💬 ' + ((S&&S.nome)||'?') + ': ' + String(preview).slice(0,50), {convId: msg.convId || _chatCurrentConv}); }catch(_e){}\n  }\n}\n"
))

repls.append((
"function _chatSyncMsg(msg){\n  if(!S||!S.userId||!msg||!msg.convId)return;\n  try{\n    var root = window.LiderCRM;\n    var wc = root && root.api && root.api.workerClient;\n    var payload = {\n      id: msg.convId,\n      updatedAt: msg.ts || new Date().toISOString(),\n      msgs: _chatGetMsgs(msg.convId)\n    };\n    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.putConfig === 'function'){\n      var conv = _chatGetConvs().find(function(c){ return c && c.id === msg.convId; });\n      if(conv){\n        conv = _chatNormalizeConv(conv);\n        payload.isGroup = !!conv.isGroup;\n        payload.name = conv.name || '';\n        payload.participants = conv.participants || [];\n        payload.participantNames = conv.participantNames || {};\n      }\n      wc.putConfig('chat_conv_' + msg.convId, payload).catch(function(e){ console.warn('[chat] sync falhou', e); });\n    } else if(DB_MODE === 'firebase' && db){\n      db.collection('config').doc('chat_conv_' + msg.convId).set(payload).catch(function(e){ console.warn('[chat] firebase sync falhou', e); });\n    }\n  }catch(e){ console.warn('[chat] sync error', e); }\n}\n\nfunction _chatPollNewMsgs(){\n",
"function _chatInboxDocName(uid){ return 'chat_inbox_' + String(uid||''); }\nfunction _chatInboxPreview(msg){\n  if(!msg) return '';\n  if(msg.text) return msg.text;\n  if(msg.attachmentKind === 'audio') return '🎤 Áudio';\n  if(msg.attachmentName) return '📎 ' + msg.attachmentName;\n  return '';\n}\nfunction _chatUpsertInboxEntry(list, entry){\n  var arr = Array.isArray(list) ? list.slice() : [];\n  var idx = arr.findIndex(function(x){ return x && x.id === entry.id; });\n  if(idx >= 0) arr[idx] = Object.assign({}, arr[idx], entry);\n  else arr.push(entry);\n  arr.sort(function(a,b){ return String((b&&b.updatedAt)||'').localeCompare(String((a&&a.updatedAt)||'')); });\n  return arr.slice(0,200);\n}\nfunction _chatSyncConvIndex(conv, msg){\n  conv = _chatNormalizeConv(conv||{});\n  var participants = _chatNormalizeParticipants(conv.participants||[]);\n  if(!participants.length) return Promise.resolve();\n  var entry = {\n    id: conv.id,\n    isGroup: !!conv.isGroup,\n    name: conv.name || '',\n    participants: participants,\n    participantNames: conv.participantNames || {},\n    updatedAt: (msg && msg.ts) || conv.updatedAt || new Date().toISOString(),\n    preview: _chatInboxPreview(msg)\n  };\n  try{\n    var root = window.LiderCRM;\n    var wc = root && root.api && root.api.workerClient;\n    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function' && typeof wc.putConfig === 'function'){\n      return Promise.all(participants.map(function(uid){\n        return wc.getConfig(_chatInboxDocName(uid)).catch(function(){ return null; }).then(function(doc){\n          var payload = doc && typeof doc === 'object' ? doc : {};\n          payload.list = _chatUpsertInboxEntry(payload.list, entry);\n          payload.ts = Date.now();\n          return wc.putConfig(_chatInboxDocName(uid), payload).catch(function(){});\n        });\n      }));\n    }\n    if(DB_MODE === 'firebase' && db){\n      return Promise.all(participants.map(function(uid){\n        return db.collection('config').doc(_chatInboxDocName(uid)).get().then(function(snap){\n          var payload = snap && snap.exists ? (snap.data() || {}) : {};\n          payload.list = _chatUpsertInboxEntry(payload.list, entry);\n          payload.ts = Date.now();\n          return db.collection('config').doc(_chatInboxDocName(uid)).set(payload);\n        }).catch(function(){});\n      }));\n    }\n  }catch(_e){}\n  return Promise.resolve();\n}\nfunction _chatPullInboxConvs(){\n  if(!S || !S.userId) return Promise.resolve();\n  function applyInbox(doc){\n    var list = doc && Array.isArray(doc.list) ? doc.list : [];\n    if(!list.length) return;\n    var convs = _chatGetConvs();\n    var changed = false;\n    list.forEach(function(item){\n      if(!item || !item.id) return;\n      var idx = convs.findIndex(function(c){ return c && c.id === item.id; });\n      var merged = _chatNormalizeConv(Object.assign({}, (idx >= 0 ? convs[idx] : {}), item));\n      if(idx >= 0){\n        var prev = JSON.stringify(convs[idx]);\n        var next = JSON.stringify(merged);\n        if(prev !== next){ convs[idx] = merged; changed = true; }\n      }else{\n        convs.push(merged);\n        changed = true;\n      }\n      if(item.updatedAt) _chatLastMsgTs[item.id] = item.updatedAt;\n    });\n    if(changed) _chatSaveConvs(convs);\n  }\n  try{\n    var root = window.LiderCRM;\n    var wc = root && root.api && root.api.workerClient;\n    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function'){\n      return wc.getConfig(_chatInboxDocName(S.userId)).then(function(doc){ applyInbox(doc||{}); }).catch(function(){});\n    }\n    if(DB_MODE === 'firebase' && db){\n      return db.collection('config').doc(_chatInboxDocName(S.userId)).get().then(function(snap){\n        applyInbox(snap && snap.exists ? (snap.data() || {}) : {});\n      }).catch(function(){});\n    }\n  }catch(_e){}\n  return Promise.resolve();\n}\nfunction _chatSyncMsg(msg){\n  if(!S||!S.userId||!msg||!msg.convId)return;\n  try{\n    var root = window.LiderCRM;\n    var wc = root && root.api && root.api.workerClient;\n    var payload = {\n      id: msg.convId,\n      updatedAt: msg.ts || new Date().toISOString(),\n      msgs: _chatGetMsgs(msg.convId)\n    };\n    var conv = _chatGetConvs().find(function(c){ return c && c.id === msg.convId; });\n    if(conv){\n      conv = _chatNormalizeConv(conv);\n      payload.isGroup = !!conv.isGroup;\n      payload.name = conv.name || '';\n      payload.participants = conv.participants || [];\n      payload.participantNames = conv.participantNames || {};\n    }\n    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.putConfig === 'function'){\n      wc.putConfig('chat_conv_' + msg.convId, payload).catch(function(e){ console.warn('[chat] sync falhou', e); });\n      if(conv) _chatSyncConvIndex(conv, msg).catch(function(){});\n    } else if(DB_MODE === 'firebase' && db){\n      db.collection('config').doc('chat_conv_' + msg.convId).set(payload).catch(function(e){ console.warn('[chat] firebase sync falhou', e); });\n      if(conv) _chatSyncConvIndex(conv, msg).catch(function(){});\n    }\n  }catch(e){ console.warn('[chat] sync error', e); }\n}\n\nfunction _chatPollNewMsgs(){\n"
))

repls.append((
"    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function'){\n      var convs = _chatGetConvs();\n      Promise.all((convs||[]).map(function(c){\n",
"    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function'){\n      _chatPullInboxConvs().then(function(){\n        var convs = _chatGetConvs();\n        return Promise.all((convs||[]).map(function(c){\n"
))

repls.append((
"      })).finally(function(){ _chatPollInFlight=false; });\n      return;\n    }\n",
"        }));\n      }).finally(function(){ _chatPollInFlight=false; });\n      return;\n    }\n"
))

repls.append((
"  _chatPollTimer = setInterval(function(){\n    try{ _chatPollNewMsgs(); }catch(e){ console.warn('[chat] poll tick falhou',e); }\n  }, 5000);\n}\n",
"  _chatPollTimer = setInterval(function(){\n    try{ _chatPollNewMsgs(); }catch(e){ console.warn('[chat] poll tick falhou',e); }\n  }, 1200);\n}\n"
))

repls.append((
"    _chatMediaRecorder.onstop = function(){\n      var blob = new Blob(_chatAudioChunks, {type: mime});\n      var dur = ((Date.now()-_chatRecStart)/1000).toFixed(1);\n      stream.getTracks().forEach(function(t){ t.stop(); });\n      var reader = new FileReader();\n      reader.onload = function(ev){\n        var fname = 'audio-'+Date.now()+'.'+(mime.indexOf('webm')>=0?'webm':'mp4');\n        if(typeof _chatSendAttachment === 'function'){\n          // reaproveita fluxo de anexo\n          var conv = _chatGetConvs().find(function(c){ return c.id === _chatCurrentConv; });\n          if(conv){\n            var msg = {\n              id: 'msg_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),\n              convId: _chatCurrentConv,\n              fromUid: (S&&S.userId)||'',\n              fromName: (S&&S.nome)||'?',\n              text: '',\n              attachmentName: fname,\n              attachmentData: ev.target.result,\n              attachmentKind: 'audio',\n              attachmentDurationSec: parseFloat(dur),\n              ts: new Date().toISOString(),\n              read: false\n            };\n            var msgs = _chatGetMsgs(_chatCurrentConv);\n            msgs.push(msg);\n            _chatSaveMsgs(_chatCurrentConv, msgs);\n            renderChatMsgs(_chatCurrentConv);\n            if(typeof _chatSyncMsg === 'function') _chatSyncMsg(msg);\n          }\n        }\n      };\n      reader.readAsDataURL(blob);\n      var btn = document.getElementById('chat-audio-btn');\n      if(btn){ btn.textContent = '🎤'; btn.classList.remove('recording'); }\n      if(typeof toast === 'function') toast('🎤 Áudio enviado ('+dur+'s)');\n    };\n",
"    _chatMediaRecorder.onstop = function(){\n      var blob = new Blob(_chatAudioChunks, {type: mime});\n      var dur = ((Date.now()-_chatRecStart)/1000).toFixed(1);\n      stream.getTracks().forEach(function(t){ t.stop(); });\n      var reader = new FileReader();\n      reader.onload = function(ev){\n        var fname = 'audio-'+Date.now()+'.'+(mime.indexOf('webm')>=0?'webm':'mp4');\n        if(typeof _chatSendAttachment === 'function'){\n          _chatSendAttachment(fname, ev.target.result, {kind:'audio', durationSec: parseFloat(dur), mimeType: mime});\n        }\n      };\n      reader.readAsDataURL(blob);\n      var btn = document.getElementById('chat-audio-btn');\n      if(btn){ btn.textContent = '🎤'; btn.classList.remove('recording'); }\n      if(typeof toast === 'function') toast('🎤 Áudio enviado ('+dur+'s)');\n    };\n"
))

for old, new in repls:
    if old not in text:
        raise SystemExit(f'PATCH BLOCK NOT FOUND:\n{old[:240]}')
    text = text.replace(old, new, 1)

p.write_text(text, encoding='utf-8')
print('patched', p)
