import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { prepareSlide, settlePage, withDeckPage } from './browser.js';

const PDF_WIDTH = 960;
const PDF_HEIGHT = 540;

export function selectSlides(slides, selection) {
  const byName = new Map();
  slides.forEach((slide, index) => {
    if (!slide.name) throw new Error(`Slide ${index + 1} has no data-name`);
    if (byName.has(slide.name)) throw new Error(`Duplicate data-name: ${slide.name}`);
    byName.set(slide.name, index);
  });
  if (!selection) return slides.map((_, index) => index);

  const selected = [];
  for (const rawToken of selection.split(',')) {
    const token = rawToken.trim();
    if (!token) throw new Error('Slide selection contains an empty value');
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const first = Number(range[1]);
      const last = Number(range[2]);
      if (first > last) throw new Error(`Slide range must be ascending: ${token}`);
      for (let number = first; number <= last; number += 1) {
        if (number < 1 || number > slides.length) throw new Error(`Slide number is out of range: ${number}`);
        selected.push(number - 1);
      }
      continue;
    }
    if (/^\d+$/.test(token)) {
      const number = Number(token);
      if (number < 1 || number > slides.length) throw new Error(`Slide number is out of range: ${number}`);
      selected.push(number - 1);
      continue;
    }
    if (!byName.has(token)) throw new Error(`Unknown slide data-name: ${token}`);
    selected.push(byName.get(token));
  }
  return selected;
}

export async function exportDeck(options) {
  const absoluteDeck = path.resolve(options.deckPath);
  const output = path.resolve(options.output || `${path.basename(absoluteDeck, path.extname(absoluteDeck))}.pdf`);
  const result = await withDeckPage(absoluteDeck, async ({ page, url }) => {
    const failedAssets = new Set();
    const origin = new URL(url).origin;
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.status() >= 400) failedAssets.add(new URL(response.url()).pathname);
    });
    page.on('requestfailed', request => {
      if (new URL(request.url()).origin === origin) failedAssets.add(new URL(request.url()).pathname);
    });
    await page.goto(url, { waitUntil: 'load' });
    await settlePage(page);
    const slides = await page.locator('.slide').evaluateAll(elements => elements.map((element, index) => ({
      number: index + 1,
      name: element.dataset.name || ''
    })));
    if (!slides.length) throw new Error('No .slide elements were found');
    const selected = selectSlides(slides, options.slides);
    const pdf = await PDFDocument.create();
    for (const index of selected) {
      const rendered = await prepareSlide(page, index, { reveal: true });
      if (!rendered?.width || !rendered?.height) throw new Error(`Slide ${index + 1} could not be rendered`);
      await settlePage(page);
      const screenshot = await page.screenshot({ type: 'png', animations: 'disabled' });
      const image = await pdf.embedPng(screenshot);
      const pdfPage = pdf.addPage([PDF_WIDTH, PDF_HEIGHT]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: PDF_WIDTH, height: PDF_HEIGHT });
    }
    if (failedAssets.size) throw new Error(`Local assets failed to load: ${[...failedAssets].join(', ')}`);
    return { bytes: await pdf.save(), selected, slides };
  }, { deviceScaleFactor: options.deviceScaleFactor || 2 });

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.bytes);
  return {
    deck: absoluteDeck,
    output,
    pages: result.selected.length,
    slides: result.selected.map(index => result.slides[index])
  };
}
