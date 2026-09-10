// =====================================================================
// lib/fcm-client.js
// Cliente mínimo para Firebase Cloud Messaging — HTTP v1 API.
// -----------------------------------------------------------------------
// FASE 2 (2026-08-05) — a Fase 1 (device-push-controller.js) só
// registrava o token do device. Este arquivo é quem de fato SABE FALAR
// com o Firebase pra mandar a notificação.
//
// Por que não dá pra usar uma "Server Key" simples: o Google aposentou
// a FCM Legacy API em 2024 — hoje só funciona com a HTTP v1 API, que
// exige uma Conta de Serviço (Service Account) + um token OAuth2 de
// curta duração, obtido assinando um JWT com a chave privada da conta
// de serviço (fluxo "JWT Bearer" do Google OAuth2). Sem biblioteca
// externa: Cloudflare Workers já tem Web Crypto (SubtleCrypto) nativo,
// suficiente pra assinar RS256.
//
// cfg.FCM_SERVICE_ACCOUNT_JSON — string JSON com o conteúdo INTEIRO do
// arquivo baixado em Firebase Console → Configurações do projeto →
// Contas de serviço → Gerar nova chave privada. Configurado via
// `wrangler secret put FCM_SERVICE_ACCOUNT_JSON` (nunca em [vars] no
// wrangler.toml — é credencial sensível, tem que ser secret).
// =====================================================================

// Cache do access token em memória do isolate do Worker — evita assinar
// um JWT novo e bater no Google a cada notificação enviada. Um Worker
// isolate processa várias requisições ao longo de sua vida; o token
// OAuth2 do Google dura 1h, então cachear por ~50min é seguro e barato.
let _fcmTokenCache = { accessToken: null, projectId: null, expiresAt: 0 };

function _base64url(input) {
  let base64;
  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    base64 = btoa(bin);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _parseServiceAccount(rawJson) {
  let sa;
  try {
    sa = JSON.parse(rawJson);
  } catch (_e) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON não é um JSON válido.', { cause: _e });
  }
  if (!sa || !sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON está incompleto (esperado client_email, private_key, project_id).');
  }
  return sa;
}

async function _importPrivateKey(pem) {
  const pemBody = String(pem)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\r?\n/g, '')
    .trim();
  const binaryDer = atob(pemBody);
  const bytes = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) bytes[i] = binaryDer.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function _buildSignedJwt(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = _base64url(JSON.stringify(header)) + '.' + _base64url(JSON.stringify(claims));
  const key = await _importPrivateKey(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + '.' + _base64url(sigBuf);
}

/**
 * getFcmAccessToken(cfg)
 * Retorna { accessToken, projectId }. Usa cache de isolate quando ainda
 * válido (expiresAt tem 5 min de folga antes do vencimento real).
 * Lança erro se FCM_SERVICE_ACCOUNT_JSON não estiver configurado —
 * quem chama decide se isso é fatal ou apenas "notificação pulada".
 */
export async function getFcmAccessToken(cfg) {
  const raw = cfg && cfg.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const e = new Error('FCM não configurado (FCM_SERVICE_ACCOUNT_JSON ausente).');
    e.code = 'FCM_NOT_CONFIGURED';
    throw e;
  }
  const now = Date.now();
  if (_fcmTokenCache.accessToken && _fcmTokenCache.expiresAt > now) {
    return { accessToken: _fcmTokenCache.accessToken, projectId: _fcmTokenCache.projectId };
  }
  const sa = _parseServiceAccount(raw);
  const jwt = await _buildSignedJwt(sa);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Troca de token OAuth2 do Google falhou (' + res.status + '): ' + txt.slice(0, 300));
  }
  const json = await res.json();
  _fcmTokenCache = {
    accessToken: json.access_token,
    projectId: sa.project_id,
    expiresAt: now + (Math.max(60, (json.expires_in || 3600) - 300) * 1000), // 5 min de folga
  };
  return { accessToken: _fcmTokenCache.accessToken, projectId: _fcmTokenCache.projectId };
}

/**
 * sendFcmToDevice(cfg, deviceToken, notification, data)
 * Manda UMA mensagem pra UM token de device via FCM HTTP v1.
 * Retorna { ok, status, unregistered, body }. NUNCA lança por falha de
 * envio individual (token expirado/errado é esperado com o tempo) —
 * só lança se o próprio FCM_SERVICE_ACCOUNT_JSON estiver ausente/quebrado,
 * o que é erro de configuração, não de device.
 */
export async function sendFcmToDevice(cfg, deviceToken, notification, data) {
  const { accessToken, projectId } = await getFcmAccessToken(cfg);
  const body = {
    message: {
      token: deviceToken,
      notification: {
        title: (notification && notification.title) || 'Lider CRM',
        body: (notification && notification.body) || '',
      },
      data: Object.keys(data || {}).reduce((acc, k) => {
        // FCM `data` exige todos os valores como string
        acc[k] = String(data[k]);
        return acc;
      }, {}),
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
    },
  };
  let res, json;
  try {
    res = await fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    json = await res.json().catch(() => null);
  } catch (netErr) {
    return { ok: false, status: 0, unregistered: false, body: { error: String(netErr && netErr.message || netErr) } };
  }
  // FCM sinaliza token morto/desinstalado com status 404 (NOT_FOUND) ou
  // 400 com error.status === 'UNREGISTERED'/'INVALID_ARGUMENT' em alguns
  // casos — tratamos os dois primeiros como "pode desativar este device".
  const errStatus = json && json.error && json.error.status;
  const unregistered = res.status === 404 || errStatus === 'UNREGISTERED' || errStatus === 'NOT_FOUND';
  return { ok: res.ok, status: res.status, unregistered, body: json };
}
