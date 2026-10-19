const test = require('node:test');
const assert = require('node:assert');
const { buildLpArgs, parseLpJobId } = require('../dist/main/core/lpcmd');

const base = { printer: 'HP_LaserJet', copies: 1, paper: 'default', duplex: 'default', color: 'default' };

test('minimal options produce lp args with printer and one copy', () => {
  const args = buildLpArgs('/tmp/a.pdf', base);
  assert.deepStrictEqual(args, ['-d', 'HP_LaserJet', '-n', '1', '-o', 'job-sheets=none', '/tmp/a.pdf']);
});

test('full options map to ipp media/sides/color attributes', () => {
  const args = buildLpArgs('/tmp/报告 2026.pdf', {
    printer: 'P1',
    copies: 3,
    paper: 'A4',
    duplex: 'long',
    color: 'mono',
  });
  assert.ok(args.includes('media=iso_a4_210x297mm'));
  assert.ok(args.includes('sides=two-sided-long-edge'));
  assert.ok(args.includes('print-color-mode=monochrome'));
  assert.deepStrictEqual(args.slice(-1), ['/tmp/报告 2026.pdf']);
  assert.deepStrictEqual(args.slice(args.indexOf('-n'), args.indexOf('-n') + 2), ['-n', '3']);
});

test('copies below 1 are clamped', () => {
  const args = buildLpArgs('/tmp/a.pdf', { ...base, copies: 0 });
  assert.strictEqual(args[args.indexOf('-n') + 1], '1');
});

test('parses job id from lp output', () => {
  assert.strictEqual(parseLpJobId('request id is HP_LaserJet-42 (1 file(s))'), 'HP_LaserJet-42');
  assert.strictEqual(parseLpJobId('nonsense'), undefined);
});

test('parses job id from localized lp output', () => {
  assert.strictEqual(
    parseLpJobId('请求id是HP_Color_LaserJet_MFP_M181fw__C15F5B_-6（1个文件）'),
    'HP_Color_LaserJet_MFP_M181fw__C15F5B_-6',
  );
  assert.strictEqual(parseLpJobId('Job erstellt'), undefined);
});
