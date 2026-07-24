// Centraliza variáveis de ambiente compartilhadas entre os módulos do teste k6.
// [FIX] Antes: BASE_URL estava duplicado em auth.js e agenda.test.js. Agora vem
// de um único lugar — evita divergência quando alguém troca só um dos arquivos.
export const BASE_URL = __ENV.BASE_URL || 'https://staging.crm.example.com';
export const RESOURCE_ID = __ENV.RESOURCE_ID || 'vendor_hot_001';
export const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';
export const LEVEL = __ENV.LEVEL || 'N1';
