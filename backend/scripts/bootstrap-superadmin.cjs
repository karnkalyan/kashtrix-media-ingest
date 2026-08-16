#!/usr/bin/env node
const path = require('path');
const readline = require('readline/promises');
const { PrismaClient } = require('@prisma/client');
const { createBootstrapSuperadmin } = require('../superadminBootstrap');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const readHidden = prompt => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    reject(new Error('An interactive TTY is required for hidden password input'));
    return;
  }

  const input = process.stdin;
  let value = '';
  let settled = false;
  const wasRaw = !!input.isRaw;

  const finish = (error) => {
    if (settled) return;
    settled = true;
    input.off('data', onData);
    input.setRawMode(wasRaw);
    input.pause();
    process.stdout.write('\n');
    if (error) reject(error);
    else resolve(value);
  };

  const onData = chunk => {
    for (const character of String(chunk)) {
      if (character === '\u0003') return finish(new Error('Bootstrap cancelled'));
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u007f' || character === '\b') {
        if (value) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (character >= ' ') {
        value += character;
        process.stdout.write('*');
      }
    }
  };

  process.stdout.write(prompt);
  input.setEncoding('utf8');
  input.setRawMode(true);
  input.resume();
  input.on('data', onData);
});

const runCli = async () => {
  if (process.argv.slice(2).length) {
    throw new Error('This CLI does not accept credential arguments; run it without command-line options');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('This CLI must run in an interactive terminal');
  }

  process.stdout.write('\nKashtrix StreamOps trusted superadmin bootstrap\n');
  process.stdout.write('Creates the first persisted SUPER_ADMIN directly through Prisma/MySQL.\n\n');

  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  const username = await terminal.question('Username: ');
  const email = await terminal.question('Email: ');
  terminal.close();

  const password = await readHidden('Password (hidden): ');
  const confirmation = await readHidden('Confirm password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match');

  const prisma = new PrismaClient();
  try {
    const user = await createBootstrapSuperadmin(prisma, { username, email, password });
    process.stdout.write(`\nSuperadmin created: ${user.username} (${user.email})\n`);
    process.stdout.write('Start or restart the backend, then use the normal /api/auth/login endpoint.\n');
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  runCli().catch(error => {
    process.stderr.write(`\nBootstrap failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { readHidden, runCli };
