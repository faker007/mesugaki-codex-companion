import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const PROVIDERS = Object.freeze({
  FISH_AUDIO: Object.freeze({
    inputNames: ['fish', 'fish-audio', 'fish_audio'],
    alias: 'fish-default',
    modelId: 's2.1-pro',
    keychainService: 'codex-voice-speak-fish-audio-api-key',
    envKeys: ['FISH_AUDIO_API_KEY', 'FISH_API_KEY'],
    providerConfig: Object.freeze({
      modelId: 's2.1-pro',
      envKeys: Object.freeze(['FISH_AUDIO_API_KEY', 'FISH_API_KEY']),
      keychainServices: Object.freeze([
        'codex-voice-speak-fish-audio-api-key',
        'codex-fish-audio-api-key',
      ]),
      latency: 'normal',
      fastLatency: 'balanced',
      sampleRate: 44100,
      mp3Bitrate: 128,
      prosody: Object.freeze({ speed: 1, volume: 4, normalizeLoudness: true }),
    }),
  }),
  ELEVENLABS: Object.freeze({
    inputNames: ['eleven', 'elevenlabs', 'eleven-labs'],
    alias: 'eleven-multilingual',
    modelId: 'eleven_multilingual_v2',
    keychainService: 'codex-voice-speak-elevenlabs-api-key',
    envKeys: ['ELEVENLABS_API_KEY'],
    providerConfig: Object.freeze({
      modelId: 'eleven_multilingual_v2',
      fastModelId: 'eleven_flash_v2_5',
      outputFormat: 'mp3_44100_128',
      envKeys: Object.freeze(['ELEVENLABS_API_KEY']),
      keychainServices: Object.freeze([
        'codex-voice-speak-elevenlabs-api-key',
        'codex-elevenlabs-api-key',
      ]),
    }),
  }),
});

export function normalizeProvider(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  for (const [provider, definition] of Object.entries(PROVIDERS)) {
    if (provider.toLowerCase() === normalized || definition.inputNames.includes(normalized)) {
      return provider;
    }
  }
  throw new Error('provider must be fish-audio or elevenlabs');
}

export function providerDefinition(provider) {
  const normalized = normalizeProvider(provider);
  return { provider: normalized, ...PROVIDERS[normalized] };
}

function replaceTemplateValue(value, replacements) {
  if (Array.isArray(value)) return value.map((entry) => replaceTemplateValue(entry, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      replacements[key] ?? key,
      replaceTemplateValue(entry, replacements),
    ]));
  }
  return typeof value === 'string' ? replacements[value] ?? value : value;
}

export function buildVoiceSpeakConfig(template, provider, voiceId) {
  const definition = providerDefinition(provider);
  const normalizedVoiceId = String(voiceId ?? '').trim();
  if (!normalizedVoiceId) throw new Error('voice ID or Fish Audio reference ID is required');
  const config = replaceTemplateValue(template, {
    __PROVIDER__: definition.provider,
    __ALIAS__: definition.alias,
    __VOICE_ID__: normalizedVoiceId,
    __MODEL_ID__: definition.modelId,
  });
  config.providers[definition.provider] = structuredClone(definition.providerConfig);
  return config;
}

export function buildMesugakiConfig(template, provider, languageAliases = {}) {
  const definition = providerDefinition(provider);
  const config = replaceTemplateValue(template, { __ALIAS__: definition.alias });
  config.voice.languageAliases = { ...languageAliases };
  return config;
}

export async function readTemplate(name) {
  const path = resolve(repositoryRoot, 'templates', name);
  return JSON.parse(await readFile(path, 'utf8'));
}

export function resolveOnboardingPaths({ env = process.env, home = homedir() } = {}) {
  const configRoot = resolve(env.MESUGAKI_CONFIG_ROOT ?? join(home, '.config'));
  const codexRoot = resolve(env.CODEX_HOME ?? join(home, '.codex'));
  return {
    repositoryRoot,
    configRoot,
    mesugakiConfig: join(configRoot, 'mesugaki-opening-visual/config.json'),
    voiceSpeakConfig: join(configRoot, 'codex-voice-speak/config.json'),
    voiceSpeakRoot: resolve(
      env.MESUGAKI_VOICE_SPEAK_ROOT ?? join(home, '.agents/skills/voice-speak'),
    ),
    installDir: resolve(
      env.MESUGAKI_INSTALL_DIR ?? join(codexRoot, 'skills/mesugaki-opening-visual'),
    ),
  };
}
