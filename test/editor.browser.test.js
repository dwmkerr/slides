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
  <script>window.SLIDES_EDITOR_CONFIG = { hintIdleDelay: 80 };</script>
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
  assert.equal(await page.evaluate(() => window.SlidesEditor.version), 8);
});

test('decks can open with the menu showing', async t => {
  const { page, url } = await fixture(t, SOURCE.replace('<html>', '<html data-slides-menu="open">'));
  await page.goto(url);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('slides-menu-open')), true);
  assert.equal(await page.locator('.slides-menu-key').isVisible(), true);
  assert.equal(await page.evaluate(() => document.querySelector('#slides-editor-ui').lastElementChild.className), 'slides-menu-key', 'the key hint is always rightmost');
  assert.equal(await page.locator('#slides-menu-hint').evaluate(hint => hint.classList.contains('show')), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('slides-menu-open')), false);
  await page.waitForFunction(() => document.querySelector('#slides-menu-hint').classList.contains('show'));
});

test('opens the Esc menu and prepares printable 16:9 pages', async t => {
  const { page, url } = await fixture(t);
  // Keep the 80 ms hint visible while assertions run, even on a slow CI worker.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto(url);
  await page.clock.runFor(40); // Let the two initial animation frames reveal the hint.
  const menuOpen = () => page.evaluate(() => document.documentElement.classList.contains('slides-menu-open'));

  const buttons = page.locator('#slides-editor-ui button');
  assert.deepEqual(await buttons.allTextContents(), ['←', '→', 'Edit', 'Save']);
  assert.equal(await page.locator('.slides-menu-count').textContent(), '1 / 2');
  assert.equal(await page.locator('[data-editor-action="save"]').isDisabled(), true);
  assert.equal(await page.locator('.slides-theme').isVisible(), false, 'decks without modes get no theme toggle');
  assert.equal(await menuOpen(), false);

  const hint = page.locator('#slides-menu-hint');
  await page.waitForFunction(() => document.querySelector('#slides-menu-hint').classList.contains('show'));
  assert.equal(await hint.locator('kbd').textContent(), 'Esc');
  assert.equal(await hint.textContent(), 'EscShow/Hide Toolbar');
  const hintBox = await hint.boundingBox();
  assert(hintBox.y < 40, 'the hint sits top right');
  assert.equal(await page.locator('.slides-menu-key').textContent(), 'EscShow/Hide Toolbar');
  await page.clock.runFor(81);
  assert.equal(await hint.evaluate(element => element.classList.contains('show')), false);
  await page.mouse.move(200, 200);
  await page.waitForFunction(() => document.querySelector('#slides-menu-hint').classList.contains('show'));
  await page.clock.resume();

  await page.mouse.move(200, 1000);
  await page.waitForTimeout(80);
  assert.equal(await menuOpen(), false, 'the bottom of the screen must not reveal the menu');

  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(), true);
  assert.equal(await hint.evaluate(element => getComputedStyle(element).opacity), '0', 'the floating hint hides at once when the toolbar opens');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#slides-editor-ui')).pointerEvents === 'auto');
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(), false);
  await page.keyboard.press('m');
  assert.equal(await menuOpen(), true);
  await page.keyboard.press('M');
  assert.equal(await menuOpen(), false);

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.editorAction), 'previous');
  assert.equal(await menuOpen(), true);
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(), false);
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);

  await page.keyboard.press('Escape');
  await page.locator('[data-editor-action="next"]').click();
  assert.equal(await page.locator('.slide.active').getAttribute('data-name'), 'details');
  assert.equal(await page.locator('.slides-menu-count').textContent(), '2 / 2');
  await page.locator('[data-editor-action="previous"]').click();
  assert.equal(await page.locator('.slide.active').getAttribute('data-name'), 'title');

  await page.locator('[data-editor-action="edit"]').click();
  await page.locator('[contenteditable="true"]').first().waitFor();
  assert.equal(await page.locator('[data-editor-action="edit"]').textContent(), 'Done');
  assert.equal(await page.locator('[data-editor-action="save"]').isDisabled(), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-editor-action="edit"]').textContent(), 'Edit');
  assert.equal(await menuOpen(), true, 'Esc leaves edit mode before it closes the menu');
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(), false);

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await page.locator('#slides-print-root .slides-print-page').count(), 2, 'browser print includes every slide');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('#slides-print-root').count(), 0);

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

test('menu hint stays readable on light and dark backgrounds', async t => {
  const { page, url } = await fixture(t);
  await page.goto(url);
  assert.equal(await page.locator('#slides-menu-hint').evaluate(hint => getComputedStyle(hint).mixBlendMode), 'difference');
});

test('shows a theme toggle when the deck embeds theme styles', async t => {
  const source = SOURCE.replace('</head>', `<style data-slides-theme="light"></style>
  <style data-slides-theme="dark" data-label="Night">body { background: rgb(1, 2, 3); }</style>
</head>`);
  const { page, url } = await fixture(t, source);
  await page.goto(url);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  assert.equal(await theme(), 'light');
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.locator('.slides-theme button').allTextContents(), ['Light', 'Night']);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(await background(), 'rgb(1, 2, 3)', 'inactive theme styles stay disabled');
  await page.locator('[data-mode="dark"]').click();
  assert.equal(await theme(), 'dark');
  assert.equal(await background(), 'rgb(1, 2, 3)');
  assert.equal(await page.locator('[data-mode="dark"]').getAttribute('aria-pressed'), 'true');

  await page.reload();
  assert.equal(await theme(), 'dark', 'the chosen theme persists');
  await page.goto(`${url}?theme=light`);
  assert.equal(await theme(), 'light', '?theme= overrides the stored choice');
  assert.notEqual(await background(), 'rgb(1, 2, 3)');
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
