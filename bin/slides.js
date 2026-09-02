#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createSlidesServer } from '../lib/server.js';

function usage() {
  return `slides - create, check, export, and live-edit HTML decks

Usage:
  slides serve [file] [--port 2663] [--open]
  slides check [file] [--json]
  slides export [file] [--slides 1,3-5|title,community] [--output deck.pdf]

Examples:
  slides serve presentation.html
  slides serve slides/index.html --port 3000 --open
  slides check presentation.html
  slides export presentation.html --slides 1,3-5 --output review.pdf`;
}

function parseArguments(arguments_) {
  const values = [...arguments_];
  const commands = new Set(['serve', 'check', 'export']);
  const command = commands.has(values[0]) ? values.shift() : 'serve';
  let file = 'presentation.html';
  let port = 2663;
  let shouldOpen = false;
  let json = false;
  let slides;
  let output;

  while (values.length) {
    const value = values.shift();
    if (value === '--help' || value === '-h') return { help: true };
    if (value === '--open') {
      shouldOpen = true;
      continue;
    }
    if (value === '--json') {
      json = true;
      continue;
    }
    if (value === '--port') {
      port = Number(values.shift());
      continue;
    }
    if (value.startsWith('--port=')) {
      port = Number(value.slice('--port='.length));
      continue;
    }
    if (value === '--slides') {
      slides = values.shift();
      if (!slides) throw new Error('--slides requires a selection');
      continue;
    }
    if (value.startsWith('--slides=')) {
      slides = value.slice('--slides='.length);
      if (!slides) throw new Error('--slides requires a selection');
      continue;
    }
    if (value === '--output' || value === '-o') {
      output = values.shift();
      if (!output) throw new Error(`${value} requires a filename`);
      continue;
    }
    if (value.startsWith('--output=')) {
      output = value.slice('--output='.length);
      if (!output) throw new Error('--output requires a filename');
      continue;
    }
    if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    file = value;
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${port}`);
  if (command !== 'serve' && shouldOpen) throw new Error('--open is only valid with serve');
  if (command !== 'serve' && port !== 2663) throw new Error('--port is only valid with serve');
  if (command !== 'check' && json) throw new Error('--json is only valid with check');
  if (command !== 'export' && (slides || output)) throw new Error('--slides and --output are only valid with export');
  return { command, file, json, output, port, shouldOpen, slides };
}

function openBrowser(url) {
  const commands = {
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
    win32: ['cmd', ['/c', 'start', '', url]]
  };
  const [command, arguments_] = commands[process.platform] || commands.linux;
  const child = spawn(command, arguments_, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const deckPath = path.resolve(options.file);
  if (options.command === 'check') {
    const { checkDeck, formatCheck } = await import('../lib/check.js');
    const result = await checkDeck(deckPath);
    console.log(options.json ? JSON.stringify(result, null, 2) : formatCheck(result));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (options.command === 'export') {
    const { exportDeck } = await import('../lib/export.js');
    const result = await exportDeck({ deckPath, output: options.output, slides: options.slides });
    console.log(`exported ${result.pages} slide${result.pages === 1 ? '' : 's'} to ${result.output}`);
    return;
  }

  const slidesServer = await createSlidesServer({ deckPath, port: options.port });
  const url = await slidesServer.start();

  console.log(`\nslides server\n`);
  console.log(`  deck      ${deckPath}`);
  console.log(`  open      ${url}`);
  console.log(`  comments  ${url}/__slides/comments`);
  console.log(`  events    ${url}/__slides/events\n`);
  console.log('Press Ctrl+C to stop. Comments will appear here.\n');

  if (options.shouldOpen) openBrowser(url);

  const stop = async () => {
    await slidesServer.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error(`slides: ${error.message}`);
  console.error(usage());
  process.exitCode = 1;
});
