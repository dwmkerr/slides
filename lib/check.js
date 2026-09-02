import { promises as fs } from 'node:fs';
import path from 'node:path';
import { settlePage, withDeckPage } from './browser.js';

function diagnostic(code, message, slide) {
  return { code, message, ...(slide ? { slide } : {}) };
}

function persistedState(source) {
  const checks = [
    [/data-slides-editor-(?:owned|original-node)/i, 'runtime-owned editor markers'],
    [/id=["']slides-editor-(?:ui|warning|styles)["']/i, 'editor UI'],
    [/name=["']slides-source-revision["']/i, 'a served source revision'],
    [/\bcontenteditable(?:=|\s|>)/i, 'contenteditable state'],
    [/<html[^>]*class=["'][^"']*\bslides-editing\b/i, 'the editing-mode class'],
    [/class=["'][^"']*\brevealable\s+revealed\b/i, 'progressive reveal state']
  ];
  return checks
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => diagnostic('persisted-runtime-state', `Source contains ${label}`));
}

export async function checkDeck(deckPath) {
  const absoluteDeck = path.resolve(deckPath);
  const source = await fs.readFile(absoluteDeck, 'utf8');
  const errors = [];
  const warnings = [];

  if (!/^\s*<!doctype html/i.test(source) || !/<html[\s>]/i.test(source)) {
    errors.push(diagnostic('invalid-document', 'Deck must be a complete HTML document'));
  }
  errors.push(...persistedState(source));

  const browserResult = await withDeckPage(absoluteDeck, async ({ page, url }) => {
    const failedAssets = new Set();
    const origin = new URL(url).origin;
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.status() >= 400) failedAssets.add(response.url());
    });
    page.on('requestfailed', request => {
      if (new URL(request.url()).origin === origin) failedAssets.add(request.url());
    });
    await page.goto(url, { waitUntil: 'load' });
    await settlePage(page);

    const inspection = await page.evaluate(async () => {
      const slides = [...document.querySelectorAll('.slide')];
      const details = [];
      for (let index = 0; index < slides.length; index += 1) {
        slides.forEach((slide, slideIndex) => {
          const selected = slideIndex === index;
          slide.classList.toggle('active', selected);
          if (selected) slide.style.removeProperty('display');
          else slide.style.setProperty('display', 'none', 'important');
        });
        const slide = slides[index];
        slide.classList.add('active');
        if (getComputedStyle(slide).display === 'none') slide.style.setProperty('display', 'flex', 'important');
        slide.querySelectorAll('.revealable').forEach(element => element.classList.add('revealed'));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rect = slide.getBoundingClientRect();
        const overflowX = slide.scrollWidth > slide.clientWidth + 2;
        const overflowY = slide.scrollHeight > slide.clientHeight + 2;
        const clipped = [...slide.querySelectorAll('*')].some(element => {
          if (element.closest('[data-slides-editor-owned]')) return false;
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
          const child = element.getBoundingClientRect();
          if (!child.width || !child.height) return false;
          return child.left < rect.left - 2 || child.top < rect.top - 2 || child.right > rect.right + 2 || child.bottom > rect.bottom + 2;
        });
        details.push({
          index,
          name: slide.dataset.name || '',
          width: rect.width,
          height: rect.height,
          overflow: overflowX || overflowY || clipped
        });
      }
      return details;
    });
    return { failedAssets: [...failedAssets], slides: inspection };
  });

  if (!browserResult.slides.length) errors.push(diagnostic('missing-slides', 'No .slide elements were found'));
  const names = new Map();
  for (const slide of browserResult.slides) {
    const label = slide.name || `slide ${slide.index + 1}`;
    if (!slide.name) errors.push(diagnostic('missing-data-name', `${label} has no data-name`, label));
    else if (names.has(slide.name)) errors.push(diagnostic('duplicate-data-name', `data-name "${slide.name}" is duplicated`, slide.name));
    else names.set(slide.name, slide.index);
    if (!slide.width || !slide.height) errors.push(diagnostic('hidden-slide', `${label} could not be rendered`, label));
    if (slide.overflow) warnings.push(diagnostic('slide-overflow', `${label} may overflow its 16:9 frame`, label));
  }
  for (const asset of browserResult.failedAssets) {
    const url = new URL(asset);
    if (url.pathname.startsWith('/__slides/')) continue;
    errors.push(diagnostic('broken-local-asset', `Local asset failed to load: ${url.pathname}`));
  }

  return {
    deck: absoluteDeck,
    slides: browserResult.slides.map(({ index, name }) => ({ number: index + 1, name })),
    errors,
    warnings,
    ok: errors.length === 0
  };
}

export function formatCheck(result) {
  const lines = [`${result.ok ? '✓' : '✗'} ${result.deck}`, `${result.slides.length} slide${result.slides.length === 1 ? '' : 's'}`];
  for (const error of result.errors) lines.push(`error [${error.code}] ${error.message}`);
  for (const warning of result.warnings) lines.push(`warning [${warning.code}] ${warning.message}`);
  if (!result.errors.length && !result.warnings.length) lines.push('No problems found');
  return lines.join('\n');
}
