const test = require('node:test');
const assert = require('node:assert');
const {
  buildInstallCommands,
  buildUninstallCommands,
  buildQueryCommands,
  verbKeyFor,
  REG_BASE,
} = require('../dist/main/core/registry');

const EXE = 'C:\\Program Files\\BatchPrinter\\BatchPrinter.exe';
const CMD_LINE = `"${EXE}" "%1"`;

test('install commands register verb per extension under HKCU SystemFileAssociations', () => {
  const commands = buildInstallCommands(CMD_LINE, EXE, ['pdf', 'docx']);
  const joined = commands.map((c) => c.join(' ')).join('\n');

  assert.ok(joined.includes(`add ${REG_BASE}\\.pdf\\shell\\BatchPrinter`));
  assert.ok(joined.includes(`add ${REG_BASE}\\.docx\\shell\\BatchPrinter`));
  assert.ok(joined.includes('/v MultiSelectModel /d Player'), 'multi-select model should be Player');
  assert.ok(joined.includes('/d 批量打印'), 'menu label should be chinese');
  assert.ok(joined.includes(`\\command /ve /d ${CMD_LINE} /f`));
});

test('uninstall deletes the verb key for each extension', () => {
  const commands = buildUninstallCommands(['pdf', 'pptx']);
  assert.deepStrictEqual(commands, [
    ['delete', verbKeyFor('pdf'), '/f'],
    ['delete', verbKeyFor('pptx'), '/f'],
  ]);
});

test('query commands can detect installation', () => {
  const commands = buildQueryCommands(['pdf']);
  assert.deepStrictEqual(commands, [['query', verbKeyFor('pdf')]]);
  assert.ok(verbKeyFor('pdf').startsWith('HKCU\\'));
});
