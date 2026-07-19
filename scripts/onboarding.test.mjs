import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runDoctor } from './doctor.mjs';
import {
  buildMesugakiConfig,
  buildVoiceSpeakConfig,
  readTemplate,
  repositoryRoot,
} from './onboarding-lib.mjs';
import { parseLanguageAliases, parseSetupArgs, runSetup } from './setup.mjs';

test('builds Fish Audio and ElevenLabs configs without secret values', async () => {
  const [voiceTemplate, mesugakiTemplate] = await Promise.all([
    readTemplate('codex-voice-speak.config.json'),
    readTemplate('mesugaki-opening-visual.config.json'),
  ]);
  const fish = buildVoiceSpeakConfig(voiceTemplate, 'fish-audio', 'fish-reference');
  assert.equal(fish.defaultProvider, 'FISH_AUDIO');
  assert.equal(fish.defaultVoices.FISH_AUDIO, 'fish-default');
  assert.deepEqual(fish.providers.FISH_AUDIO.envKeys, ['FISH_AUDIO_API_KEY', 'FISH_API_KEY']);
  assert.equal(fish.voices['fish-default'].voiceId, 'fish-reference');

  const eleven = buildVoiceSpeakConfig(voiceTemplate, 'elevenlabs', 'eleven-voice');
  assert.equal(eleven.defaultProvider, 'ELEVENLABS');
  assert.equal(eleven.providers.ELEVENLABS.fastModelId, 'eleven_flash_v2_5');
  assert.equal(eleven.voices['eleven-multilingual'].voiceId, 'eleven-voice');

  const policy = buildMesugakiConfig(mesugakiTemplate, 'elevenlabs');
  assert.equal(policy.voice.alias, 'eleven-multilingual');
  assert.doesNotMatch(JSON.stringify([fish, eleven, policy]), /__\w+__/);
});

test('setup refuses API keys in command arguments', () => {
  assert.throws(() => parseSetupArgs(['--api-key=never']), /forbidden in arguments/);
  assert.throws(() => parseSetupArgs(['--key', 'never']), /forbidden in arguments/);
});

test('setup parses repeatable canonical language aliases', () => {
  const options = parseSetupArgs([
    '--language-alias=zh-Hans:mandarin-simplified',
    '--language-alias',
    'zh-Hant:mandarin-traditional',
  ]);
  assert.deepEqual(parseLanguageAliases(options['language-alias']), {
    'zh-Hans': 'mandarin-simplified',
    'zh-Hant': 'mandarin-traditional',
  });
});

test('setup rejects malformed, unsupported, and duplicate language aliases', () => {
  assert.throws(() => parseLanguageAliases(['zh-CN:voice']), /language-alias/);
  assert.throws(() => parseLanguageAliases(['zh-Hans:']), /language-alias/);
  assert.throws(
    () => parseLanguageAliases(['zh-Hans:first', 'zh-Hans:second']),
    /duplicate language alias/,
  );
});

test('non-interactive setup writes mode-600 configs and doctor accepts the result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-onboarding-'));
  const configRoot = join(root, 'config');
  const voiceRoot = join(root, 'voice-speak');
  const installDir = join(root, 'codex/skills/mesugaki-opening-visual');
  try {
    await mkdir(join(voiceRoot, 'scripts'), { recursive: true });
    for (const script of ['speak.mjs', 'speak-response.mjs', 'replay.mjs']) {
      await writeFile(join(voiceRoot, 'scripts', script), '#!/usr/bin/env node\n');
    }
    const setup = await runSetup([
      '--provider=fish-audio',
      '--voice-id=test-reference',
      `--config-root=${configRoot}`,
      `--voice-speak-root=${voiceRoot}`,
      `--install-dir=${installDir}`,
      '--skip-keychain',
      '--skip-link',
      '--skip-doctor',
      '--language-alias=zh-Hans:fish-default',
      '--language-alias=zh-Hant:fish-default',
      '--no-input',
    ]);
    assert.equal(setup.ok, true);
    for (const file of [
      join(configRoot, 'codex-voice-speak/config.json'),
      join(configRoot, 'mesugaki-opening-visual/config.json'),
    ]) {
      assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.doesNotMatch(await readFile(file, 'utf8'), /test-key|api.?key\s*:/i);
    }
    const openerConfig = JSON.parse(await readFile(
      join(configRoot, 'mesugaki-opening-visual/config.json'),
      'utf8',
    ));
    assert.deepEqual(openerConfig.voice.languageAliases, {
      'zh-Hans': 'fish-default',
      'zh-Hant': 'fish-default',
    });

    await mkdir(join(root, 'codex/skills'), { recursive: true });
    await symlink(repositoryRoot, installDir, 'dir');
    const doctor = await runDoctor(['--skip-dry-run'], {
      env: {
        MESUGAKI_CONFIG_ROOT: configRoot,
        MESUGAKI_VOICE_SPEAK_ROOT: voiceRoot,
        MESUGAKI_INSTALL_DIR: installDir,
        FISH_AUDIO_API_KEY: 'test-only-credential',
      },
      home: root,
    });
    const expectedPlatformFailures = process.platform === 'darwin' ? 0 : 1;
    assert.equal(doctor.ok, expectedPlatformFailures === 0);
    assert.equal(doctor.summary.fail, expectedPlatformFailures);
    assert.equal(doctor.checks.find((check) => check.name === 'platform').status,
      process.platform === 'darwin' ? 'pass' : 'fail');
    assert.equal(doctor.checks.find((check) => check.name === 'credential').detail,
      'env:FISH_AUDIO_API_KEY');
    assert.equal(
      doctor.checks.find((check) => check.name === 'voice-language-alias:zh-Hans').status,
      'pass',
    );
    assert.equal(
      doctor.checks.find((check) => check.name === 'voice-language-alias:zh-Hant').status,
      'pass',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor runs zero-network dry-runs for configured Chinese aliases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-doctor-languages-'));
  const configRoot = join(root, 'config');
  const voiceRoot = join(root, 'voice-speak');
  const installDir = join(root, 'codex/skills/mesugaki-opening-visual');
  const fakeVoiceScript = [
    '#!/usr/bin/env node',
    "const voice = process.argv.find((arg) => arg.startsWith('--voice='))?.slice(8);",
    "process.stdout.write(JSON.stringify({ ok: true, mode: 'dry-run', provider: 'FISH_AUDIO', voiceAlias: voice }));",
    '',
  ].join('\n');
  try {
    await mkdir(join(voiceRoot, 'scripts'), { recursive: true });
    for (const script of ['speak.mjs', 'speak-response.mjs', 'replay.mjs']) {
      await writeFile(join(voiceRoot, 'scripts', script), fakeVoiceScript);
    }
    await runSetup([
      '--provider=fish-audio',
      '--voice-id=test-reference',
      `--config-root=${configRoot}`,
      `--voice-speak-root=${voiceRoot}`,
      `--install-dir=${installDir}`,
      '--skip-keychain',
      '--skip-link',
      '--skip-doctor',
      '--language-alias=zh-Hans:fish-default',
      '--language-alias=zh-Hant:fish-default',
      '--no-input',
    ]);
    await mkdir(join(root, 'codex/skills'), { recursive: true });
    await symlink(repositoryRoot, installDir, 'dir');
    const doctor = await runDoctor([], {
      env: {
        MESUGAKI_CONFIG_ROOT: configRoot,
        MESUGAKI_VOICE_SPEAK_ROOT: voiceRoot,
        MESUGAKI_INSTALL_DIR: installDir,
        FISH_AUDIO_API_KEY: 'test-only-credential',
      },
      home: root,
    });
    assert.equal(doctor.checks.find((check) => check.name === 'dry-run').status, 'pass');
    assert.equal(doctor.checks.find((check) => check.name === 'dry-run:zh-Hans').status, 'pass');
    assert.equal(doctor.checks.find((check) => check.name === 'dry-run:zh-Hant').status, 'pass');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup refuses to preserve a config for a different provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-onboarding-mismatch-'));
  const configRoot = join(root, 'config');
  const voiceRoot = join(root, 'voice-speak');
  try {
    await mkdir(join(voiceRoot, 'scripts'), { recursive: true });
    for (const script of ['speak.mjs', 'speak-response.mjs', 'replay.mjs']) {
      await writeFile(join(voiceRoot, 'scripts', script), '#!/usr/bin/env node\n');
    }
    await runSetup([
      '--provider=fish-audio',
      '--voice-id=fish-reference',
      `--config-root=${configRoot}`,
      `--voice-speak-root=${voiceRoot}`,
      '--skip-keychain',
      '--skip-link',
      '--skip-doctor',
      '--no-input',
    ]);
    await assert.rejects(() => runSetup([
      '--provider=elevenlabs',
      '--voice-id=eleven-voice',
      `--config-root=${configRoot}`,
      `--voice-speak-root=${voiceRoot}`,
      '--skip-keychain',
      '--skip-link',
      '--skip-doctor',
      '--no-input',
    ]), /--force-config/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup accepts a configured environment credential without a Keychain prompt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-onboarding-env-'));
  const voiceRoot = join(root, 'voice-speak');
  try {
    await mkdir(join(voiceRoot, 'scripts'), { recursive: true });
    for (const script of ['speak.mjs', 'speak-response.mjs', 'replay.mjs']) {
      await writeFile(join(voiceRoot, 'scripts', script), '#!/usr/bin/env node\n');
    }
    const result = await runSetup([
      '--provider=fish-audio',
      '--voice-id=fish-reference',
      `--config-root=${join(root, 'config')}`,
      `--voice-speak-root=${voiceRoot}`,
      '--skip-link',
      '--skip-doctor',
      '--no-input',
    ], { env: { FISH_AUDIO_API_KEY: 'test-only-credential' }, home: root });
    assert.equal(result.keychain, 'env:FISH_AUDIO_API_KEY');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup can install the custom pet without changing the credential boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-onboarding-pet-'));
  const voiceRoot = join(root, 'voice-speak');
  const petInstallDir = join(root, 'codex/pets/kurose-runa');
  try {
    await mkdir(join(voiceRoot, 'scripts'), { recursive: true });
    for (const script of ['speak.mjs', 'speak-response.mjs', 'replay.mjs']) {
      await writeFile(join(voiceRoot, 'scripts', script), '#!/usr/bin/env node\n');
    }
    const result = await runSetup([
      '--provider=fish-audio',
      '--voice-id=fish-reference',
      `--config-root=${join(root, 'config')}`,
      `--voice-speak-root=${voiceRoot}`,
      `--pet-install-dir=${petInstallDir}`,
      '--skip-keychain',
      '--skip-link',
      '--skip-doctor',
      '--install-pet',
      '--no-input',
    ], { home: root });
    assert.equal(result.pet.ok, true);
    assert.equal(result.pet.targetDir, petInstallDir);
    assert.deepEqual(
      JSON.parse(await readFile(join(petInstallDir, 'pet.json'), 'utf8')),
      JSON.parse(await readFile(join(repositoryRoot, 'pet-assets/kurose-runa/pet.json'), 'utf8')),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
