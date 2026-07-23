import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const API_PREFIX = '/__slides';
const MAX_DECK_BYTES = 10 * 1024 * 1024;
const MAX_COMMENT_BYTES = 64 * 1024;

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp']
]);

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function sendText(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(value),
    'Cache-Control': 'no-store'
  });
  response.end(value);
}

async function readBody(request, maximumBytes) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;

  const expected = `http://${request.headers.host}`;
  if (origin !== expected) {
    const error = new Error('Cross-origin requests are not allowed');
    error.statusCode = 403;
    throw error;
  }
}

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function atomicWrite(filename, content) {
  const stats = await fs.stat(filename);
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.slides-${process.pid}-${Date.now()}.tmp`
  );

  try {
    await fs.writeFile(temporary, content, { mode: stats.mode });
    await fs.rename(temporary, filename);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function createSlidesServer(options) {
  const {
    deckPath,
    host = '127.0.0.1',
    port = 2663,
    logger = console
  } = options;

  if (!deckPath) throw new Error('deckPath is required');

  const absoluteDeck = path.resolve(deckPath);
  const deckStats = await fs.stat(absoluteDeck).catch(() => null);
  if (!deckStats?.isFile()) {
    throw new Error(`Deck not found: ${absoluteDeck}`);
  }

  const rootDirectory = path.dirname(absoluteDeck);
  const comments = [];
  const eventClients = new Set();
  let eventSequence = 0;
  let address;

  function publish(type, data) {
    const payload = JSON.stringify(data);
    eventSequence += 1;
    const message = `id: ${eventSequence}\nevent: ${type}\ndata: ${payload}\n\n`;
    for (const client of eventClients) client.write(message);
  }

  async function serveStatic(request, response, pathname) {
    let candidate;
    if (pathname === '/') {
      candidate = absoluteDeck;
    } else {
      let decoded;
      try {
        decoded = decodeURIComponent(pathname);
      } catch {
        sendText(response, 400, 'Invalid URL');
        return;
      }
      candidate = path.resolve(rootDirectory, `.${decoded}`);
    }

    if (!isWithin(rootDirectory, candidate)) {
      sendText(response, 403, 'Path is outside the served deck directory');
      return;
    }

    let stats = await fs.stat(candidate).catch(() => null);
    if (stats?.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      stats = await fs.stat(candidate).catch(() => null);
    }
    if (!stats?.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    const content = await fs.readFile(candidate);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES.get(path.extname(candidate).toLowerCase()) || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  }

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
      const pathname = requestUrl.pathname;

      if (pathname.startsWith(API_PREFIX)) assertSameOrigin(request);

      if (request.method === 'GET' && pathname === `${API_PREFIX}/ping`) {
        sendJson(response, 200, {
          ok: true,
          version: 1,
          deck: path.basename(absoluteDeck),
          capabilities: ['live-save', 'comments', 'sse']
        });
        return;
      }

      if (request.method === 'PUT' && pathname === `${API_PREFIX}/file`) {
        const contentType = request.headers['content-type'] || '';
        if (!contentType.startsWith('text/html')) {
          sendJson(response, 415, { error: 'Expected text/html' });
          return;
        }
        const html = await readBody(request, MAX_DECK_BYTES);
        if (!/^\s*<!doctype html/i.test(html) || !/<html[\s>]/i.test(html)) {
          sendJson(response, 400, { error: 'Expected a complete HTML document' });
          return;
        }
        await atomicWrite(absoluteDeck, html);
        const savedAt = new Date().toISOString();
        publish('save', { deck: path.basename(absoluteDeck), savedAt, bytes: Buffer.byteLength(html) });
        logger.log(`saved ${path.basename(absoluteDeck)} at ${savedAt}`);
        sendJson(response, 200, { ok: true, savedAt });
        return;
      }

      if (request.method === 'GET' && pathname === `${API_PREFIX}/comments`) {
        sendJson(response, 200, { comments });
        return;
      }

      if (request.method === 'POST' && pathname === `${API_PREFIX}/comments`) {
        const input = JSON.parse(await readBody(request, MAX_COMMENT_BYTES));
        const text = String(input.text || '').trim();
        const slide = String(input.slide || '').trim();
        const selection = String(input.selection || '').trim();
        if (!text || !slide) {
          sendJson(response, 400, { error: 'A slide and comment text are required' });
          return;
        }
        const comment = {
          id: randomUUID(),
          slide,
          text,
          ...(selection ? { selection } : {}),
          createdAt: new Date().toISOString()
        };
        comments.push(comment);
        publish('comment', comment);
        logger.log(`comment [${comment.slide}] ${comment.text}`);
        sendJson(response, 201, { ok: true, comment });
        return;
      }

      if (request.method === 'GET' && pathname === `${API_PREFIX}/events`) {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        response.write(`event: ready\ndata: ${JSON.stringify({ deck: path.basename(absoluteDeck) })}\n\n`);
        eventClients.add(response);
        request.on('close', () => eventClients.delete(response));
        return;
      }

      if ((request.method === 'GET' || request.method === 'HEAD') && !pathname.startsWith(API_PREFIX)) {
        await serveStatic(request, response, pathname);
        return;
      }

      sendText(response, 404, 'Not found');
    } catch (error) {
      const statusCode = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
      if (statusCode === 500) logger.error(error);
      if (!response.headersSent) sendJson(response, statusCode, { error: error.message });
      else response.end();
    }
  });

  const keepAlive = setInterval(() => {
    for (const client of eventClients) client.write(': keep-alive\n\n');
  }, 15_000);
  keepAlive.unref();

  return {
    absoluteDeck,
    comments,
    server,
    async start() {
      if (address) return address;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      const serverAddress = server.address();
      const actualPort = typeof serverAddress === 'object' ? serverAddress.port : port;
      address = `http://${host}:${actualPort}`;
      return address;
    },
    async close() {
      clearInterval(keepAlive);
      for (const client of eventClients) client.end();
      eventClients.clear();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      address = undefined;
    }
  };
}
