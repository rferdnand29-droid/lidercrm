import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('entrypoints HTML', () => {
  it('mantém app.html byte-a-byte igual à fonte oficial index.html', () => {
    expect(read('app.html')).toBe(read('index.html'));
  });

  it('não mantém a variante lite no fluxo do bundle', () => {
    expect(existsSync(join(ROOT, 'app-lite.html'))).toBe(false);
    expect(read('scripts/build-capacitor-www.mjs')).not.toContain('app-lite.html');
    expect(read('_headers')).not.toContain('/app-lite.html');
  });

  it('mantém os mirrors HTML gerados alinhados quando presentes', () => {
    for (const mirror of [
      'www/index.html',
      'www/app.html',
      'android/app/src/main/assets/public/index.html',
      'android/app/src/main/assets/public/app.html',
      'ios/App/App/public/index.html',
      'ios/App/App/public/app.html',
    ]) {
      if (existsSync(join(ROOT, mirror))) {
        expect(read(mirror)).toBe(read('index.html'));
      }
    }
  });
});