const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { countPdfPages } = require('../dist/main/core/pdfinfo');

async function makePdf(dir, name, pageCount) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage();
  const bytes = await doc.save();
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
}

test('counts pages of a generated pdf', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-pdfinfo-'));
  try {
    const file = await makePdf(dir, 'three.pdf', 3);
    assert.strictEqual(await countPdfPages(file), 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('counts pages with unicode file name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-pdfinfo-'));
  try {
    const file = await makePdf(dir, '报 告.pdf', 2);
    assert.strictEqual(await countPdfPages(file), 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns undefined for corrupt, empty and missing files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-pdfinfo-'));
  try {
    const bad = path.join(dir, 'bad.pdf');
    fs.writeFileSync(bad, 'this is not a pdf');
    assert.strictEqual(await countPdfPages(bad), undefined);

    const empty = path.join(dir, 'empty.pdf');
    fs.writeFileSync(empty, '');
    assert.strictEqual(await countPdfPages(empty), undefined);

    assert.strictEqual(await countPdfPages(path.join(dir, 'missing.pdf')), undefined);
    assert.strictEqual(await countPdfPages(dir), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
