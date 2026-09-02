import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { checkDeck } from '../lib/check.js';
import { exportDeck } from '../lib/export.js';

const DECK = `<!doctype html>
<html><head><style>
html, body, main { width: 100%; height: 100%; margin: 0; overflow: hidden; }
.slide { display: none; box-sizing: border-box; width: 100%; height: 100%; padding: 80px; }
.slide.active { display: flex; }
.revealable { visibility: hidden; }
.revealable.revealed { visibility: visible; }
</style></head><body><main>
<section class="slide active" data-name="title"><h1>Title</h1></section>
<section class="slide" data-name="details"><p class="revealable">Revealed for export</p></section>
<section class="slide" data-name="thanks"><h2>Thanks</h2></section>
</main></body></html>`;

async function directoryFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-export-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('exports a selected subset as ordered 16:9 PDF pages', async t => {
  const directory = await directoryFixture(t);
  const deck = path.join(directory, 'presentation.html');
  const output = path.join(directory, 'review.pdf');
  await fs.writeFile(deck, DECK);

  const result = await exportDeck({ deckPath: deck, output, slides: 'thanks,1-2', deviceScaleFactor: 1 });
  assert.equal(result.pages, 3);
  assert.deepEqual(result.slides.map(slide => slide.name), ['thanks', 'title', 'details']);

  const pdf = await PDFDocument.load(await fs.readFile(output));
  assert.equal(pdf.getPageCount(), 3);
  for (const page of pdf.getPages()) {
    assert.equal(page.getWidth(), 960);
    assert.equal(page.getHeight(), 540);
  }
});

test('preflight reports duplicate names, broken local assets, persisted state, and overflow', async t => {
  const directory = await directoryFixture(t);
  const deck = path.join(directory, 'broken.html');
  const broken = DECK
    .replace('data-name="details"', 'data-name="title"')
    .replace('<h1>Title</h1>', '<h1 contenteditable="true" style="position: absolute; left: 1900px; width: 500px">Title</h1><img src="missing.png">');
  await fs.writeFile(deck, broken);

  const result = await checkDeck(deck);
  assert.equal(result.ok, false);
  assert(result.errors.some(error => error.code === 'duplicate-data-name'));
  assert(result.errors.some(error => error.code === 'broken-local-asset'));
  assert(result.errors.some(error => error.code === 'persisted-runtime-state'));
  assert(result.warnings.some(warning => warning.code === 'slide-overflow'));
});
