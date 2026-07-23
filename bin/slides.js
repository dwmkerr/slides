#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createSlidesServer } from '../lib/server.js';

function usage() {
  return `slides - local live editing for HTML decks

Usage:
  slides serve [file] [--port 2663] [--open]

Examples:
  slides serve presentation.html
  slides serve slides/index.html --port 3000 --open`;
}

function parseArguments(arguments_) {
  const values = [...arguments_];
  const command = values[0] && !values[0].startsWith('-') ? values.shift() : 'serve';
  let file = 'presentation.html';
  let port = 2663;
  let shouldOpen = false;

  while (values.length) {
    const value = values.shift();
    if (value === '--help' || value === '-h') return { help: true };
    if (value === '--open') {
      shouldOpen = true;
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
    if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    file = value;
  }

  if (command !== 'serve') throw new Error(`Unknown command: ${command}`);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${port}`);
  return { command, file, port, shouldOpen };
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
