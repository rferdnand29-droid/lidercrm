#!/usr/bin/env node
/* =====================================================================
 * scripts/trocar-fundo-login.mjs
 * -----------------------------------------------------------------------
 * Ferramenta de autoatendimento (pedido explícito, 2026-10-07) — troca
 * a foto ou o vídeo de fundo da tela de login sozinho, sem precisar
 * pedir ajuste. Valida o tamanho do arquivo antes de trocar (avisa,
 * não bloqueia, se a proporção não for a ideal), copia pro lugar
 * certo com o nome certo, e sincroniza automaticamente o app nativo
 * (Capacitor/Android/iOS) — sem precisar rodar nenhum outro comando.
 *
 * Escrito em JavaScript puro (sem Python, sem ffmpeg/ffprobe) — só
 * precisa do Node.js que o projeto já exige pra tudo mais.
 *
 * USO:
 *   node scripts/trocar-fundo-login.mjs <arquivo-novo> <desktop|mobile>
 *
 * Exemplos:
 *   node scripts/trocar-fundo-login.mjs ~/Downloads/foto-nova.jpg desktop
 *   node scripts/trocar-fundo-login.mjs ~/Downloads/video-novo.mp4 mobile
 *
 * O tipo (foto ou vídeo) é detectado sozinho pela extensão do arquivo
 * (.jpg/.jpeg = foto, .mp4 = vídeo).
 * ===================================================================== */
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const DEST_DIR = path.join(ROOT, 'assets', 'login');
const MANIFEST_PATH = path.join(DEST_DIR, 'manifest.json');

const EXPECTED = {
  desktop: { w: 1920, h: 1080, label: '1920×1080 (paisagem, 16:9)' },
  mobile: { w: 498, h: 1080, label: '498×1080 (retrato)' },
};

// ---------------------------------------------------------------------
// [FIX 20261010] Manifesto leve que SEMPRE existe — js/lf-login-video.js
// checa ele antes de tentar buscar o .mp4 de verdade, evitando um 404
// visível no console sempre que nenhum vídeo tiver sido adicionado
// ainda (o caso mais comum). Mantido em sincronia automaticamente por
// esta ferramenta — você nunca precisa editar este arquivo na mão.
// ---------------------------------------------------------------------
export function readManifest(manifestPath) {
  manifestPath = manifestPath || MANIFEST_PATH;
  try { return JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch (_e) { return { hasVideoDesktop: false, hasVideoMobile: false }; }
}
export function updateManifest(device, hasVideo, manifestPath) {
  manifestPath = manifestPath || MANIFEST_PATH;
  const manifest = readManifest(manifestPath);
  const key = device === 'mobile' ? 'hasVideoMobile' : 'hasVideoDesktop';
  manifest[key] = hasVideo;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function fail(msg) {
  console.error('\n❌ ' + msg + '\n');
  process.exit(1);
}

function warn(msg) {
  console.warn('⚠️  ' + msg);
}

function ok(msg) {
  console.log('✅ ' + msg);
}

// ---------------------------------------------------------------------
// Leitura de dimensões de JPEG — direto dos bytes do arquivo, sem
// nenhuma biblioteca externa. Procura o marcador SOF (Start Of Frame)
// no cabeçalho, que guarda altura/largura em binário.
// ---------------------------------------------------------------------
export function readJpegDimensions(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null; // não é JPEG válido
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) { offset++; continue; }
    const marker = buf[offset + 1];
    // Marcadores SOF0–SOF15, exceto DHT(C4)/JPG(C8)/DAC(CC) — todos
    // guardam dimensões no mesmo formato.
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}

// ---------------------------------------------------------------------
// Leitura de dimensões de MP4 — percorre a estrutura de "caixas" do
// formato (moov > trak > mdia > minf > stbl > stsd), sem biblioteca
// externa. Formato bem documentado publicamente (ISO/IEC 14496-12).
// ---------------------------------------------------------------------
export function readMp4Dimensions(buf) {
  function findBox(start, end, fourcc) {
    let offset = start;
    while (offset < end - 8) {
      const size = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      if (type === fourcc) return { start: offset, end: offset + size, bodyStart: offset + 8 };
      if (size <= 0) break;
      offset += size;
    }
    return null;
  }
  try {
    const moov = findBox(0, buf.length, 'moov');
    if (!moov) return null;
    const trak = findBox(moov.bodyStart, moov.end, 'trak');
    if (!trak) return null;
    const mdia = findBox(trak.bodyStart, trak.end, 'mdia');
    if (!mdia) return null;
    const minf = findBox(mdia.bodyStart, mdia.end, 'minf');
    if (!minf) return null;
    const stbl = findBox(minf.bodyStart, minf.end, 'stbl');
    if (!stbl) return null;
    const stsd = findBox(stbl.bodyStart, stbl.end, 'stsd');
    if (!stsd) return null;
    // Dentro de stsd, o primeiro sample description (após 8 bytes de
    // cabeçalho próprio) tem width/height nos bytes 32-36 do corpo.
    const sampleStart = stsd.bodyStart + 8;
    const width = buf.readUInt16BE(sampleStart + 32);
    const height = buf.readUInt16BE(sampleStart + 34);
    if (width > 0 && height > 0) return { width, height };
    return null;
  } catch (_e) {
    return null; // estrutura não reconhecida — segue sem checar, não bloqueia
  }
}

function checkDimensions(filePath, expected) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = readFileSync(filePath);
  let dims = null;
  if (ext === '.jpg' || ext === '.jpeg') dims = readJpegDimensions(buf);
  else if (ext === '.mp4') dims = readMp4Dimensions(buf);

  if (!dims) {
    warn('Não consegui ler as dimensões do arquivo — vou continuar mesmo assim (isso não impede a troca).');
    return;
  }
  const expectedRatio = expected.w / expected.h;
  const actualRatio = dims.width / dims.height;
  const diff = Math.abs(expectedRatio - actualRatio) / expectedRatio;
  console.log('   Dimensões do arquivo novo: ' + dims.width + '×' + dims.height);
  if (diff > 0.03) {
    warn('A proporção do arquivo é diferente do recomendado (' + expected.label + ').');
    warn('Não é um erro — a tela ainda vai funcionar — mas o vapor animado (se ainda ativo) pode ficar um pouco fora de posição, e a foto pode aparecer levemente cortada ou com barras.');
  } else {
    ok('Proporção compatível com o recomendado.');
  }
}

// ---------------------------------------------------------------------
function run() {
  const [, , inputPathRaw, device] = process.argv;

  if (!inputPathRaw || !device) {
    console.log('\nUso: node scripts/trocar-fundo-login.mjs <arquivo> <desktop|mobile>');
    console.log('Ou:  node scripts/trocar-fundo-login.mjs remove-video <desktop|mobile>\n');
    console.log('Exemplos:');
    console.log('  node scripts/trocar-fundo-login.mjs ~/Downloads/foto-nova.jpg desktop');
    console.log('  node scripts/trocar-fundo-login.mjs ~/Downloads/video-novo.mp4 mobile');
    console.log('  node scripts/trocar-fundo-login.mjs remove-video mobile\n');
    process.exit(1);
  }

  if (device !== 'desktop' && device !== 'mobile') {
    fail('O segundo argumento precisa ser exatamente "desktop" ou "mobile" (você usou "' + device + '").');
  }

  // Modo remoção — apaga o vídeo (se existir) e atualiza o manifesto,
  // voltando a mostrar só a foto. Não mexe em nada além do vídeo desse
  // formato específico.
  if (inputPathRaw === 'remove-video') {
    const videoPath = path.join(DEST_DIR, 'login-video-' + device + '.mp4');
    if (existsSync(videoPath)) {
      unlinkSync(videoPath);
      ok('Vídeo removido: assets/login/login-video-' + device + '.mp4');
    } else {
      console.log('Nenhum vídeo ' + device + ' encontrado — nada a remover (já estava usando só a foto).');
    }
    updateManifest(device, false);
    ok('Manifesto atualizado — a tela volta a usar só a foto.');
    syncCapacitor();
    console.log('\n=== Pronto ===\n');
    return;
  }

  const inputPath = path.resolve(inputPathRaw);
  if (!existsSync(inputPath)) {
    fail('Arquivo não encontrado: ' + inputPath);
  }

  const ext = path.extname(inputPath).toLowerCase();
  const isPhoto = ext === '.jpg' || ext === '.jpeg';
  const isVideo = ext === '.mp4';

  if (!isPhoto && !isVideo) {
    fail('Formato não reconhecido (' + ext + '). Use .jpg/.jpeg para foto, ou .mp4 para vídeo.');
  }

  console.log('\n=== Trocando o fundo de login (' + device + ') ===\n');
  console.log('Arquivo novo: ' + inputPath);
  console.log('Tipo detectado: ' + (isPhoto ? 'FOTO' : 'VÍDEO'));

  checkDimensions(inputPath, EXPECTED[device]);

  const destName = isPhoto ? ('login-bg-' + device + '.jpg') : ('login-video-' + device + '.mp4');
  const destPath = path.join(DEST_DIR, destName);
  copyFileSync(inputPath, destPath);
  ok('Copiado para assets/login/' + destName);

  if (isVideo) {
    updateManifest(device, true);
    ok('Manifesto atualizado — a tela vai usar o vídeo novo.');
  }

  syncCapacitor();

  console.log('\n=== Pronto ===');
  console.log('Site (PC e celular no navegador): já está usando o arquivo novo — só publicar.');
  console.log('App instalado (Capacitor): precisa gerar um novo build (APK/IPA) e reinstalar pra pegar a mudança.\n');
}

function syncCapacitor() {
  console.log('\n--- Sincronizando o app nativo (Capacitor) ---');
  try {
    execSync('npm run cap:www', { cwd: ROOT, stdio: 'inherit' });
    execSync('npx cap sync', { cwd: ROOT, stdio: 'inherit' });
    ok('Sincronizado com Android e iOS.');
  } catch (_e) {
    warn('Não consegui rodar a sincronização automática (talvez as pastas android/ios não estejam presentes neste momento, ou faltem dependências instaladas — rode "npm install" primeiro se for o caso).');
    warn('O arquivo já foi trocado normalmente — a sincronização é só necessária pro app instalado (celular), não pro site.');
  }
}

var isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) run();
