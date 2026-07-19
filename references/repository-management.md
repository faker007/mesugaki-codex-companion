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
pnpm run setup:all
pnpm run doctor
pnpm run check
pnpm run install:link
pnpm run install:pet
pnpm run validate:pet
```

`setup` creates both personal configuration files with mode `0600`, prompts macOS Keychain directly for the selected provider key, installs the repository link, and runs `doctor`. It must never accept an API key through argv, JSON, chat, or a repository file. Existing configs are preserved unless `--force-config` is explicit; forced replacement creates a timestamped mode-0600 backup.

`setup:all` keeps the same credential boundary, then runs the non-destructive custom pet installer. Use `--force-pet` only after reviewing an existing different pet package.

`doctor` checks the platform, Node version, three `voice-speak` entrypoints, both configs, alias mapping, credential source label, install link, and a zero-network dry-run. It never prints a credential value.

`install:link` defaults to `$CODEX_HOME/skills/mesugaki-opening-visual`, or `$HOME/.codex/skills/mesugaki-opening-visual` when `CODEX_HOME` is unset. Set `MESUGAKI_INSTALL_DIR` to test another target.

`install:pet` defaults to `$CODEX_HOME/pets/kurose-runa`, or `$HOME/.codex/pets/kurose-runa` when `CODEX_HOME` is unset. It accepts an identical existing package and refuses to replace different files unless `--force` is explicit.

`validate:pet` independently checks the custom pet manifest, image format, `1536×1872` dimensions, alpha channel, 20 MiB limit, 57 used cells, and 15 fully transparent unused cells.

The installer is intentionally non-destructive. It creates a missing link, accepts an existing link to the same repository, and refuses to replace a directory or a link to another location. Move an existing installation to a reviewed backup before the first link operation.

## Change checklist

1. Keep `SKILL.md` frontmatter limited to `name` and `description`.
2. Put detailed optional behavior in `references/` and deterministic behavior in `scripts/`.
3. Add opener images as versioned siblings in `assets/`; do not overwrite existing assets.
4. Run `pnpm run check` after every code or instruction change. This includes the repository-native pet validator.
5. Edit all five `templates/README.*.md.tmpl` locale sources when shared behavior changes, then run `pnpm run readme`. Use `pnpm run readme:random` to select one different bundled hero image for every locale without changing the templates.
6. Run the bundled picker through the installed link to verify the installation boundary.
7. Review `git diff --check`, `git status --short`, and staged file sizes before committing.
