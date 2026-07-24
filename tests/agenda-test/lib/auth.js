import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './env.js';

// [FIX] BASE_URL agora vem de lib/env.js — evita divergência entre módulos.
export function login(username, password) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth_login' } }
  );

  const ok = check(res, {
    'login 200': (r) => r.status === 200,
    'login retornou token': (r) => {
      try { return !!r.json('token'); } catch (e) { return false; }
    },
  });

  if (!ok) throw new Error(`Falha no login de ${username}: HTTP ${res.status}`);

  return {
    token: res.json('token'),
    userId: res.json('user_id'),
  };
}
