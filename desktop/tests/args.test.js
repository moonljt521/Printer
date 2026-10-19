const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { parseAppArgs } = require('../dist/main/core/args');

const existing = new Set(['/tmp/a.pdf', '/tmp/b.docx', '/tmp/说明 文档.docx']);

function ctx(cwd = '/work') {
  return {
    cwd,
    execPath: '/usr/bin/electron',
    isFile: (p) => existing.has(p),
  };
}

test('extracts existing file args and ignores flags/dirs/execPath', () => {
  const parsed = parseAppArgs(
    ['/usr/bin/electron', '.', '--dry-run', '/tmp/a.pdf', '/tmp', '/usr/bin/electron', '/tmp/b.docx'],
    ctx(),
  );
  assert.deepStrictEqual(parsed.files, ['/tmp/a.pdf', '/tmp/b.docx']);
  assert.strictEqual(parsed.dryRun, true);
});

test('resolves relative paths against cwd', () => {
  const parsed = parseAppArgs(['a.pdf'], { ...ctx('/tmp'), isFile: (p) => p === '/tmp/a.pdf' });
  assert.deepStrictEqual(parsed.files, [path.normalize('/tmp/a.pdf')]);
});

test('keeps chinese and spaced paths intact', () => {
  const parsed = parseAppArgs(['/tmp/说明 文档.docx'], ctx());
  assert.deepStrictEqual(parsed.files, ['/tmp/说明 文档.docx']);
});

test('parses smoke and capture-args flags with values', () => {
  const parsed = parseAppArgs(['--smoke', '/tmp/out', '--capture-args', '/tmp/cap.json'], ctx());
  assert.strictEqual(parsed.smokeDir, '/tmp/out');
  assert.strictEqual(parsed.captureArgs, '/tmp/cap.json');
});

test('smoke flag without value falls back to default', () => {
  const parsed = parseAppArgs(['--smoke'], ctx());
  assert.strictEqual(parsed.smokeDir, '.smoke');
});
