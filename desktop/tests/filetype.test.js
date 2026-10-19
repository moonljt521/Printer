const test = require('node:test');
const assert = require('node:assert');
const { classify, MENU_EXTENSIONS } = require('../dist/main/core/filetype');
const { buildSofficeArgs, convertedPdfName } = require('../dist/main/core/soffice');

test('classifies pdf, office and unsupported files', () => {
  assert.strictEqual(classify('/tmp/a.pdf'), 'pdf');
  assert.strictEqual(classify('/tmp/报表.DOCX'), 'office');
  assert.strictEqual(classify('/tmp/表格.xlsx'), 'office');
  assert.strictEqual(classify('/tmp/演示.ppt'), 'office');
  assert.strictEqual(classify('/tmp/说明.txt'), 'unsupported');
  assert.strictEqual(classify('/tmp/noext'), 'unsupported');
});

test('menu extensions cover pdf and main office formats', () => {
  assert.deepStrictEqual(MENU_EXTENSIONS, ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
});

test('soffice args are headless with isolated profile and outdir', () => {
  const args = buildSofficeArgs(['/tmp/报 告.docx'], '/tmp/out', '/tmp/profile');
  assert.ok(args.includes('--headless'));
  assert.ok(args.includes('-env:UserInstallation=file:///tmp/profile'));
  assert.deepStrictEqual(args.slice(args.indexOf('--convert-to'), args.indexOf('--convert-to') + 2), [
    '--convert-to',
    'pdf',
  ]);
  assert.strictEqual(args[args.indexOf('--outdir') + 1], '/tmp/out');
  assert.strictEqual(args[args.length - 1], '/tmp/报 告.docx');
});

test('converted pdf name swaps extension and keeps unicode', () => {
  assert.strictEqual(convertedPdfName('/tmp/报 告.docx'), '报 告.pdf');
  assert.strictEqual(convertedPdfName('C:\\docs\\plan.v2.xlsx'), 'plan.v2.pdf');
  assert.strictEqual(convertedPdfName('/tmp/noext'), 'noext.pdf');
});
