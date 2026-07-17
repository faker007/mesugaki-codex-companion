#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { lstat, readFile, readlink, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { repositoryRoot, resolveOnboardingPaths } from './onboarding-lib.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = { json: false, skipDryRun: false };
  for (const raw of argv) {
    if (raw === '--json') options.json = true;
    else if (raw === '--skip-dry-run') options.skipDryRun = true;
    else if (raw === '--help') options.help = true;
    else throw new Error(`unknown option: ${raw}`);
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function credentialSource(providerConfig, env) {
  for (const key of providerConfig?.envKeys ?? []) {
    if (env[key]) return `env:${key}`;
  }
  if (process.platform !== 'darwin') return null;
  for (const service of providerConfig?.keychainServices ?? []) {
    try {
      await execFileAsync('/usr/bin/security', ['find-generic-password', '-s', service], {
        encoding: 'utf8',
      });
      return `keychain:${service}`;
    } catch {
      // Try the next configured service without reading or printing the secret.
    }
  }
  return null;
}

export async function runDoctor(argv = process.argv.slice(2), overrides = {}) {
  const options = parseArgs(argv);
  if (options.help) return { ok: true, help: true };
  const env = { ...process.env, ...overrides.env };
  const paths = resolveOnboardingPaths({ env, home: overrides.home });
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });

  add('platform', process.platform === 'darwin' ? 'pass' : 'fail', process.platform);
  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20 ? 'pass' : 'fail', process.versions.node);

  for (const script of ['speak.mjs', 'speak-response.mjs', 'replay.mjs']) {
    const path = resolve(paths.voiceSpeakRoot, 'scripts', script);
    try {
      await stat(path);
      add(`voice-speak:${script}`, 'pass', path);
    } catch {
      add(`voice-speak:${script}`, 'fail', path);
    }
  }

  let voiceConfig;
  let mesugakiConfig;
  for (const [name, path] of [
    ['voice-config', paths.voiceSpeakConfig],
    ['mesugaki-config', paths.mesugakiConfig],
  ]) {
    try {
      const config = await readJson(path);
      if (name === 'voice-config') voiceConfig = config;
      else mesugakiConfig = config;
      const mode = (await stat(path)).mode & 0o777;
      add(name, mode & 0o077 ? 'warn' : 'pass', `${path} mode=${mode.toString(8)}`);
    } catch (error) {
      add(name, 'fail', `${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (voiceConfig && mesugakiConfig) {
    const aliasName = mesugakiConfig.voice?.alias;
    const alias = voiceConfig.voices?.[aliasName];
    if (!alias) add('voice-alias', 'fail', `missing alias: ${aliasName ?? '<unset>'}`);
    else {
      add('voice-alias', 'pass', `${aliasName} -> ${alias.provider}`);
      const source = await credentialSource(voiceConfig.providers?.[alias.provider], env);
      add('credential', source ? 'pass' : 'fail', source ?? `missing for ${alias.provider}`);
    }
  }

  try {
    const linkStats = await lstat(paths.installDir);
    if (!linkStats.isSymbolicLink()) add('install-link', 'fail', `${paths.installDir} is not a symlink`);
    else {
      const target = resolve(dirname(paths.installDir), await readlink(paths.installDir));
      add('install-link', target === repositoryRoot ? 'pass' : 'fail', `${paths.installDir} -> ${target}`);
    }
  } catch (error) {
    add('install-link', 'fail', `${paths.installDir}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const hasBlockingFailure = () => checks.some((check) => check.status === 'fail');
  if (!options.skipDryRun && !hasBlockingFailure()) {
    try {
      const result = await execFileAsync(process.execPath, [
        resolve(repositoryRoot, 'scripts/speak-opening.mjs'),
        '--text-base64=ZG9jdG9yLXByZWZsaWdodA==',
        '--dry-run',
        '--json',
      ], {
        encoding: 'utf8',
        env: {
          ...env,
          MESUGAKI_OPENING_CONFIG: paths.mesugakiConfig,
          VOICE_SPEAK_CONFIG: paths.voiceSpeakConfig,
          MESUGAKI_VOICE_SPEAK_ROOT: paths.voiceSpeakRoot,
        },
        maxBuffer: 1_048_576,
      });
      const report = JSON.parse(result.stdout);
      add('dry-run', report.ok && report.mode === 'dry-run' ? 'pass' : 'fail',
        `${report.provider ?? 'unknown'} ${report.voiceAlias ?? 'unknown'} network=0`);
    } catch (error) {
      add('dry-run', 'fail', error instanceof Error ? error.message : String(error));
    }
  } else if (options.skipDryRun) add('dry-run', 'skip', 'disabled by --skip-dry-run');

  return {
    ok: !checks.some((check) => check.status === 'fail'),
    checks,
    summary: Object.fromEntries(['pass', 'warn', 'fail', 'skip'].map((status) => [
      status,
      checks.filter((check) => check.status === status).length,
    ])),
  };
}

function helpText() {
  return 'mesugaki doctor: [--skip-dry-run] [--json] [--help]\n';
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const wantsJson = process.argv.includes('--json');
  try {
    const result = await runDoctor();
    if (result.help) process.stdout.write(helpText());
    else if (wantsJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      for (const check of result.checks) {
        process.stdout.write(`${check.status.toUpperCase().padEnd(4)} ${check.name}: ${check.detail}\n`);
      }
      process.stdout.write(`doctor: pass=${result.summary.pass} warn=${result.summary.warn} fail=${result.summary.fail}\n`);
    }
    if (!result.help && !result.ok) process.exitCode = 1;
  } catch (error) {
    const result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    process.stderr.write(wantsJson ? `${JSON.stringify(result)}\n` : `doctor failed: ${result.message}\n`);
    process.exitCode = 1;
  }
}
