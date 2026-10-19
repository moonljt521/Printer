const test = require('node:test');
const assert = require('node:assert');
const { buildSumatraArgs } = require('../dist/main/core/sumatracmd');

const base = { printer: 'HP', copies: 1, paper: 'default', duplex: 'default', color: 'default' };

test('minimal options produce silent print args', () => {
  const args = buildSumatraArgs('C:\\tmp\\a.pdf', base);
  assert.deepStrictEqual(args, ['-print-to', 'HP', '-silent', '-exit-when-done', 'C:\\tmp\\a.pdf']);
});

test('full options join into print-settings', () => {
  const args = buildSumatraArgs('C:\\tmp\\a.pdf', {
    printer: 'HP',
    copies: 2,
    paper: 'A4',
    duplex: 'short',
    color: 'mono',
  });
  const idx = args.indexOf('-print-settings');
  assert.ok(idx >= 0);
  assert.strictEqual(args[idx + 1], '2x,paper=A4,duplexshort,monochrome');
});

test('simplex and color settings', () => {
  const args = buildSumatraArgs('a.pdf', { ...base, duplex: 'simplex', color: 'color' });
  const idx = args.indexOf('-print-settings');
  assert.strictEqual(args[idx + 1], 'simplex,color');
});
