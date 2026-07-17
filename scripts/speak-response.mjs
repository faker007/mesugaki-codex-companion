#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { helpText, runOpeningVoice } from './speak-opening.mjs';

export async function runConfiguredResponse(argv, overrides = {}) {
  return await runOpeningVoice(['--response', ...argv], overrides);
}

function publicError(error) {
  return {
    ok: false,
    code: error?.code ?? 'UNEXPECTED_ERROR',
    message: error?.message ?? 'unexpected error',
    ...(error?.details && Object.keys(error.details).length ? { details: error.details } : {}),
  };
}

async function main() {
  const wantsJson = process.argv.includes('--json');
  try {
    const result = await runConfiguredResponse(process.argv.slice(2));
    if (result.help) {
      process.stdout.write(helpText());
      return;
    }
    if (wantsJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(
        `${result.mode}: scope=${result.scope ?? 'final'}, childInvocations=${result.childInvocations}\n`,
      );
    }
  } catch (error) {
    const result = publicError(error);
    if (wantsJson) process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stderr.write(`speak-response [${result.code}]: ${result.message}\n`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) await main();
