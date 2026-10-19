const test = require('node:test');
const assert = require('node:assert');
const {
  parseIpptoolOutput,
  parseNumericJobId,
  buildIpptoolArgs,
} = require('../dist/main/core/jobprogress');

test('parses integer enum and impression attributes from ipptool -v output', () => {
  const output = [
    '"ipp://localhost:631/printers/HP_Color_LaserJet":',
    '\tGet-Job-Attributes:',
    '\t\tattributes-charset (charset) = utf-8',
    '\t\tjob-id (integer) = 42',
    '\t\tjob-state (enum) = 5',
    '\t\tjob-impressions (integer) = 12',
    '\t\tjob-impressions-completed (integer) = 3',
  ].join('\n');
  const info = parseIpptoolOutput(output);
  assert.strictEqual(info.stateCode, 5);
  assert.strictEqual(info.impressions, 12);
  assert.strictEqual(info.impressionsCompleted, 3);
});

test('parses textual enum names', () => {
  const output = '\t\tjob-state (enum) = completed\n\t\tjob-impressions-completed (integer) = 12\n';
  const info = parseIpptoolOutput(output);
  assert.strictEqual(info.stateCode, 9);
  assert.strictEqual(info.impressionsCompleted, 12);
});

test('tolerates missing or invalid attributes', () => {
  assert.deepStrictEqual(parseIpptoolOutput(''), {});
  assert.deepStrictEqual(parseIpptoolOutput('PASS\n'), {});
  const weird = '\t\tjob-impressions (integer) = unknown\n\t\tjob-state (enum) = bogus\n';
  const info = parseIpptoolOutput(weird);
  assert.strictEqual(info.impressions, undefined);
  assert.strictEqual(info.stateCode, undefined);
});

test('extracts numeric job id from cups request id', () => {
  assert.strictEqual(parseNumericJobId('HP_Color_LaserJet_MFP_M181fw__C15F5B_-42'), 42);
  assert.strictEqual(parseNumericJobId('Printer-7'), 7);
  assert.strictEqual(parseNumericJobId('no-number'), undefined);
});

test('builds ipptool args with escaped queue name', () => {
  const args = buildIpptoolArgs('HP Color/MFP', 42, '/tmp/script.ipp');
  assert.deepStrictEqual(args, [
    '-t',
    '-v',
    '-d',
    'jobid=42',
    'ipp://localhost:631/printers/HP%20Color%2FMFP',
    '/tmp/script.ipp',
  ]);
});
