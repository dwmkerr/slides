import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSlidesServer } from '../lib/server.js';

const ORIGINAL_HTML = '<!doctype html><html><body><section class="slide">Original</section></body></html>';
const UPDATED_HTML = '<!doctype html><html><body><section class="slide">Updated</section></body></html>';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slides-test-'));
  const deck = path.join(directory, 'presentation.html');
  await fs.writeFile(deck, ORIGINAL_HTML);
  const logger = { log() {}, error() {} };
  const slidesServer = await createSlidesServer({ deckPath: deck, port: 0, logger });
  const url = await slidesServer.start();
  t.after(async () => {
    await slidesServer.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { deck, slidesServer, url };
}

test('serves the deck and reports live-edit capabilities', async t => {
  const { url } = await fixture(t);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), ORIGINAL_HTML);

  const ping = await fetch(`${url}/__slides/ping`).then(response => response.json());
  assert.equal(ping.ok, true);
  assert.deepEqual(ping.capabilities, ['live-save', 'comments', 'sse']);
});

test('atomically writes a complete HTML document to the configured deck only', async t => {
  const { deck, url } = await fixture(t);
  const response = await fetch(`${url}/__slides/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: UPDATED_HTML
  });
  assert.equal(response.status, 200);
  assert.equal(await fs.readFile(deck, 'utf8'), UPDATED_HTML);

  const invalid = await fetch(`${url}/__slides/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html' },
    body: '<p>fragment</p>'
  });
  assert.equal(invalid.status, 400);
  assert.equal(await fs.readFile(deck, 'utf8'), UPDATED_HTML);
});

test('holds comments in memory and exposes them to the agent', async t => {
  const { slidesServer, url } = await fixture(t);
  const created = await fetch(`${url}/__slides/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slide: 'comparison', selection: 'Default', text: 'Make this recommendation clearer' })
  });
  assert.equal(created.status, 201);

  const result = await fetch(`${url}/__slides/comments`).then(response => response.json());
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].slide, 'comparison');
  assert.equal(result.comments[0].text, 'Make this recommendation clearer');
  assert.equal(slidesServer.comments.length, 1);
});

test('streams comment events over SSE', async t => {
  const { url } = await fixture(t);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const events = await fetch(`${url}/__slides/events`, { signal: controller.signal });
  assert.equal(events.status, 200);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let content = decoder.decode((await reader.read()).value);
  assert.match(content, /event: ready/);

  await fetch(`${url}/__slides/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slide: 'title', text: 'Shorten this title' })
  });

  while (!content.includes('event: comment')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    content += decoder.decode(chunk.value);
  }
  assert.match(content, /Shorten this title/);
  await reader.cancel();
});

test('rejects cross-origin API writes and paths above the deck directory', async t => {
  const { url } = await fixture(t);
  const crossOrigin = await fetch(`${url}/__slides/comments`, {
    method: 'POST',
    headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ slide: 'title', text: 'malicious' })
  });
  assert.equal(crossOrigin.status, 403);

  const traversal = await fetch(`${url}/..%2Fpackage.json`);
  assert.equal(traversal.status, 403);
});

test('serves the complete Pages gallery from its root deck', async t => {
  const slidesServer = await createSlidesServer({
    deckPath: path.resolve('site/index.html'),
    port: 0,
    logger: { log() {}, error() {} }
  });
  const url = await slidesServer.start();
  t.after(() => slidesServer.close());

  for (const pathname of ['/', '/demo-slides/', '/quantumblack/', '/conference/', '/assets/demo-preview.png']) {
    const response = await fetch(`${url}${pathname}`);
    assert.equal(response.status, 200, `${pathname} should be served`);
  }
});
