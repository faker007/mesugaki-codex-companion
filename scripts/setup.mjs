#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildMesugakiConfig,
  buildVoiceSpeakConfig,
  providerDefinition,
  readTemplate,
  repositoryRoot,
  resolveOnboardingPaths,
} from './onboarding-lib.mjs';

const execFileAsync = promisify(execFile);
const VALUE_OPTIONS = new Set([
  'provider',
  'voice-id',
  'config-root',
  'voice-speak-root',
  'install-dir',
]);
const FLAG_OPTIONS = new Set([
  'force-config',
  'replace-key',
  'skip-keychain',
  'skip-link',
  'skip-doctor',
  'no-input',
  'json',
  'help',
]);

export function parseSetupArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) throw new Error(`unexpected argument: ${raw}`);
    const equals = raw.indexOf('=');
    const name = raw.slice(2, equals === -1 ? undefined : equals);
    if (name === 'api-key' || name === 'key') {
      throw new Error('API keys are forbidden in arguments; use the Keychain prompt');
    }
    if (FLAG_OPTIONS.has(name)) {
      if (equals !== -1) throw new Error(`--${name} does not accept a value`);
      options[name] = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new Error(`unknown option: --${name}`);
    const value = equals === -1 ? argv[index + 1] : raw.slice(equals + 1);
    if (!value || (equals === -1 && value.startsWith('--'))) {
      throw new Error(`--${name} requires a value`);
    }
    options[name] = value;
    if (equals === -1) index += 1;
  }
  return options;
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
}

async function writeSecureJson(path, value, { force = false } = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await access(path);
    if (!force) {
      await chmod(path, 0o600);
      return { path, state: 'preserved' };
    }
    const backupPath = `${path}.backup-${timestamp()}`;
    await copyFile(path, backupPath);
    await chmod(backupPath, 0o600);
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
    return { path, state: 'replaced', backupPath };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { path, state: 'created' };
}

async function keychainHas(service) {
  try {
    await execFileAsync('/usr/bin/security', ['find-generic-password', '-s', service], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

async function registerKeychain(service) {
  if (process.platform !== 'darwin') {
    throw new Error('interactive Keychain setup requires macOS');
  }
  const child = spawn('/usr/bin/security', [
    'add-generic-password',
    '-U',
    '-a',
    userInfo().username,
    '-s',
    service,
    '-w',
  ], { stdio: 'inherit', shell: false });
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('exit', resolvePromise);
  });
  if (exitCode !== 0) throw new Error(`Keychain registration failed with exit code ${exitCode}`);
}

async function promptForSetup(options) {
  const interactive = !options['no-input'] && process.stdin.isTTY && process.stdout.isTTY;
  let provider = options.provider;
  let voiceId = options['voice-id'];
  let registerKey = !options['skip-keychain'];
  if ((!provider || !voiceId) && !interactive) {
    throw new Error('non-interactive setup requires --provider and --voice-id');
  }
  if (!interactive) return { provider, voiceId, registerKey };

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!provider) {
      const answer = (await prompt.question('Provider [fish-audio/elevenlabs] (fish-audio): ')).trim();
      provider = answer || 'fish-audio';
    }
    if (!voiceId) {
      voiceId = (await prompt.question(
        providerDefinition(provider).provider === 'FISH_AUDIO'
          ? 'Fish Audio reference ID: '
          : 'ElevenLabs voice ID: ',
      )).trim();
    }
    if (!options['skip-keychain']) {
      const answer = (await prompt.question('API 키를 macOS Keychain에 등록할까? [Y/n]: '))
        .trim().toLowerCase();
      registerKey = !['n', 'no'].includes(answer);
    }
  } finally {
    prompt.close();
  }
  return { provider, voiceId, registerKey };
}

async function assertVoiceSpeak(root) {
  const scripts = ['speak.mjs', 'speak-response.mjs', 'replay.mjs'];
  for (const script of scripts) {
    try {
      await access(resolve(root, 'scripts', script));
    } catch {
      throw new Error(`voice-speak dependency is missing: ${resolve(root, 'scripts', script)}`);
    }
  }
}

async function assertExistingConfigCompatibility(paths, definition, voiceId, force) {
  if (force) return;
  const checks = [
    {
      path: paths.voiceSpeakConfig,
      validate: (config) => config.voices?.[definition.alias]?.provider === definition.provider
        && config.voices?.[definition.alias]?.voiceId === String(voiceId).trim(),
      label: `${definition.alias} voice mapping`,
    },
    {
      path: paths.mesugakiConfig,
      validate: (config) => config.voice?.alias === definition.alias,
      label: `${definition.alias} opener policy`,
    },
  ];
  for (const check of checks) {
    try {
      const config = JSON.parse(await readFile(check.path, 'utf8'));
      if (!check.validate(config)) {
        throw new Error(
          `existing config does not match requested ${check.label}: ${check.path}; ` +
          'rerun with --force-config to replace it with a backup',
        );
      }
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
}

async function runJsonScript(script, args, env) {
  const result = await execFileAsync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 1_048_576,
  });
  return JSON.parse(result.stdout);
}

export async function runSetup(argv = process.argv.slice(2), overrides = {}) {
  const options = parseSetupArgs(argv);
  if (options.help) return { ok: true, help: true };
  const env = { ...process.env, ...overrides.env };
  if (options['config-root']) env.MESUGAKI_CONFIG_ROOT = options['config-root'];
  if (options['voice-speak-root']) env.MESUGAKI_VOICE_SPEAK_ROOT = options['voice-speak-root'];
  if (options['install-dir']) env.MESUGAKI_INSTALL_DIR = options['install-dir'];
  const paths = resolveOnboardingPaths({ env, home: overrides.home });
  await assertVoiceSpeak(paths.voiceSpeakRoot);

  const requested = await promptForSetup(options);
  const definition = providerDefinition(requested.provider);
  const [voiceTemplate, mesugakiTemplate] = await Promise.all([
    readTemplate('codex-voice-speak.config.json'),
    readTemplate('mesugaki-opening-visual.config.json'),
  ]);
  await assertExistingConfigCompatibility(
    paths,
    definition,
    requested.voiceId,
    options['force-config'],
  );
  const configs = [
    await writeSecureJson(
      paths.voiceSpeakConfig,
      buildVoiceSpeakConfig(voiceTemplate, definition.provider, requested.voiceId),
      { force: options['force-config'] },
    ),
    await writeSecureJson(
      paths.mesugakiConfig,
      buildMesugakiConfig(mesugakiTemplate, definition.provider),
      { force: options['force-config'] },
    ),
  ];

  let keychain = 'skipped';
  if (requested.registerKey) {
    const environmentKey = definition.envKeys.find((key) => env[key]);
    let existingService = null;
    for (const service of definition.providerConfig.keychainServices) {
      if (await keychainHas(service)) {
        existingService = service;
        break;
      }
    }
    if (environmentKey && !options['replace-key']) keychain = `env:${environmentKey}`;
    else if (existingService && !options['replace-key']) {
      keychain = `already-present:${existingService}`;
    } else {
      if (!process.stdin.isTTY) {
        throw new Error('Keychain registration needs an interactive terminal; rerun or use --skip-keychain');
      }
      await registerKeychain(definition.keychainService);
      keychain = existingService ? 'replaced' : 'created';
    }
  }

  const childEnv = {
    ...env,
    MESUGAKI_OPENING_CONFIG: paths.mesugakiConfig,
    VOICE_SPEAK_CONFIG: paths.voiceSpeakConfig,
    MESUGAKI_VOICE_SPEAK_ROOT: paths.voiceSpeakRoot,
    MESUGAKI_INSTALL_DIR: paths.installDir,
  };
  const link = options['skip-link']
    ? { ok: true, state: 'skipped' }
    : await runJsonScript(resolve(repositoryRoot, 'scripts/install-link.mjs'), [], childEnv);
  const doctor = options['skip-doctor']
    ? { ok: true, state: 'skipped' }
    : await runJsonScript(resolve(repositoryRoot, 'scripts/doctor.mjs'), ['--json'], childEnv);

  return {
    ok: true,
    provider: definition.provider,
    voiceAlias: definition.alias,
    configs,
    keychain,
    link,
    doctor,
  };
}

function helpText() {
  return `mesugaki setup\n\n` +
    `Interactive: pnpm run setup\n` +
    `Scripted: node scripts/setup.mjs --provider=fish-audio --voice-id=<reference-id>\n\n` +
    `Flags: --force-config --replace-key --skip-keychain --skip-link --skip-doctor\n` +
    `       --config-root=<path> --voice-speak-root=<path> --install-dir=<path>\n` +
    `       --no-input --json --help\n`;
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const wantsJson = process.argv.includes('--json');
  try {
    const result = await runSetup();
    if (result.help) process.stdout.write(helpText());
    else process.stdout.write(wantsJson
      ? `${JSON.stringify(result, null, 2)}\n`
      : `setup complete: ${result.provider}, ${result.voiceAlias}, keychain=${result.keychain}\n`);
  } catch (error) {
    const result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    process.stderr.write(wantsJson ? `${JSON.stringify(result)}\n` : `setup failed: ${result.message}\n`);
    process.exitCode = 1;
  }
}
