import { chromium } from 'playwright';
import { createSlidesServer } from './server.js';

export const VIEWPORT = { width: 1920, height: 1080 };

function browserLaunchError(error) {
  if (!/Executable doesn't exist|browserType\.launch/i.test(error.message)) return error;
  return new Error(`${error.message}\nInstall the export browser with: npx playwright install chromium`);
}

export async function withDeckPage(deckPath, callback, options = {}) {
  const slidesServer = await createSlidesServer({
    deckPath,
    port: 0,
    logger: options.logger || { log() {}, error() {} }
  });
  const url = await slidesServer.start();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: options.deviceScaleFactor || 1
    });
    const page = await context.newPage();
    return await callback({ context, page, slidesServer, url });
  } catch (error) {
    throw browserLaunchError(error);
  } finally {
    await browser?.close();
    await slidesServer.close();
  }
}

export async function settlePage(page) {
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts?.ready || Promise.resolve(),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
    await Promise.all([...document.images].map(image => {
      if (image.complete) return image.decode?.().catch(() => {});
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

export async function prepareSlide(page, index, options = {}) {
  return page.evaluate(({ index, reveal }) => {
    document.documentElement.classList.remove('slides-editing');
    document.querySelectorAll('[data-slides-editor-owned], #slides-editor-ui, #slides-editor-warning, #slides-comment-dialog').forEach(element => {
      element.style.setProperty('display', 'none', 'important');
    });
    const slides = [...document.querySelectorAll('.slide')];
    slides.forEach((slide, slideIndex) => {
      const selected = slideIndex === index;
      slide.classList.toggle('active', selected);
      slide.setAttribute('aria-hidden', selected ? 'false' : 'true');
      if (selected) slide.style.removeProperty('display');
      else slide.style.setProperty('display', 'none', 'important');
    });
    const selected = slides[index];
    if (!selected) return null;
    selected.classList.add('active');
    const display = getComputedStyle(selected).display;
    if (display === 'none') selected.style.setProperty('display', 'flex', 'important');
    if (reveal) selected.querySelectorAll('.revealable').forEach(element => element.classList.add('revealed'));
    return {
      name: selected.dataset.name || '',
      width: selected.getBoundingClientRect().width,
      height: selected.getBoundingClientRect().height
    };
  }, { index, reveal: options.reveal !== false });
}
