import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { createSlidesServer } from '../lib/server.js';
import { checkDeck } from '../lib/check.js';
import { exportDeck } from '../lib/export.js';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-alternatives-'));
  await fs.cp(path.resolve('themes/editorial/template'), directory, { recursive: true });
  const deck = path.join(directory, 'presentation.html');
  const server = await createSlidesServer({ deckPath: deck, port: 0, logger: { log() {}, error() {} } });
  const url = await server.start();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  t.after(async () => {
    await browser.close();
    await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, deck, page, url };
}

async function expectSlide(page, name, counter) {
  assert.equal(await page.locator('.slide.active').getAttribute('data-name'), name);
  await page.waitForFunction(text => document.querySelector('.slides-menu-count').textContent === text, counter);
  assert.equal(await page.locator('.slide[aria-hidden="false"]').count(), 1);
}

test('groups alternatives, remembers choices, and keeps direct links and menu controls in sync', async t => {
  const { page, url } = await fixture(t);
  await page.goto(url + '?slide=1A&theme=paper&keep=1#review');
  await expectSlide(page, 'intro-split', '1 / 5 (A)');
  await page.keyboard.press('ArrowDown');
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  assert.equal(new URL(page.url()).searchParams.get('theme'), 'paper');
  assert.equal(new URL(page.url()).searchParams.get('keep'), '1');
  assert.equal(new URL(page.url()).hash, '#review');
  await page.locator('[data-editor-action="next"]').click();
  await expectSlide(page, 'stories-columns', '2 / 5 (A)');
  await page.locator('[data-editor-action="alternative-next"]').click();
  await expectSlide(page, 'stories-rows', '2 / 5 (B)');
  await page.keyboard.press('ArrowLeft');
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  await page.locator('.slide.active [data-goto="stories"]').click();
  await expectSlide(page, 'stories-rows', '2 / 5 (B)');
  await page.reload();
  await expectSlide(page, 'stories-rows', '2 / 5 (B)');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'next-steps', '3 / 5');
  assert.equal(await page.locator('[data-editor-action="alternative-next"]').isDisabled(), true);
  await page.keyboard.press('ArrowDown');
  await expectSlide(page, 'next-steps', '3 / 5');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'reading-wall', '5 / 5');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  await page.goto(url + '?slide=1A');
  await expectSlide(page, 'intro-split', '1 / 5 (A)');
  await page.locator('[data-editor-action="alternative-previous"]').click();
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  await page.goto(url + '?slide=study-narrative');
  await expectSlide(page, 'study-narrative', '4 / 5 (A)');
  await page.evaluate(() => localStorage.setItem(`slides-alternatives:${location.pathname}`, '{"intro":"removed","stories":"B"}'));
  await page.goto(url);
  await expectSlide(page, 'intro-split', '1 / 5 (A)');
});

test('editing and comment input do not navigate, and only the edited alternative is saved', async t => {
  const { page, url, deck } = await fixture(t);
  await page.goto(url + '?slide=2B');
  await page.keyboard.press('e');
  const title = page.locator('.slide.active h2');
  await page.waitForFunction(() => document.querySelector('.slide.active h2').isContentEditable);
  assert.equal(await page.locator('[data-editor-action="alternative-next"]').isDisabled(), true);
  await title.fill('An edited row layout');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'stories-rows', '2 / 5 (B)');
  await page.waitForFunction(() => !window.SlidesEditor.state.dirty && !window.SlidesEditor.state.saving);
  const saved = await fs.readFile(deck, 'utf8');
  assert.equal((saved.match(/An edited row layout/g) || []).length, 1);
  assert.match(saved, /Better tools start with a clearer way to look/);
  assert.doesNotMatch(saved, /data-slides-editor-owned|contenteditable=|slides-source-revision/);
  assert.doesNotMatch(saved, /class="slide [^"]*active|<main class="stage" style=/);
  await page.keyboard.press('Escape');
  await title.evaluate(element => element.blur());
  await page.keyboard.press('c');
  await page.locator('#slides-comment-text').fill('Leave this layout in place');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'stories-rows', '2 / 5 (B)');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await expectSlide(page, 'stories-columns', '2 / 5 (A)');
  await page.goto(url + '?slide=4A');
  await page.keyboard.press('e');
  await page.waitForFunction(() => document.querySelector('.slide.active dd').isContentEditable);
  await page.locator('.slide.active dd').first().fill('A revised timeline step');
  await page.waitForFunction(() => !window.SlidesEditor.state.dirty && !window.SlidesEditor.state.saving);
  assert.match(await fs.readFile(deck, 'utf8'), /A revised timeline step/);
});

test('static viewing works offline, and native button activation does not skip a group', async t => {
  const { page, deck } = await fixture(t);
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(deck).href + '?slide=1A');
  await expectSlide(page, 'intro-split', '1 / 5 (A)');
  await page.locator('[data-editor-action="alternative-next"]').focus();
  await page.keyboard.press('Space');
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  assert.deepEqual(await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src)), []);
  assert.deepEqual(failures, []);
});

test('alternative navigation preserves progressive reveals and ignores modified arrow keys', async t => {
  const { page, url } = await fixture(t);
  await page.goto(url + '?slide=1A');
  await page.locator('.slide.active .lead').evaluate(element => element.classList.add('revealable'));
  await page.keyboard.press('Control+ArrowDown');
  await expectSlide(page, 'intro-split', '1 / 5 (A)');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'intro-split', '1 / 5 (A)');
  assert.equal(await page.locator('.slide.active .revealable.revealed').count(), 1);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.slide.active .revealable.revealed').count(), 0);
  await page.keyboard.press('ArrowDown');
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
});

test('all layouts pass preflight, print separately, and export by stable alternative name', async t => {
  const { page, url, deck, directory } = await fixture(t);
  const check = await checkDeck(deck);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(check.warnings, []);
  assert.equal(check.slides.length, 8);
  await page.goto(url + '?slide=2B');
  await page.evaluate(() => window.SlidesEditor.preparePrint('all'));
  assert.equal(await page.locator('#slides-print-root .slides-print-page').count(), 8);
  const names = await page.locator('#slides-print-root .slide').evaluateAll(slides => slides.map(slide => slide.dataset.name));
  assert.equal(new Set(names).size, 8);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#slides-print-root .variant-label').first().isVisible(), true);
  const output = path.join(directory, 'chosen-layouts.pdf');
  const result = await exportDeck({ deckPath: deck, output, slides: 'stories-rows,intro-split', deviceScaleFactor: 1 });
  const pdf = await PDFDocument.load(await fs.readFile(output));
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(result.slides.map(slide => slide.name), ['stories-rows', 'intro-split']);
});
