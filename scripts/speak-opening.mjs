#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { enqueueResponse } from './response-queue.mjs';

const DEFAULT_VOICE_SPEAK_ROOT = resolve(
  process.env.MESUGAKI_VOICE_SPEAK_ROOT
    ?? join(homedir(), '.agents/skills/voice-speak'),
);
const DEFAULT_VOICE_SPEAK_SCRIPT = join(DEFAULT_VOICE_SPEAK_ROOT, 'scripts/speak.mjs');
const DEFAULT_VOICE_RESPONSE_SCRIPT = join(DEFAULT_VOICE_SPEAK_ROOT, 'scripts/speak-response.mjs');
const VALUE_OPTIONS = new Set([
  'config',
  'text-base64',
  'voice',
  'provider',
  'emotion-preset',
  'max-segments',
  'segment-by',
]);
const FLAG_OPTIONS = new Set([
  'response',
  'ultra',
  'execute',
  'dry-run',
  'play',
  'no-play',
  'wait-playback',
  'detach-playback',
  'fast',
  'no-fast',
  'melancholy',
  'no-emotion',
  'queue',
  'no-queue',
  'json',
  'help',
]);

export class OpeningVoiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OpeningVoiceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new OpeningVoiceError(code, message, details);
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) fail('UNEXPECTED_ARGUMENT', `unexpected positional argument: ${raw}`);
    const equals = raw.indexOf('=');
    const name = raw.slice(2, equals === -1 ? undefined : equals);
    if (FLAG_OPTIONS.has(name)) {
      if (equals !== -1) fail('INVALID_ARGUMENT', `--${name} does not accept a value`);
      options[name] = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) fail('UNKNOWN_OPTION', `unknown option: --${name}`);
    const value = equals === -1 ? argv[index + 1] : raw.slice(equals + 1);
    if (value === undefined || (equals === -1 && value.startsWith('--'))) {
      fail('MISSING_OPTION_VALUE', `--${name} requires a value`);
    }
    options[name] = value;
    if (equals === -1) index += 1;
  }
  if (options.execute && options['dry-run']) {
    fail('CONFLICTING_MODE', '--execute and --dry-run cannot be combined');
  }
  if (options.play && options['no-play']) {
    fail('CONFLICTING_PLAYBACK', '--play and --no-play cannot be combined');
  }
  if (options['wait-playback'] && options['detach-playback']) {
    fail('CONFLICTING_PLAYBACK_WAIT', '--wait-playback and --detach-playback cannot be combined');
  }
  if (options.fast && options['no-fast']) {
    fail('CONFLICTING_SPEED', '--fast and --no-fast cannot be combined');
  }
  if (options['no-emotion'] && (options['emotion-preset'] !== undefined || options.melancholy)) {
    fail('CONFLICTING_EMOTION', '--no-emotion cannot be combined with an emotion mode');
  }
  if (options.melancholy && options['emotion-preset'] !== undefined) {
    fail('CONFLICTING_EMOTION', '--melancholy and --emotion-preset cannot be combined');
  }
  if (options.ultra && !options.response) {
    fail('ULTRA_REQUIRES_RESPONSE', '--ultra is available only for response playback');
  }
  if (options.queue && options['no-queue']) {
    fail('CONFLICTING_QUEUE', '--queue and --no-queue cannot be combined');
  }
  if ((options.queue || options['no-queue']) && !options.response) {
    fail('QUEUE_REQUIRES_RESPONSE', 'queue controls are available only for response playback');
  }
  if (options.queue && !options.execute) {
    fail('QUEUE_REQUIRES_EXECUTE', '--queue requires --execute');
  }
  if (options['max-segments'] !== undefined && !options.ultra) {
    fail('MAX_SEGMENTS_REQUIRES_ULTRA', '--max-segments is available only with --response --ultra');
  }
  if (options['segment-by'] !== undefined && !options.response) {
    fail('SEGMENT_BY_REQUIRES_RESPONSE', '--segment-by is available only for response playback');
  }
  if (options['segment-by'] !== undefined
    && !['paragraph', 'heart'].includes(options['segment-by'])) {
    fail('INVALID_SEGMENT_MODE', '--segment-by must be paragraph or heart');
  }
  return options;
}

function parsePositiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    fail('INVALID_CONFIG', `${label} must be an integer from 1 to ${max}`);
  }
  return value;
}

function decodeText(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) {
    fail('TEXT_REQUIRED', '--text-base64 is required');
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    fail('INVALID_BASE64', '--text-base64 is not valid base64');
  }
  const text = Buffer.from(encoded, 'base64').toString('utf8');
  if (!text.trim()) fail('EMPTY_TEXT', 'opening text must not be empty');
  return text;
}

async function loadConfig(path, deps) {
  let raw;
  try {
    raw = await deps.readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    fail('INVALID_CONFIG', `config is not valid JSON: ${path}`);
  }
  if (config?.version !== 1 || typeof config.voice !== 'object') {
    fail('INVALID_CONFIG', 'config must contain version 1 and a voice object');
  }
  if (typeof config.voice.enabled !== 'boolean'
    || typeof config.voice.play !== 'boolean'
    || typeof config.voice.waitForPlayback !== 'boolean'
    || typeof config.voice.fast !== 'boolean'
    || typeof config.voice.provider !== 'string'
    || typeof config.voice.alias !== 'string'
    || !(config.voice.emotionPreset === null || typeof config.voice.emotionPreset === 'string')) {
    fail(
      'INVALID_CONFIG',
      'voice must define enabled, provider, alias, play, waitForPlayback, fast, and emotionPreset',
    );
  }
  if (config.voice.maxCharacters !== null) {
    parsePositiveInteger(config.voice.maxCharacters, 'voice.maxCharacters', 2_000);
  }
  parsePositiveInteger(config.voice.timeoutMs, 'voice.timeoutMs', 120_000);
  if (config.responseVoice !== undefined) {
    if (config.responseVoice === null
      || typeof config.responseVoice !== 'object'
      || typeof config.responseVoice.enabled !== 'boolean'
      || !['final', 'all'].includes(config.responseVoice.scope)
      || (config.responseVoice.segmentBy !== undefined
        && !['paragraph', 'heart'].includes(config.responseVoice.segmentBy))
      || (config.responseVoice.autoSpeakContinued !== undefined
        && typeof config.responseVoice.autoSpeakContinued !== 'boolean')) {
      fail(
        'INVALID_CONFIG',
        'responseVoice must define enabled, use scope final, and use a supported segment policy',
      );
    }
    parsePositiveInteger(config.responseVoice.ultraMaxSegments, 'responseVoice.ultraMaxSegments', 5);
    if (config.responseVoice.queue !== undefined) {
      if (config.responseVoice.queue === null
        || typeof config.responseVoice.queue !== 'object'
        || typeof config.responseVoice.queue.enabled !== 'boolean'
        || !['thread', 'global'].includes(config.responseVoice.queue.shareScope ?? 'thread')) {
        fail(
          'INVALID_CONFIG',
          'responseVoice.queue must define enabled and use thread or global shareScope',
        );
      }
      parsePositiveInteger(
        config.responseVoice.queue.idleTimeoutMs,
        'responseVoice.queue.idleTimeoutMs',
        3_600_000,
      );
      if (config.responseVoice.queue.idleTimeoutMs < 1_000) {
        fail('INVALID_CONFIG', 'responseVoice.queue.idleTimeoutMs must be at least 1000');
      }
      parsePositiveInteger(
        config.responseVoice.queue.maxPendingJobs,
        'responseVoice.queue.maxPendingJobs',
        8,
      );
      if (![0, 1].includes(config.responseVoice.queue.prefetchSegments ?? 0)) {
        fail(
          'INVALID_CONFIG',
          'responseVoice.queue.prefetchSegments must be 0 or 1',
        );
      }
    }
  }
  if (config.roleplay !== undefined
    && (config.roleplay === null
      || typeof config.roleplay !== 'object'
      || typeof config.roleplay.melancholyEmotionPreset !== 'string'
      || !config.roleplay.melancholyEmotionPreset.trim())) {
    fail('INVALID_CONFIG', 'roleplay must define a non-empty melancholyEmotionPreset');
  }
  return config;
}

export function buildVoiceSpeakArgs({
  options,
  config,
  encodedText,
  voiceSpeakScript,
  voiceResponseScript = DEFAULT_VOICE_RESPONSE_SCRIPT,
}) {
  const voice = config.voice;
  const isResponse = Boolean(options.response);
  const responseVoice = config.responseVoice ?? { enabled: true, ultraMaxSegments: 5 };
  const allSegments = isResponse && (options.ultra || responseVoice.scope === 'all');
  const provider = options.provider ?? voice.provider;
  const alias = options.voice ?? voice.alias;
  const play = options['no-play'] ? false : options.play ? true : voice.play;
  const waitForPlayback = allSegments
    ? true
    : options['detach-playback']
    ? false
    : options['wait-playback']
      ? true
      : voice.waitForPlayback;
  const fast = options['no-fast'] ? false : options.fast ? true : voice.fast;
  const emotionPreset = options['no-emotion']
    ? null
    : options.melancholy
      ? config.roleplay?.melancholyEmotionPreset ?? 'melancholy-mesugaki-asmr'
      : options['emotion-preset'] ?? voice.emotionPreset;
  const execute = Boolean(options.execute);
  const maxSegments = allSegments
    ? parsePositiveInteger(
      options['max-segments'] === undefined
        ? responseVoice.ultraMaxSegments
        : Number(options['max-segments']),
      '--max-segments',
      5,
    )
    : null;
  const segmentBy = options['segment-by'] ?? responseVoice.segmentBy ?? 'paragraph';
  const prefetch = Boolean(
    isResponse
    && allSegments
    && execute
    && play
    && !options['no-queue']
    && (options.queue || responseVoice.queue?.enabled)
    && responseVoice.queue?.prefetchSegments === 1
  );
  return [
    isResponse ? voiceResponseScript : voiceSpeakScript,
    `--provider=${provider}`,
    `--voice=${alias}`,
    `--text-base64=${encodedText}`,
    voice.maxCharacters === null ? '--no-char-limit' : `--max-chars=${voice.maxCharacters}`,
    `--timeout-ms=${voice.timeoutMs}`,
    play ? '--play' : '--no-play',
    ...(play ? [waitForPlayback ? '--wait-playback' : '--detach-playback'] : []),
    ...(fast ? ['--fast'] : []),
    ...(emotionPreset ? [`--emotion-preset=${emotionPreset}`] : []),
    ...(isResponse ? [`--segment-by=${segmentBy}`] : []),
    ...(allSegments ? ['--ultra', `--max-segments=${maxSegments}`] : []),
    ...(prefetch ? ['--prefetch'] : []),
    execute ? '--execute' : '--dry-run',
    '--json',
  ];
}

async function defaultRunChild(file, args) {
  return await new Promise((resolvePromise, rejectPromise) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', shell: false, maxBuffer: 1_048_576 },
      (error, stdout) => {
        if (error) {
          rejectPromise(Object.assign(new Error('voice-speak child failed'), {
            exitCode: error.code,
          }));
          return;
        }
        resolvePromise({ stdout });
      },
    );
  });
}

export async function runOpeningVoice(argv, overrides = {}) {
  const deps = {
    env: process.env,
    home: homedir(),
    readFile,
    runChild: defaultRunChild,
    nodePath: process.execPath,
    voiceSpeakScript: DEFAULT_VOICE_SPEAK_SCRIPT,
    voiceResponseScript: DEFAULT_VOICE_RESPONSE_SCRIPT,
    enqueueResponse,
    ...overrides,
  };
  const options = parseArgs(argv);
  if (options.help) return { ok: true, help: true };
  const configPath = resolve(
    options.config
      ?? deps.env.MESUGAKI_OPENING_CONFIG
      ?? join(deps.home, '.config/mesugaki-opening-visual/config.json'),
  );
  const config = await loadConfig(configPath, deps);
  const text = decodeText(options['text-base64']);
  const characterCount = [...text].length;
  if (config === null) {
    return {
      ok: true,
      mode: 'disabled',
      reason: 'config-not-found',
      characterCount,
      childInvocations: 0,
      providerRequests: 0,
      networkRequests: 0,
      playback: { requested: false, status: 'not-run' },
    };
  }
  if (!options.response
    && config.voice.maxCharacters !== null
    && characterCount > config.voice.maxCharacters) {
    fail(
      'TEXT_TOO_LONG',
      `opening text has ${characterCount} characters; limit is ${config.voice.maxCharacters}`,
    );
  }
  const responseEnabled = config.responseVoice?.enabled ?? true;
  if (!config.voice.enabled || (options.response && !responseEnabled)) {
    return {
      ok: true,
      mode: 'disabled',
      reason: !config.voice.enabled ? 'voice-disabled' : 'response-voice-disabled',
      characterCount,
      childInvocations: 0,
      providerRequests: 0,
      networkRequests: 0,
      playback: { requested: false, status: 'not-run' },
    };
  }

  const childArgs = buildVoiceSpeakArgs({
    options,
    config,
    encodedText: options['text-base64'],
    voiceSpeakScript: deps.voiceSpeakScript,
    voiceResponseScript: deps.voiceResponseScript,
  });
  const queueConfig = config.responseVoice?.queue;
  const useQueue = Boolean(
    options.response
    && options.execute
    && !options['no-queue']
    && (options.queue || queueConfig?.enabled),
  );
  if (useQueue) {
    let queueResult;
    try {
      queueResult = await deps.enqueueResponse({
        env: deps.env,
        nodePath: deps.nodePath,
        responseScript: childArgs[0],
        responseArgs: childArgs.slice(1),
        idleTimeoutMs: queueConfig?.idleTimeoutMs ?? 600_000,
        maxPendingJobs: queueConfig?.maxPendingJobs ?? 4,
        shareScope: queueConfig?.shareScope ?? 'thread',
      });
    } catch (error) {
      fail('VOICE_QUEUE_FAILED', 'response voice queue rejected the job without retry', {
        causeCode: error?.code ?? 'UNEXPECTED_ERROR',
        childInvocations: 0,
      });
    }
    return {
      ok: true,
      mode: 'queued',
      integration: 'mesugaki-opening-visual:response-queue',
      childInvocations: 0,
      providerRequests: 0,
      networkRequests: 0,
      queue: queueResult,
    };
  }
  let child;
  try {
    child = await deps.runChild(deps.nodePath, childArgs);
  } catch (error) {
    fail('VOICE_SPEAK_FAILED', 'voice-speak invocation failed without retry', {
      exitCode: error?.exitCode ?? null,
      childInvocations: 1,
    });
  }
  let result;
  try {
    result = JSON.parse(child.stdout);
  } catch {
    fail('INVALID_CHILD_OUTPUT', 'voice-speak returned invalid JSON', { childInvocations: 1 });
  }
  return {
    ...result,
    integration: options.response
      ? 'mesugaki-opening-visual:response'
      : 'mesugaki-opening-visual:opening',
    childInvocations: 1,
  };
}

export function helpText() {
  return `speak-opening: configured mesugaki opener or response TTS\n\n` +
    `Usage:\n` +
    `  speak-opening.mjs --text-base64=<utf8-base64> [--execute] [--voice=<alias>]\n\n` +
    `  speak-opening.mjs --response [--ultra] [--queue] --text-base64=<utf8-base64> [--execute]\n\n` +
    `Options:\n` +
    `  --execute | --dry-run  --voice <alias>  --provider <provider>\n` +
    `  --play | --no-play  --wait-playback | --detach-playback\n` +
    `  --fast | --no-fast  --melancholy | --emotion-preset <preset> | --no-emotion\n` +
    `  --response [--segment-by paragraph|heart]  --ultra [--max-segments <1-5>]\n` +
    `  --queue | --no-queue  share async playback through CODEX_THREAD_ID\n` +
    `  --config <path>  --json  --help\n`;
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
    const result = await runOpeningVoice(process.argv.slice(2));
    if (result.help) {
      process.stdout.write(helpText());
      return;
    }
    if (wantsJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stdout.write(`${result.mode}: childInvocations=${result.childInvocations}\n`);
  } catch (error) {
    const result = publicError(error);
    if (wantsJson) process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stderr.write(`speak-opening [${result.code}]: ${result.message}\n`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) await main();
