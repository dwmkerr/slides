import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createSlidesServer } from '../lib/server.js';

const LONG_TITLE = 'A very long closing title that keeps going well past the width the menu allows for slide titles';

// The deck script mirrors the shipped templates: it owns its index, resets reveals on leaving a slide and clamps at the ends.
const SOURCE = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; width: 100%; height: 100%; }
    .slide { display: none; width: 100%; height: 100%; }
    .slide.active { display: block; }
    .revealable { visibility: hidden; }
    .revealable.revealed { visibility: visible; }
  </style>
  <!-- editor-before -->
</head>
<body>
  <main class="stage">
    <section class="slide" data-name="intro"><h1>Introduction</h1></section>
    <section class="slide" data-name="backup" data-hidden><h2>Backup detail</h2></section>
    <section class="slide" data-name="results"><h2>Results</h2><p class="revealable">Reveal</p></section>
    <section class="slide" data-name="appendix" data-hidden><p>No heading here</p></section>
    <section class="slide" data-name="close"><h2>${LONG_TITLE}</h2></section>
    <section class="slide" data-name="extra" data-hidden><h2>Extra</h2></section>
  </main>
  <script>
    (() => {
      const slides = [...document.querySelectorAll('.slide')];
      let current = Math.max(0, Math.min(slides.length - 1, Number(new URLSearchParams(location.search).get('slide') || 1) - 1));
      const fragments = slide => [...slide.querySelectorAll('.revealable')];
      function show(index) {
        current = Math.max(0, Math.min(slides.length - 1, index));
        slides.forEach((slide, slideIndex) => {
          slide.classList.toggle('active', slideIndex === current);
          slide.setAttribute('aria-hidden', slideIndex === current ? 'false' : 'true');
          if (slideIndex !== current) fragments(slide).forEach(fragment => fragment.classList.remove('revealed'));
        });
        history.replaceState(null, '', location.pathname + '?slide=' + (current + 1));
      }
      document.addEventListener('keydown', event => {
        if (window.SlidesEditor?.state.editing) return;
        if (event.key === 'ArrowRight') {
          const next = fragments(slides[current]).find(fragment => !fragment.classList.contains('revealed'));
          if (next) next.classList.add('revealed');
          else show(current + 1);
        } else if (event.key === 'ArrowLeft') {
          const shown = fragments(slides[current]).filter(fragment => fragment.classList.contains('revealed'));
          if (shown.length) shown.at(-1).classList.remove('revealed');
          else show(current - 1);
        } else if (event.key === 'Home') show(0);
        else if (event.key === 'End') show(slides.length - 1);
      });
      show(current);
    })();
  </script>
</body>
</html>
`;

async function fixture(t, { source = SOURCE, template } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-hidden-'));
  if (template) await fs.cp(path.resolve(template), directory, { recursive: true });
  else await fs.writeFile(path.join(directory, 'presentation.html'), source);
  await fs.copyFile(path.resolve('runtime/slides-editor.js'), path.join(directory, 'slides-editor.js'));
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
  return { deck, page, url };
}

async function expectSlide(page, name, counter) {
  assert.equal(await page.locator('.slide.active').getAttribute('data-name'), name);
  assert.equal(await page.locator('.slides-menu-count').textContent(), counter);
}

const stored = (page, key) => page.evaluate(name => localStorage.getItem(`${name}:${location.pathname}`), key);

for (const [label, source] of [
  ['the deck script registers first', SOURCE],
  ['the runtime loads before the deck script', SOURCE.replace('<!-- editor-before -->', '<script src="slides-editor.js"></script>')]
]) {
  test(`left/right, toolbar and Home/End skip hidden slides when ${label}`, async t => {
    const { page, url } = await fixture(t, { source });
    await page.goto(url);
    await expectSlide(page, 'intro', '1 / 6');
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'results', '3 / 6');
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'results', '3 / 6');
    assert.equal(await page.locator('.slide.active .revealable.revealed').count(), 1, 'reveals still run before leaving a slide');
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'close', '5 / 6');
    await page.keyboard.press('ArrowRight');
    await expectSlide(page, 'close', '5 / 6');
    await page.keyboard.press('ArrowLeft');
    await expectSlide(page, 'results', '3 / 6');
    await page.keyboard.press('ArrowLeft');
    await expectSlide(page, 'intro', '1 / 6');
    await page.keyboard.press('End');
    await expectSlide(page, 'close', '5 / 6');
    await page.keyboard.press('Home');
    await expectSlide(page, 'intro', '1 / 6');

    await page.keyboard.press('Escape');
    await page.locator('[data-editor-action="next"]').click();
    await expectSlide(page, 'results', '3 / 6');
    await page.locator('[data-editor-action="previous"]').click();
    await expectSlide(page, 'intro', '1 / 6');
    assert.equal(new URL(page.url()).searchParams.get('slide'), '1', 'the deck keeps its own URL state in sync');
  });
}

test('a hidden last slide does not lose the reveals of the slide before it', async t => {
  const source = SOURCE.replace('data-name="close"', 'data-name="close" data-hidden');
  const { page, url } = await fixture(t, { source });
  await page.goto(`${url}?slide=3`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'results', '3 / 6');
  assert.equal(await page.locator('.slide.active .revealable.revealed').count(), 1);
  await page.keyboard.press('End');
  await expectSlide(page, 'results', '3 / 6');
});

test('direct links open hidden slides and Show hidden includes them', async t => {
  const { page, url } = await fixture(t);
  await page.goto(`${url}?slide=2`);
  await expectSlide(page, 'backup', '2 / 6 (hidden)');
  assert.equal(await page.locator('[data-editor-action="hidden"]').isChecked(), true);
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'results', '3 / 6');
  assert.equal(await page.locator('[data-editor-action="hidden"]').isChecked(), false);

  await page.keyboard.press('Escape');
  const showHidden = page.locator('[data-editor-action="show-hidden"]');
  assert.equal(await showHidden.isChecked(), false);
  await showHidden.check();
  assert.equal(await stored(page, 'slides-show-hidden'), '1');
  assert.notEqual(await page.evaluate(() => document.activeElement?.dataset.editorAction), 'show-hidden',
    'a clicked checkbox must not keep the arrow keys');
  await page.keyboard.press('ArrowRight'); // Reveals the fragment on results.
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'appendix', '4 / 6 (hidden)');

  await page.reload();
  assert.equal(await page.locator('[data-editor-action="show-hidden"]').isChecked(), true, 'Show hidden is remembered per deck');
  await page.keyboard.press('ArrowLeft');
  await expectSlide(page, 'results', '3 / 6');
  await page.keyboard.press('Escape');
  await page.locator('[data-editor-action="show-hidden"]').uncheck();
  assert.equal(await stored(page, 'slides-show-hidden'), null);
});

test('the Hidden checkbox stores a browser override without changing the file', async t => {
  const { deck, page, url } = await fixture(t);
  const original = await fs.readFile(deck, 'utf8');
  await page.goto(`${url}?slide=3`);
  await page.keyboard.press('Escape');
  const hidden = page.locator('[data-editor-action="hidden"]');

  await hidden.check();
  await expectSlide(page, 'results', '3 / 6 (hidden)');
  assert.deepEqual(JSON.parse(await stored(page, 'slides-hidden')), { results: true });
  await page.goto(`${url}?slide=1`);
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'close', '5 / 6');

  await page.goto(`${url}?slide=3`);
  await page.keyboard.press('Escape');
  await hidden.uncheck();
  assert.equal(await stored(page, 'slides-hidden'), null, 'an override that matches the file is removed');

  await page.goto(`${url}?slide=2`);
  await page.keyboard.press('Escape');
  await hidden.uncheck();
  await expectSlide(page, 'backup', '2 / 6');
  assert.deepEqual(JSON.parse(await stored(page, 'slides-hidden')), { backup: false });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'backup', '2 / 6');

  assert.equal(await fs.readFile(deck, 'utf8'), original);
  const printed = await page.evaluate(() => [...window.SlidesEditor.preparePrint('all').querySelectorAll('.slides-print-page')].map(item => item.dataset.slide));
  assert.deepEqual(printed, ['intro', 'backup', 'results', 'appendix', 'close', 'extra'], 'print keeps hidden slides');
});

test('the menu shows the slide title beside the arrows and the hidden controls in place', async t => {
  const { page, url } = await fixture(t);
  await page.goto(url);
  await page.keyboard.press('Escape');
  const order = await page.evaluate(() => [...document.querySelector('#slides-editor-ui').children].map(element =>
    element.dataset.editorAction || element.querySelector('input')?.dataset.editorAction || element.className));
  assert.deepEqual(order.slice(0, 9), [
    'previous', 'slides-menu-count', 'next', 'slides-menu-title', 'slides-toolbar-divider', 'hidden', 'edit', 'save', 'slides-menu-spacer'
  ]);
  assert.equal(order[9], 'show-hidden', 'Show hidden sits at the right, after the spacer');

  const title = page.locator('.slides-menu-title');
  assert.equal(await title.textContent(), 'Introduction');
  const font = element => getComputedStyle(element).fontFamily;
  assert.equal(await title.evaluate(font), await page.locator('.slides-hidden-toggle').first().evaluate(font));
  await page.goto(`${url}?slide=4`);
  assert.equal(await title.textContent(), 'appendix', 'slides without a heading fall back to data-name');
  await page.goto(`${url}?slide=5`);
  assert.equal(await title.textContent(), LONG_TITLE);
  const overflow = await title.evaluate(element => ({
    ellipsis: getComputedStyle(element).textOverflow,
    truncated: element.scrollWidth > element.clientWidth
  }));
  assert.deepEqual(overflow, { ellipsis: 'ellipsis', truncated: true });
});

test('grouped decks skip hidden pages and keep the chosen alternative', async t => {
  const { deck, page, url } = await fixture(t, { template: 'themes/editorial/template' });
  const source = await fs.readFile(deck, 'utf8');
  await fs.writeFile(deck, source.replace('data-page="stories" data-alt="B"', 'data-page="stories" data-alt="B" data-hidden'));
  await page.goto(`${url}?slide=1B`);
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  await page.keyboard.press('ArrowRight');
  await expectSlide(page, 'next-steps', '3 / 5');
  await page.keyboard.press('ArrowLeft');
  await expectSlide(page, 'intro-band', '1 / 5 (B)');
  await page.goto(`${url}?slide=2A`);
  await expectSlide(page, 'stories-columns', '2 / 5 (A, hidden)');
});
