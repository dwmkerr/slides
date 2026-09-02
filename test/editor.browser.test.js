import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { createSlidesServer } from '../lib/server.js';

const SOURCE = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script>window.SLIDES_EDITOR_CONFIG = { toolbarHideDelay: 40, toolbarInitialDelay: 60 };</script>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; }
    .stage { width: 100%; height: 100%; }
    .slide { display: none; width: 100%; height: 100%; }
    .slide.active { display: block; }
    .revealable { visibility: hidden; }
    .revealable.revealed { visibility: visible; }
  </style>
</head>
<body>
  <main class="stage">
    <section class="slide active" data-name="title">
      <h1 data-editable>Original title</h1>
      <p data-editable>Keep <span class="accent" style="color: red">this emphasis</span></p>
    </section>
    <section class="slide" data-name="details" data-reveal="true">
      <h2>Details</h2>
      <p class="revealable">Hidden detail</p>
    </section>
  </main>
  <div id="progress"></div>
  <script>
    const slides = [...document.querySelectorAll('.slide')];
    function show(index) {
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle('active', slideIndex === index);
        slide.setAttribute('aria-hidden', slideIndex === index ? 'false' : 'true');
      });
      document.querySelector('#progress').style.width = ((index + 1) * 50) + '%';
      document.querySelector('.stage').style.transform = 'scale(1)';
      document.body.classList.add('navigation-ready');
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') {
        const hidden = document.querySelector('.slide.active .revealable:not(.revealed)');
        if (hidden) hidden.classList.add('revealed');
        else show(1);
      } else if (event.key === 'ArrowLeft') {
        show(0);
      }
    });
    show(0);
  </script>
</body>
</html>
`;

async function fixture(t, source = SOURCE) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-browser-test-'));
  const deck = path.join(directory, 'presentation.html');
  await fs.writeFile(deck, source);
  await fs.copyFile(path.resolve('runtime/slides-editor.js'), path.join(directory, 'slides-editor.js'));
  const slidesServer = await createSlidesServer({
    deckPath: deck,
    port: 0,
    logger: { log() {}, error() {} }
  });
  const url = await slidesServer.start();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  t.after(async () => {
    await browser.close();
    await slidesServer.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { deck, page, url };
}

async function enterEditMode(page) {
  await page.keyboard.press('e');
  await page.locator('[contenteditable="true"]').first().waitFor();
  assert.equal(await page.locator('#slides-editor-status').textContent(), 'Live save on');
}

test('injects one editor into an arbitrary HTML deck and saves only clean editable content', async t => {
  const { deck, page, url } = await fixture(t);
  await page.goto(url);
  assert.equal(await page.locator('#slides-editor-ui').count(), 1);

  await enterEditMode(page);
  const paragraph = page.locator('section[data-name="title"] p');
  await paragraph.focus();
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.activeElement);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const transfer = new DataTransfer();
    transfer.setData('text/plain', ' pasted text');
    transfer.setData('text/html', '<span style="font-size: 80px">pasted text</span>');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    }));
  });
  await page.waitForFunction(() => window.SlidesEditor.state.dirty === false && !window.SlidesEditor.state.saving);

  const saved = await fs.readFile(deck, 'utf8');
  assert.match(saved, /Keep <span class="accent" style="color: red">this emphasis<\/span> pasted text/);
  assert.doesNotMatch(saved, /font-size: 80px/);
  assert.doesNotMatch(saved, /slides-source-revision|slides-editor-owned|contenteditable/);
  assert.doesNotMatch(saved, /<body[^>]+navigation-ready/);
  assert.doesNotMatch(saved, /<section[^>]+aria-hidden/);
  assert.doesNotMatch(saved, /<main class="stage" style=/);
  assert.doesNotMatch(saved, /<div id="progress" style=/);
  assert.match(saved, /<section class="slide active" data-name="title">/);
  assert.match(saved, /<section class="slide" data-name="details" data-reveal="true">/);
});

test('does not initialise the editor twice when a deck already includes the runtime', async t => {
  const source = SOURCE.replace('</body>', '<script src="slides-editor.js"></script></body>');
  const { page, url } = await fixture(t, source);
  await page.goto(url);
  assert.equal(await page.locator('#slides-editor-ui').count(), 1);
  assert.equal(await page.evaluate(() => window.SlidesEditor.version), 6);
});

test('offers a compact toolbar and prepares printable 16:9 pages', async t => {
  const { page, url } = await fixture(t);
  await page.goto(url);

  const buttons = page.locator('#slides-editor-ui button');
  assert.deepEqual(await buttons.allTextContents(), ['←', '→', 'Edit', 'Save', 'Print', 'Export']);
  assert.equal(await page.locator('[data-editor-action="save"]').isDisabled(), true);

  await page.waitForFunction(() => !document.documentElement.classList.contains('slides-toolbar-visible'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.editorAction), 'previous');
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#slides-editor-ui')).opacity) > 0.9);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#slides-editor-ui')).pointerEvents === 'none');
  await page.mouse.move(200, 200);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('slides-toolbar-visible')), false);
  await page.mouse.move(200, 900);
  await page.waitForFunction(() => document.documentElement.classList.contains('slides-toolbar-visible'));
  await page.mouse.move(200, 200);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#slides-editor-ui')).pointerEvents === 'none');
  await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
  await page.waitForFunction(() => document.documentElement.classList.contains('slides-toolbar-visible'));
  await page.mouse.move(960, 1000);

  await page.locator('[data-editor-action="next"]').click();
  assert.equal(await page.locator('.slide.active').getAttribute('data-name'), 'details');
  await page.locator('[data-editor-action="previous"]').click();
  assert.equal(await page.locator('.slide.active').getAttribute('data-name'), 'title');

  await page.locator('[data-editor-action="edit"]').click();
  await page.locator('[contenteditable="true"]').first().waitFor();
  assert.equal(await page.locator('[data-editor-action="edit"]').textContent(), 'Done');
  assert.equal(await page.locator('[data-editor-action="save"]').isDisabled(), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-editor-action="edit"]').textContent(), 'Edit');

  const pages = await page.evaluate(() => {
    const root = window.SlidesEditor.preparePrint('all');
    return [...root.querySelectorAll('.slides-print-page')].map(printPage => ({
      name: printPage.dataset.slide,
      slides: printPage.querySelectorAll('.slide').length,
      revealed: printPage.querySelectorAll('.revealable.revealed').length,
      editorUi: printPage.querySelectorAll('[data-slides-editor-owned]').length
    }));
  });
  assert.deepEqual(pages, [
    { name: 'title', slides: 1, revealed: 0, editorUi: 0 },
    { name: 'details', slides: 1, revealed: 1, editorUi: 0 }
  ]);

  const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  assert.equal(pdf.getPageCount(), 2);
  for (const pdfPage of pdf.getPages()) {
    assert(Math.abs(pdfPage.getWidth() - 960) < 1);
    assert(Math.abs(pdfPage.getHeight() - 540) < 1);
  }

  await page.keyboard.press('ArrowRight');
  const current = await page.evaluate(() => [...window.SlidesEditor.preparePrint('current').querySelectorAll('.slides-print-page')].map(printPage => printPage.dataset.slide));
  assert.deepEqual(current, ['details']);
});

test('rejects a browser autosave after the source changes externally', async t => {
  const { deck, page, url } = await fixture(t);
  await page.goto(url);
  await enterEditMode(page);

  const external = SOURCE.replace('Original title', 'Changed by an agent');
  await fs.writeFile(deck, external);
  await page.locator('h1').fill('Changed in the browser');
  await page.waitForFunction(() => window.SlidesEditor.state.conflict === true);

  assert.equal(await fs.readFile(deck, 'utf8'), external);
  assert.equal(await page.locator('#slides-editor-status').textContent(), 'Source changed');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#slides-editor-warning').isVisible(), true);
});
