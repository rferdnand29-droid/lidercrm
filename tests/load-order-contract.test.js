import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkContract, parseEntrypoint } from '../scripts/check-load-order.mjs';

const ROOT = process.cwd();
const contract = JSON.parse(readFileSync(join(ROOT, 'scripts/load-order-contract.json'), 'utf8'));
const html = readFileSync(join(ROOT, contract.entrypoint), 'utf8');

describe('contrato de ordem dos scripts', () => {
  it('mantém todos os scripts locais dentro da ordem efetiva documentada', () => {
    const result = checkContract({ html, contract, root: ROOT });
    expect(result.errors).toEqual([]);
  });

  it('ignora scripts comentados e scripts remotos no inventário local', () => {
    const records = parseEntrypoint(
      '<!-- <script src="https://example.com/ignored.js"></script> -->' +
      '<!-- LF-LOAD-GROUP: bootstrap -->' +
      '<script src="js/lf-config.js?v=test"></script>',
    );
    expect(records.map(({ src }) => src)).toEqual(['js/lf-config.js']);
  });
});