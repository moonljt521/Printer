const test = require('node:test');
const assert = require('node:assert');
const { parseLpstat, printerStatusLabel } = require('../dist/main/core/lpstats');

test('parses printers and default destination', () => {
  const output = [
    'printer HP_LaserJet is idle.  enabled since Mon 12 Oct 09:00:00 2026',
    'printer Canon_G3000 disabled since Tue 13 Oct 10:00:00 2026 -',
    'system default destination: HP_LaserJet',
  ].join('\n');
  const parsed = parseLpstat(output);
  assert.strictEqual(parsed.printers.length, 2);
  assert.strictEqual(parsed.printers[0].name, 'HP_LaserJet');
  assert.strictEqual(parsed.printers[1].name, 'Canon_G3000');
  assert.strictEqual(parsed.defaultPrinter, 'HP_LaserJet');
});

test('handles missing default destination', () => {
  const parsed = parseLpstat('printer Only is idle.');
  assert.strictEqual(parsed.defaultPrinter, undefined);
  assert.strictEqual(parsed.printers.length, 1);
});

test('status labels cover idle/printing/disabled', () => {
  assert.strictEqual(printerStatusLabel('idle.  enabled since x').label, '空闲');
  assert.strictEqual(printerStatusLabel('now printing x').label, '打印中');
  assert.strictEqual(printerStatusLabel('disabled since x').offline, true);
});
