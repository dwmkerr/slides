// Captures the first slide of the Pages deck as the README hero image.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const deck = pathToFileURL(path.resolve('site/index.html')).href;
const output = path.resolve('site/assets/hero.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
await page.goto(`${deck}?slide=1`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// Let the menu finish sliding in so the arrow on the slide has something to point at.
await page.waitForTimeout(500);
await page.screenshot({ path: output });
await browser.close();
console.log(`wrote ${output}`);
