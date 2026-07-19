import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  OpeningVoiceError,
  buildVoiceSpeakArgs,
  parseArgs,
  runOpeningVoice,
} from './speak-opening.mjs';

function configFixture(overrides = {}) {
  return {
    version: 1,
    voice: {
      enabled: true,
      provider: 'auto',
      alias: 'fish-default',
      play: true,
      waitForPlayback: false,
      fast: false,
      emotionPreset: 'sharp-mesugaki-asmr',
      maxCharacters: 180,
      timeoutMs: 30_000,
      ...overrides,
    },
    responseVoice: {
      enabled: true,
      scope: 'final',
      segmentBy: 'heart',
      autoSpeakContinued: true,
      ultraMaxSegments: 5,
      queue: {
        enabled: false,
        shareScope: 'thread',
        idleTimeoutMs: 600_000,
        maxPendingJobs: 4,
        prefetchSegments: 0,
      },
    },
    roleplay: {
      melancholyEmotionPreset: 'melancholy-mesugaki-asmr',
    },
  };
}

async function harness({ config = configFixture(), runChild, enqueueResponse } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-opening-voice-test-'));
  const configPath = join(root, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const calls = [];
  const queueCalls = [];
  const deps = {
    home: root,
    env: {},
    nodePath: '/test/node',
    voiceSpeakScript: '/test/voice-speak.mjs',
    voiceResponseScript: '/test/speak-response.mjs',
    runChild: runChild ?? (async (file, args) => {
      calls.push({ file, args });
      return {
        stdout: JSON.stringify({
          ok: true,
          mode: args.includes('--execute') ? 'execute' : 'dry-run',
          provider: 'FISH_AUDIO',
          voiceAlias: 'fish-default',
          playback: { status: 'played' },
        }),
      };
    }),
    enqueueResponse: enqueueResponse ?? (async (request) => {
      queueCalls.push(request);
      return {
        ok: true,
        queueStatus: 'enqueued',
        sessionKey: 'a'.repeat(24),
        position: 1,
        pendingJobs: 1,
      };
    }),
  };
  return { root, configPath, calls, queueCalls, deps };
}

function encoded(text = '왔네♡') {
  return Buffer.from(text).toString('base64');
}

test('rejects conflicting modes', () => {
  assert.throws(() => parseArgs(['--execute', '--dry-run']), { code: 'CONFLICTING_MODE' });
});

test('rejects conflicting playback settings', () => {
  assert.throws(() => parseArgs(['--play', '--no-play']), { code: 'CONFLICTING_PLAYBACK' });
});

test('rejects conflicting playback wait settings', () => {
  assert.throws(
    () => parseArgs(['--wait-playback', '--detach-playback']),
    { code: 'CONFLICTING_PLAYBACK_WAIT' },
  );
});

test('rejects conflicting speed settings', () => {
  assert.throws(() => parseArgs(['--fast', '--no-fast']), { code: 'CONFLICTING_SPEED' });
});

test('rejects conflicting emotion settings', () => {
  assert.throws(
    () => parseArgs(['--no-emotion', '--emotion-preset=whisper-asmr']),
    { code: 'CONFLICTING_EMOTION' },
  );
  assert.throws(
    () => parseArgs(['--melancholy', '--emotion-preset=whisper-asmr']),
    { code: 'CONFLICTING_EMOTION' },
  );
  assert.throws(
    () => parseArgs(['--melancholy', '--no-emotion']),
    { code: 'CONFLICTING_EMOTION' },
  );
});

test('ultra and max segments require response mode', () => {
  assert.throws(() => parseArgs(['--ultra']), { code: 'ULTRA_REQUIRES_RESPONSE' });
  assert.throws(
    () => parseArgs(['--response', '--max-segments=3']),
    { code: 'MAX_SEGMENTS_REQUIRES_ULTRA' },
  );
  assert.throws(
    () => parseArgs(['--segment-by=heart']),
    { code: 'SEGMENT_BY_REQUIRES_RESPONSE' },
  );
  assert.throws(
    () => parseArgs(['--response', '--segment-by=sentence']),
    { code: 'INVALID_SEGMENT_MODE' },
  );
});

test('queue controls require execute response mode', () => {
  assert.throws(() => parseArgs(['--queue']), { code: 'QUEUE_REQUIRES_RESPONSE' });
  assert.throws(
    () => parseArgs(['--response', '--queue', '--dry-run']),
    { code: 'QUEUE_REQUIRES_EXECUTE' },
  );
  assert.throws(
    () => parseArgs(['--response', '--queue', '--no-queue', '--execute']),
    { code: 'CONFLICTING_QUEUE' },
  );
});

test('builds one provider-neutral voice-speak invocation', () => {
  const args = buildVoiceSpeakArgs({
    options: { execute: true },
    config: configFixture(),
    encodedText: encoded(),
    voiceSpeakScript: '/voice-speak.mjs',
  });
  assert.equal(args[0], '/voice-speak.mjs');
  assert.ok(args.includes('--provider=auto'));
  assert.ok(args.includes('--voice=fish-default'));
  assert.ok(args.includes('--execute'));
  assert.ok(args.includes('--play'));
  assert.ok(args.includes('--detach-playback'));
  assert.ok(args.includes('--emotion-preset=sharp-mesugaki-asmr'));
  assert.equal(args.some((value) => value.startsWith('--segment-by=')), false);
  assert.equal(args.filter((value) => value === '--execute').length, 1);
});

test('builds final-response playback with the configured global response selector', () => {
  const args = buildVoiceSpeakArgs({
    options: { response: true, execute: true },
    config: configFixture({ maxCharacters: null }),
    encodedText: encoded('설명\n\n마지막 매도♡'),
    voiceSpeakScript: '/voice-speak.mjs',
    voiceResponseScript: '/speak-response.mjs',
  });
  assert.equal(args[0], '/speak-response.mjs');
  assert.ok(args.includes('--no-char-limit'));
  assert.ok(args.includes('--emotion-preset=sharp-mesugaki-asmr'));
  assert.ok(args.includes('--segment-by=heart'));
  assert.ok(args.includes('--detach-playback'));
  assert.equal(args.includes('--ultra'), false);
});

test('melancholy modifier selects its configured preset without replacing the sharp default', () => {
  const melancholyArgs = buildVoiceSpeakArgs({
    options: { response: true, melancholy: true, execute: true },
    config: configFixture({ maxCharacters: null }),
    encodedText: encoded('조금만 있다 가♡'),
    voiceSpeakScript: '/voice-speak.mjs',
    voiceResponseScript: '/speak-response.mjs',
  });
  assert.ok(melancholyArgs.includes('--emotion-preset=melancholy-mesugaki-asmr'));
  assert.equal(melancholyArgs.includes('--emotion-preset=sharp-mesugaki-asmr'), false);

  const defaultArgs = buildVoiceSpeakArgs({
    options: { response: true, execute: true },
    config: configFixture({ maxCharacters: null }),
    encodedText: encoded('허~접♡'),
    voiceSpeakScript: '/voice-speak.mjs',
    voiceResponseScript: '/speak-response.mjs',
  });
  assert.ok(defaultArgs.includes('--emotion-preset=sharp-mesugaki-asmr'));
});

test('builds ultra response with a capped sequential playback policy', () => {
  const args = buildVoiceSpeakArgs({
    options: { response: true, ultra: true, execute: true },
    config: configFixture({ maxCharacters: null }),
    encodedText: encoded('하나\n\n둘'),
    voiceSpeakScript: '/voice-speak.mjs',
    voiceResponseScript: '/speak-response.mjs',
  });
  assert.equal(args[0], '/speak-response.mjs');
  assert.ok(args.includes('--ultra'));
  assert.ok(args.includes('--max-segments=5'));
  assert.ok(args.includes('--segment-by=heart'));
  assert.ok(args.includes('--wait-playback'));
  assert.equal(args.includes('--detach-playback'), false);
});

test('persistent all scope builds capped paragraph playback', () => {
  const config = configFixture({ maxCharacters: null });
  config.responseVoice.scope = 'all';
  config.responseVoice.segmentBy = 'paragraph';
  config.responseVoice.ultraMaxSegments = 4;
  const args = buildVoiceSpeakArgs({
    options: { response: true, execute: true },
    config,
    encodedText: encoded('하나\n\n둘'),
    voiceSpeakScript: '/voice-speak.mjs',
    voiceResponseScript: '/speak-response.mjs',
  });
  assert.ok(args.includes('--ultra'));
  assert.ok(args.includes('--max-segments=4'));
  assert.ok(args.includes('--segment-by=paragraph'));
  assert.ok(args.includes('--wait-playback'));
});

test('disabled config makes zero child invocations', async () => {
  const h = await harness({ config: configFixture({ enabled: false }) });
  const result = await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded()}`,
    '--execute',
  ], h.deps);
  assert.equal(result.mode, 'disabled');
  assert.equal(result.reason, 'voice-disabled');
  assert.equal(result.childInvocations, 0);
  assert.equal(result.providerRequests, 0);
  assert.equal(result.networkRequests, 0);
  assert.equal(h.calls.length, 0);
});

test('missing personal config is treated as disabled with zero voice requests', async () => {
  const h = await harness();
  const configPath = join(h.root, 'missing-config.json');
  const openingResult = await runOpeningVoice([
    `--config=${configPath}`,
    `--text-base64=${encoded()}`,
    '--execute',
  ], h.deps);
  const responseResult = await runOpeningVoice([
    '--response',
    '--queue',
    `--config=${configPath}`,
    `--text-base64=${encoded('응답♡')}`,
    '--execute',
  ], h.deps);
  for (const result of [openingResult, responseResult]) {
    assert.equal(result.mode, 'disabled');
    assert.equal(result.reason, 'config-not-found');
    assert.equal(result.childInvocations, 0);
    assert.equal(result.providerRequests, 0);
    assert.equal(result.networkRequests, 0);
    assert.deepEqual(result.playback, { requested: false, status: 'not-run' });
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.queueCalls.length, 0);
});

test('malformed personal config remains an error instead of being muted', async () => {
  const h = await harness();
  const configPath = join(h.root, 'malformed-config.json');
  await writeFile(configPath, '{');
  await assert.rejects(
    runOpeningVoice([
      `--config=${configPath}`,
      `--text-base64=${encoded()}`,
      '--execute',
    ], h.deps),
    { code: 'INVALID_CONFIG' },
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.queueCalls.length, 0);
});

test('disabled response voice makes zero child invocations', async () => {
  const config = configFixture();
  config.responseVoice.enabled = false;
  const h = await harness({ config });
  const result = await runOpeningVoice([
    '--response',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('설명\n\n마지막')}`,
    '--execute',
  ], h.deps);
  assert.equal(result.mode, 'disabled');
  assert.equal(result.reason, 'response-voice-disabled');
  assert.equal(result.childInvocations, 0);
  assert.equal(result.providerRequests, 0);
  assert.equal(result.networkRequests, 0);
  assert.equal(h.calls.length, 0);
});

test('persistent all response scope is accepted by config', async () => {
  const config = configFixture();
  config.responseVoice.scope = 'all';
  const h = await harness({ config });
  await runOpeningVoice([
    '--response',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('마지막')}`,
  ], h.deps);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].args.includes('--ultra'));
});

test('invalid queue policy is refused before child invocation', async () => {
  const config = configFixture();
  config.responseVoice.queue.maxPendingJobs = 9;
  const h = await harness({ config });
  await assert.rejects(
    runOpeningVoice([
      '--response',
      `--config=${h.configPath}`,
      `--text-base64=${encoded()}`,
    ], h.deps),
    { code: 'INVALID_CONFIG' },
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.queueCalls.length, 0);
});

test('invalid queue share scope is refused before child invocation', async () => {
  const config = configFixture();
  config.responseVoice.queue.shareScope = 'machine';
  const h = await harness({ config });
  await assert.rejects(
    runOpeningVoice([
      '--response',
      `--config=${h.configPath}`,
      `--text-base64=${encoded()}`,
    ], h.deps),
    { code: 'INVALID_CONFIG' },
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.queueCalls.length, 0);
});

test('invalid melancholy roleplay config is refused before child invocation', async () => {
  const config = configFixture();
  config.roleplay = null;
  const h = await harness({ config });
  await assert.rejects(
    runOpeningVoice([
      '--melancholy',
      `--config=${h.configPath}`,
      `--text-base64=${encoded()}`,
    ], h.deps),
    { code: 'INVALID_CONFIG' },
  );
  assert.equal(h.calls.length, 0);
});

test('invalid response segment policy is refused before child invocation', async () => {
  const config = configFixture();
  config.responseVoice.segmentBy = 'sentence';
  const h = await harness({ config });
  await assert.rejects(
    runOpeningVoice([
      '--response',
      `--config=${h.configPath}`,
      `--text-base64=${encoded()}`,
    ], h.deps),
    { code: 'INVALID_CONFIG' },
  );
  assert.equal(h.calls.length, 0);
});

test('dry-run calls voice-speak once without execute', async () => {
  const h = await harness();
  const result = await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded()}`,
    '--dry-run',
  ], h.deps);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.childInvocations, 1);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].args.includes('--dry-run'));
  assert.equal(h.calls[0].args.includes('--execute'), false);
});

test('execute uses config playback and exact base64 without shell', async () => {
  const h = await harness();
  const text = '왔네. 오늘도 느렸네♡';
  const base64 = encoded(text);
  const result = await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${base64}`,
    '--execute',
  ], h.deps);
  assert.equal(result.childInvocations, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].file, '/test/node');
  assert.ok(h.calls[0].args.includes(`--text-base64=${base64}`));
  assert.ok(h.calls[0].args.includes('--play'));
  assert.ok(h.calls[0].args.includes('--detach-playback'));
});

test('response execution delegates the full markdown once to the response selector', async () => {
  const h = await harness({ config: configFixture({ maxCharacters: null }) });
  const text = '기술 설명\n\n**마지막 매도♡**';
  const base64 = encoded(text);
  const result = await runOpeningVoice([
    '--response',
    `--config=${h.configPath}`,
    `--text-base64=${base64}`,
    '--execute',
  ], h.deps);
  assert.equal(result.integration, 'mesugaki-opening-visual:response');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].args[0], '/test/speak-response.mjs');
  assert.ok(h.calls[0].args.includes(`--text-base64=${base64}`));
  assert.ok(h.calls[0].args.includes('--segment-by=heart'));
});

test('queued response returns immediately and makes zero foreground child invocations', async () => {
  const config = configFixture({ maxCharacters: null });
  config.responseVoice.scope = 'all';
  config.responseVoice.segmentBy = 'paragraph';
  config.responseVoice.queue.enabled = true;
  config.responseVoice.queue.shareScope = 'global';
  config.responseVoice.queue.prefetchSegments = 1;
  const h = await harness({ config });
  h.deps.env.CODEX_THREAD_ID = 'thread-secret-value';
  const base64 = encoded('하나♡\n\n둘♡');
  const result = await runOpeningVoice([
    '--response',
    `--config=${h.configPath}`,
    `--text-base64=${base64}`,
    '--execute',
  ], h.deps);
  assert.equal(result.mode, 'queued');
  assert.equal(result.childInvocations, 0);
  assert.equal(result.providerRequests, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.queueCalls.length, 1);
  assert.equal(h.queueCalls[0].env.CODEX_THREAD_ID, 'thread-secret-value');
  assert.equal(h.queueCalls[0].shareScope, 'global');
  assert.equal(h.queueCalls[0].responseArgs[0], '--provider=auto');
  assert.ok(h.queueCalls[0].responseArgs.includes('--ultra'));
  assert.ok(h.queueCalls[0].responseArgs.includes('--segment-by=paragraph'));
  assert.ok(h.queueCalls[0].responseArgs.includes('--prefetch'));
  assert.equal(JSON.stringify(result).includes('thread-secret-value'), false);
});

test('no-queue bypasses enabled session queue for one response', async () => {
  const config = configFixture({ maxCharacters: null });
  config.responseVoice.queue.enabled = true;
  const h = await harness({ config });
  await runOpeningVoice([
    '--response',
    '--no-queue',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('마지막♡')}`,
    '--execute',
  ], h.deps);
  assert.equal(h.calls.length, 1);
  assert.equal(h.queueCalls.length, 0);
});

test('response segmentation can be overridden per invocation', async () => {
  const h = await harness({ config: configFixture({ maxCharacters: null }) });
  await runOpeningVoice([
    '--response',
    '--segment-by=paragraph',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('설명\n\n마지막')}`,
    '--execute',
  ], h.deps);
  assert.ok(h.calls[0].args.includes('--segment-by=paragraph'));
  assert.equal(h.calls[0].args.includes('--segment-by=heart'), false);
});

test('ultra execution forwards the configured cap and waited playback', async () => {
  const config = configFixture({ maxCharacters: null });
  config.responseVoice.ultraMaxSegments = 3;
  const h = await harness({ config });
  await runOpeningVoice([
    '--response',
    '--ultra',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('하나\n\n둘\n\n셋')}`,
    '--execute',
  ], h.deps);
  assert.ok(h.calls[0].args.includes('--ultra'));
  assert.ok(h.calls[0].args.includes('--max-segments=3'));
  assert.ok(h.calls[0].args.includes('--wait-playback'));
  assert.equal(h.calls[0].args.includes('--detach-playback'), false);
});

test('response wrapper applies finite character caps per selected paragraph', async () => {
  const h = await harness({ config: configFixture({ maxCharacters: 3 }) });
  await runOpeningVoice([
    '--response',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('가나다\n\n라마바')}`,
    '--execute',
  ], h.deps);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].args.includes('--max-chars=3'));
});

test('per-invocation voice and playback override config', async () => {
  const h = await harness();
  await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded()}`,
    '--voice=eleven-multilingual',
    '--provider=elevenlabs',
    '--no-play',
    '--fast',
    '--execute',
  ], h.deps);
  assert.ok(h.calls[0].args.includes('--voice=eleven-multilingual'));
  assert.ok(h.calls[0].args.includes('--provider=elevenlabs'));
  assert.ok(h.calls[0].args.includes('--no-play'));
  assert.ok(h.calls[0].args.includes('--fast'));
});

test('per-invocation waited playback overrides detached config', async () => {
  const h = await harness();
  await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded()}`,
    '--wait-playback',
    '--execute',
  ], h.deps);
  assert.ok(h.calls[0].args.includes('--wait-playback'));
  assert.equal(h.calls[0].args.includes('--detach-playback'), false);
});

test('null maxCharacters removes the local wrapper and voice-speak caps', async () => {
  const h = await harness({ config: configFixture({ maxCharacters: null }) });
  const text = '가'.repeat(2_500);
  await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded(text)}`,
    '--execute',
  ], h.deps);
  assert.ok(h.calls[0].args.includes('--no-char-limit'));
  assert.equal(h.calls[0].args.some((value) => value.startsWith('--max-chars=')), false);
});

test('no-emotion removes the configured preset for one invocation', async () => {
  const h = await harness();
  await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded()}`,
    '--no-emotion',
    '--execute',
  ], h.deps);
  assert.equal(h.calls[0].args.some((value) => value.startsWith('--emotion-preset=')), false);
});

test('emotion preset can be overridden per invocation', async () => {
  const h = await harness({ config: configFixture({ emotionPreset: null }) });
  await runOpeningVoice([
    `--config=${h.configPath}`,
    `--text-base64=${encoded()}`,
    '--emotion-preset=whisper-asmr',
    '--execute',
  ], h.deps);
  assert.ok(h.calls[0].args.includes('--emotion-preset=whisper-asmr'));
});

test('melancholy response forwards the configured roleplay preset once', async () => {
  const h = await harness({ config: configFixture({ maxCharacters: null }) });
  await runOpeningVoice([
    '--response',
    '--melancholy',
    `--config=${h.configPath}`,
    `--text-base64=${encoded('설명\n\n조금만 있다 가♡')}`,
    '--execute',
  ], h.deps);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].args.includes('--emotion-preset=melancholy-mesugaki-asmr'));
  assert.equal(h.calls[0].args.includes('--emotion-preset=sharp-mesugaki-asmr'), false);
});

test('character cap fails before child invocation', async () => {
  const h = await harness({ config: configFixture({ maxCharacters: 3 }) });
  await assert.rejects(
    runOpeningVoice([
      `--config=${h.configPath}`,
      `--text-base64=${encoded('가나다라')}`,
      '--execute',
    ], h.deps),
    { code: 'TEXT_TOO_LONG' },
  );
  assert.equal(h.calls.length, 0);
});

test('invalid base64 fails before child invocation', async () => {
  const h = await harness();
  await assert.rejects(
    runOpeningVoice([
      `--config=${h.configPath}`,
      '--text-base64=@@@',
      '--execute',
    ], h.deps),
    { code: 'INVALID_BASE64' },
  );
  assert.equal(h.calls.length, 0);
});

test('child failure is not retried and is sanitized', async () => {
  let calls = 0;
  const h = await harness({
    runChild: async () => {
      calls += 1;
      throw Object.assign(new Error('secret provider body'), { exitCode: 1 });
    },
  });
  await assert.rejects(
    runOpeningVoice([
      `--config=${h.configPath}`,
      `--text-base64=${encoded()}`,
      '--execute',
    ], h.deps),
    (error) => error instanceof OpeningVoiceError
      && error.code === 'VOICE_SPEAK_FAILED'
      && !error.message.includes('secret provider body'),
  );
  assert.equal(calls, 1);
});

test('invalid child JSON is reported after one invocation', async () => {
  let calls = 0;
  const h = await harness({
    runChild: async () => {
      calls += 1;
      return { stdout: 'not-json' };
    },
  });
  await assert.rejects(
    runOpeningVoice([
      `--config=${h.configPath}`,
      `--text-base64=${encoded()}`,
    ], h.deps),
    { code: 'INVALID_CHILD_OUTPUT' },
  );
  assert.equal(calls, 1);
});
