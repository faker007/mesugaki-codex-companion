# Repository Management

Read this file only when maintaining, validating, or installing the skill source repository.

## Source and installation boundary

- Keep the Git repository as the source of truth.
- Install the skill by linking the Codex skill path to the repository root.
- Keep personal voice policy in `$HOME/.config/mesugaki-opening-visual/config.json`.
- Keep provider aliases, voice IDs, and credentials in the existing `voice-speak` configuration and Keychain boundary.
- Never commit generated audio, credentials, local archives, `.DS_Store`, or user content.

## Commands

Run from the repository root:

```bash
pnpm run setup
pnpm run doctor
pnpm run check
pnpm run install:link
```

`setup` creates both personal configuration files with mode `0600`, prompts macOS Keychain directly for the selected provider key, installs the repository link, and runs `doctor`. It must never accept an API key through argv, JSON, chat, or a repository file. Existing configs are preserved unless `--force-config` is explicit; forced replacement creates a timestamped mode-0600 backup.

`doctor` checks the platform, Node version, three `voice-speak` entrypoints, both configs, alias mapping, credential source label, install link, and a zero-network dry-run. It never prints a credential value.

`install:link` defaults to `$CODEX_HOME/skills/mesugaki-opening-visual`, or `$HOME/.codex/skills/mesugaki-opening-visual` when `CODEX_HOME` is unset. Set `MESUGAKI_INSTALL_DIR` to test another target.

The installer is intentionally non-destructive. It creates a missing link, accepts an existing link to the same repository, and refuses to replace a directory or a link to another location. Move an existing installation to a reviewed backup before the first link operation.

## Change checklist

1. Keep `SKILL.md` frontmatter limited to `name` and `description`.
2. Put detailed optional behavior in `references/` and deterministic behavior in `scripts/`.
3. Add opener images as versioned siblings in `assets/`; do not overwrite existing assets.
4. Run `pnpm run check` after every code or instruction change.
5. Edit `templates/README.md.tmpl`, then run `pnpm run readme`. Use `pnpm run readme:random` to select a different bundled hero image without changing the template.
6. Run the bundled picker through the installed link to verify the installation boundary.
7. Review `git diff --check`, `git status --short`, and staged file sizes before committing.
