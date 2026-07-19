# Opening Voice Configuration

Read this file when changing the automatic opening voice, provider, playback, or mute behavior. Resolve `MESUGAKI_SKILL_ROOT` to the directory containing this skill's `SKILL.md` before using the commands below.

## Config

The personal config is:

```text
$HOME/.config/mesugaki-opening-visual/config.json
```

```json
{
  "version": 1,
  "voice": {
    "enabled": true,
    "provider": "auto",
    "alias": "fish-default",
    "languageAliases": {
      "es": "eleven-multilingual"
    },
    "play": true,
    "waitForPlayback": false,
    "fast": true,
    "maxCharacters": null,
    "emotionPreset": "sharp-mesugaki-asmr",
    "timeoutMs": 30000
  },
  "responseVoice": {
    "enabled": true,
    "scope": "all",
    "segmentBy": "paragraph",
    "autoSpeakContinued": true,
    "ultraMaxSegments": 5,
    "queue": {
      "enabled": true,
      "shareScope": "global",
      "idleTimeoutMs": 600000,
      "maxPendingJobs": 8,
      "prefetchSegments": 1
    }
  },
  "roleplay": {
    "melancholyEmotionPreset": "melancholy-mesugaki-asmr"
  }
}
```

- Set `enabled` to `false` for image-and-text-only openings.
- If this personal config file does not exist, runtime opener and response voice calls return
  `mode: disabled` with zero child, provider, network, or playback requests. `doctor` still reports
  the missing file as an incomplete installation. Invalid JSON and invalid configured values remain
  errors instead of being mistaken for an intentional mute state.
- Change `alias` to any alias in `$HOME/.config/codex-voice-speak/config.json`.
- Use `languageAliases` for opt-in spoken-language routing. Supported keys are `ko`, `ja`, and `es`; omitted keys are unavailable instead of silently falling back. The recommended Spanish mapping is `"es": "eleven-multilingual"`.
- Keep `provider` at `auto` so the alias selects Fish Audio or ElevenLabs.
- Set `play` to `false` to create an MP3 without playing it.
- Keep `waitForPlayback` at `false` to return after `afplay` starts; set it to `true` only when the caller must verify full playback completion.
- Keep `fast` at `true` for Eleven Flash v2.5 or Fish Audio balanced latency.
- Keep `maxCharacters` at `null` to remove the wrapper and ordinary `voice-speak` local caps. Set an integer to restore a local limit. Provider limits, quota, billing, timeout, and the one-request rule still apply.
- Keep `emotionPreset` at `sharp-mesugaki-asmr` for sarcastic, disdainful whispering with one restrained closing reaction. Use `whisper-asmr` for a softer neutral whisper, or `null` to disable automatic tags.
- `fish-default` inherits Fish Audio prosody speed `1`, volume `4`, and `normalize_loudness = true` from `$HOME/.config/codex-voice-speak/config.json`.
- Keep `responseVoice.enabled` at `true` to allow explicitly requested response audio.
- Keep `responseVoice.scope` at `all` to speak each selected paragraph. Set it to `final` to restore one-segment response audio.
- Keep `responseVoice.segmentBy` at `paragraph` for paragraph-by-paragraph playback. Heart mode remains available per invocation.
- Keep `responseVoice.autoSpeakContinued` at `true` to enqueue continued Runa roleplay turns without selecting another opener image.
- `responseVoice.ultraMaxSegments` caps each response at 5 provider requests. A response above the cap fails preflight before synthesis.
- Keep `responseVoice.queue.enabled` at `true` to return after enqueue while one background worker synthesizes and plays sequentially.
- Keep `responseVoice.queue.shareScope` at `global` so every Codex thread owned by the local user shares one socket and worker. Use `thread` only for isolated per-thread playback.
- `responseVoice.queue.idleTimeoutMs` controls worker shutdown after the queue becomes idle. The configured ten minutes allows later turns from any Codex thread to reuse it.
- `responseVoice.queue.maxPendingJobs` limits active plus pending response batches to 8 globally.
- `responseVoice.queue.prefetchSegments` accepts `0` or `1`. Keep it at `1` to synthesize only the next paragraph while the current clip plays; provider and playback concurrency remain one each.
- `roleplay.melancholyEmotionPreset` is selected only by the per-request `--melancholy` modifier. It keeps the ordinary sharp opener default unchanged.

Bundled aliases currently include:

| Alias | Provider | Intended use |
| --- | --- | --- |
| `fish-default` | Fish Audio | Primary configured Fish voice; default |
| `fish-bright-ko` | Fish Audio | Alternate bright Korean voice |
| `fish-soft-ko` | Fish Audio | Softer Korean opener |
| `fish-jp-soft-story` | Fish Audio | Soft Japanese story opener |
| `eleven-multilingual` | ElevenLabs | ElevenLabs multilingual voice |

Add or change provider voice IDs only in the `voice-speak` config. Keep this config limited to aliases and playback policy.

## Invocation Contract

The skill calls:

```text
$MESUGAKI_SKILL_ROOT/scripts/speak-opening.mjs
```

The wrapper reads this config and executes the provider-neutral `voice-speak` CLI with `shell: false`. A `null` character limit forwards `--no-char-limit`; response mode forwards the configured segment policy; the normal configuration forwards `sharp-mesugaki-asmr`, while `--melancholy` forwards the configured `melancholy-mesugaki-asmr`. Openers make at most one direct child invocation. Queued response calls make zero foreground provider or network requests and return an enqueue receipt. Detached opener playback returns after the player starts and records `playback.status = "started"`.

Per-request instructions can override the language, alias, provider, fast mode, and playback. `--language=es` selects `voice.languageAliases.es`; an explicit `--voice=<alias>` takes precedence over that mapping. A missing mapping fails before any child or provider request. A user request for `silent`, `조용히`, `이미지만`, or `텍스트만` must skip the wrapper entirely.

## Response Invocation Contract

The configured response wrapper is:

```text
$MESUGAKI_SKILL_ROOT/scripts/speak-response.mjs
```

Configured global queue invocation:

```bash
node "$MESUGAKI_SKILL_ROOT/scripts/speak-response.mjs" \
  --queue \
  --ultra \
  --segment-by=paragraph \
  --text-base64=<full-response-base64-utf8> \
  --execute \
  --json
```

Explicit ultra invocation:

```bash
node "$MESUGAKI_SKILL_ROOT/scripts/speak-response.mjs" \
  --ultra \
  --text-base64=<full-response-base64-utf8> \
  --execute \
  --json
```

With `shareScope: global`, the wrapper derives one non-reversible 24-character local-user key independent of `CODEX_THREAD_ID` and sends every finalized response to the same mode-0600 Unix socket. No response text or raw task id is written to disk. The first enqueue starts a detached worker; later calls from any Codex thread reuse it. The worker forwards the configured cap, validates every selected paragraph with zero network calls, then synthesizes and fully plays the paragraphs sequentially. With one-segment prefetch enabled, the next synthesis overlaps current playback while provider and player concurrency remain one each. It never retries or switches providers. A failure halts that worker, drops pending jobs, and closes the socket so a later response can start fresh. The worker exits after the configured idle timeout.

Inspect only redacted in-memory queue state with:

```bash
node "$MESUGAKI_SKILL_ROOT/scripts/response-queue.mjs" \
  --status \
  --scope=global \
  --json
```

Pass the enqueue receipt token as `--job=<jobToken>` to inspect one job. Repeated enqueue delivery with the same token is idempotent. The socket returns only redacted phase and segment counters, retains at most 16 recent terminal statuses in memory, and never exposes response text or provider arguments.

## Replay Contract

Replay bypasses both synthesis wrappers and calls the global replay CLI with `--last --execute --detach-playback --json`. It reuses the newest recognized MP3 and must report zero provider requests, zero network requests, and zero new artifacts. Replay failure must never trigger fresh synthesis.
