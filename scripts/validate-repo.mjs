#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requiredFiles = ['SKILL.md', 'agents/openai.yaml', 'package.json'];
const textExtensions = new Set(['.json', '.md', '.mjs', '.yaml', '.yml']);
const supportedImages = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const failures = [];
let textFileCount = 0;
let imageCount = 0;

async function walk(relative = '') {
  const entries = await readdir(resolve(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walk(child);
      continue;
    }
    const extension = extname(entry.name).toLowerCase();
    if (supportedImages.has(extension)) imageCount += 1;
    if (!textExtensions.has(extension)) continue;
    textFileCount += 1;
    const content = await readFile(resolve(root, child), 'utf8');
    if (/\/Users\/[^/]+\//.test(content)) failures.push(`${child}: hard-coded macOS user path`);
  }
}

for (const file of requiredFiles) {
  try {
    await readFile(resolve(root, file));
  } catch {
    failures.push(`${file}: required file is missing`);
  }
}

const skill = await readFile(resolve(root, 'SKILL.md'), 'utf8');
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
if (!frontmatter) failures.push('SKILL.md: missing YAML frontmatter');
else {
  const fields = frontmatter[1]
    .split('\n')
    .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(':')));
  if (fields.join(',') !== 'name,description') {
    failures.push(`SKILL.md: frontmatter fields must be name,description; got ${fields.join(',')}`);
  }
  if (!frontmatter[1].includes('name: mesugaki-opening-visual')) {
    failures.push('SKILL.md: name must be mesugaki-opening-visual');
  }
}

await walk();
if (imageCount === 0) failures.push('assets: at least one supported opener image is required');

const result = { ok: failures.length === 0, textFileCount, imageCount, failures };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
