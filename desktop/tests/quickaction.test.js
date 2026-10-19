const test = require('node:test');
const assert = require('node:assert');
const { buildQuickAction } = require('../dist/main/core/quickaction');

const parts = buildQuickAction({
  workflowName: '批量打印',
  command: ['/Applications/BatchPrinter.app/Contents/MacOS/BatchPrinter'],
  runnerPath: '/Users/u/Library/Application Support/BatchPrinter/run-batchprinter.sh',
});

test('document.wflow accepts cocoa paths and passes input as arguments', () => {
  assert.ok(parts.documentWflow.includes('com.apple.RunShellScript'));
  assert.ok(parts.documentWflow.includes('com.apple.cocoa.path'));
  assert.ok(parts.documentWflow.includes('com.apple.Automator.fileSystemObject'));
  assert.ok(parts.documentWflow.includes('<key>inputMethod</key>'));
  assert.ok(parts.documentWflow.includes('<integer>1</integer>'));
  assert.ok(parts.documentWflow.includes('servicesMenu'));
});

test('document.wflow invokes the runner with "$@"', () => {
  assert.ok(parts.documentWflow.includes('run-batchprinter.sh'));
  assert.ok(parts.documentWflow.includes('"$@"'));
});

test('runner script execs the command with all args and escapes spaces', () => {
  assert.ok(parts.runnerScript.startsWith('#!/bin/sh'));
  assert.ok(parts.runnerScript.includes('exec "/Applications/BatchPrinter.app/Contents/MacOS/BatchPrinter" "$@"'));
});

test('info plist registers NSServices for Finder with pdf and office UTIs', () => {
  assert.ok(parts.infoPlist.includes('批量打印'));
  assert.ok(parts.infoPlist.includes('com.moon.batchprinter.quickaction'));
  assert.ok(parts.infoPlist.includes('runWorkflowAsService'));
  assert.ok(parts.infoPlist.includes('com.apple.finder'));
  assert.ok(parts.infoPlist.includes('com.adobe.pdf'));
  assert.ok(parts.infoPlist.includes('org.openxmlformats.wordprocessingml.document'));
});
