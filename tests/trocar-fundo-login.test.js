// =====================================================================
// tests/trocar-fundo-login.test.js
// Ferramenta de autoatendimento (2026-10-07) — cobre a leitura de
// dimensões de JPEG e MP4 em JavaScript puro (sem Python/ffmpeg), a
// peça central da ferramenta que permite trocar o fundo da tela de
// login sem precisar pedir ajuste. As duas funções foram validadas
// manualmente contra ffprobe e Pillow antes deste teste (resultado
// idêntico), travando esse comportamento correto daqui pra frente.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readJpegDimensions, readMp4Dimensions, readManifest, updateManifest } from '../scripts/trocar-fundo-login.mjs';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

describe('readJpegDimensions', () => {
  it('lê corretamente as dimensões da foto de login desktop (1920x1080, valor conhecido)', () => {
    const buf = readFileSync(path.join(ROOT, 'assets', 'login', 'login-bg-desktop.jpg'));
    expect(readJpegDimensions(buf)).toEqual({ width: 1920, height: 1080 });
  });

  it('lê corretamente as dimensões da foto de login mobile (498x1080, valor conhecido)', () => {
    const buf = readFileSync(path.join(ROOT, 'assets', 'login', 'login-bg-mobile.jpg'));
    expect(readJpegDimensions(buf)).toEqual({ width: 498, height: 1080 });
  });

  it('retorna null (não lança exceção) pra um arquivo que não é JPEG válido', () => {
    const fake = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(readJpegDimensions(fake)).toBeNull();
  });

  it('retorna null pra um buffer vazio, sem lançar exceção', () => {
    expect(readJpegDimensions(Buffer.alloc(0))).toBeNull();
  });
});

describe('readMp4Dimensions', () => {
  it('lê corretamente as dimensões do vídeo mp4 existente no projeto (valor confirmado contra ffprobe)', () => {
    const buf = readFileSync(path.join(ROOT, 'assets', 'videos', 'lf-auth-bg-desktop.mp4'));
    // Confirmado manualmente com ffprobe: 1280x544 — trava esse resultado.
    expect(readMp4Dimensions(buf)).toEqual({ width: 1280, height: 544 });
  });

  it('lê corretamente o segundo vídeo mp4 existente (retrato, valor confirmado contra ffprobe)', () => {
    const buf = readFileSync(path.join(ROOT, 'assets', 'videos', 'lf-auth-bg-mobile.mp4'));
    // Confirmado manualmente com ffprobe: 1080x1920 — trava esse resultado.
    expect(readMp4Dimensions(buf)).toEqual({ width: 1080, height: 1920 });
  });

  it('retorna null (não lança exceção) pra um arquivo que não é MP4 válido', () => {
    const fake = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(readMp4Dimensions(fake)).toBeNull();
  });

  it('retorna null pra um buffer vazio, sem lançar exceção', () => {
    expect(readMp4Dimensions(Buffer.alloc(0))).toBeNull();
  });
});

describe('readManifest / updateManifest — correção do 404 no console (2026-10-10)', () => {
  function tempManifestPath() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lf-manifest-test-'));
    return path.join(dir, 'manifest.json');
  }

  it('arquivo inexistente => retorna o padrão seguro (nenhum vídeo), sem lançar exceção', () => {
    const p = tempManifestPath();
    expect(readManifest(p)).toEqual({ hasVideoDesktop: false, hasVideoMobile: false });
  });

  it('updateManifest cria o arquivo do zero se ele ainda não existir', () => {
    const p = tempManifestPath();
    updateManifest('desktop', true, p);
    expect(existsSync(p)).toBe(true);
    expect(readManifest(p)).toEqual({ hasVideoDesktop: true, hasVideoMobile: false });
  });

  it('atualiza só o campo do device pedido, preservando o outro intacto', () => {
    const p = tempManifestPath();
    updateManifest('desktop', true, p);
    updateManifest('mobile', true, p);
    expect(readManifest(p)).toEqual({ hasVideoDesktop: true, hasVideoMobile: true });
  });

  it('REGRESSÃO EXPLÍCITA: marcar como false depois de true reverte corretamente (fluxo de remover vídeo)', () => {
    const p = tempManifestPath();
    updateManifest('mobile', true, p);
    expect(readManifest(p).hasVideoMobile).toBe(true);
    updateManifest('mobile', false, p);
    expect(readManifest(p).hasVideoMobile).toBe(false);
  });

  it('arquivo corrompido (JSON inválido) => readManifest não lança exceção, volta ao padrão seguro', () => {
    const p = tempManifestPath();
    writeFileSync(p, '{isso não é json válido');
    expect(readManifest(p)).toEqual({ hasVideoDesktop: false, hasVideoMobile: false });
  });

  it('o manifesto real do projeto existe e começa com nenhum vídeo (estado limpo entregue)', () => {
    const realManifestPath = path.join(ROOT, 'assets', 'login', 'manifest.json');
    expect(existsSync(realManifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(realManifestPath, 'utf8'));
    expect(manifest).toHaveProperty('hasVideoDesktop');
    expect(manifest).toHaveProperty('hasVideoMobile');
  });
});
