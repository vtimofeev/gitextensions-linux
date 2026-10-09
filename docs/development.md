# Development

English | [Русский](development.ru.md)

See [AGENTS.md](../AGENTS.md) for the project structure and change rules.
Use Go 1.25+, Node.js LTS, npm and Wails 2.15.0. System dependencies are listed in [linux-install.md](linux-install.md).

## Run and build

From the project root:

```sh
wails dev
wails dev -appargs '--repo /path/to/repository'
wails build
```

`wails build` installs frontend dependencies, generates bindings, builds the frontend and embeds it in the binary.
Running `npm run dev` from `frontend` starts only the browser UI. Real Git operations need the Wails bridge.
Browser tests use a separate mock bridge.

## Checks

```sh
go test ./...
go test -race ./internal/gitclient
cd frontend
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e -- --grep-invert screenshots
```

Go tests use temporary repositories. Browser tests check the UI, bridge arguments and async navigation.
Playwright can also use an installed Chrome/Chromium. Set its path with `PLAYWRIGHT_CHROMIUM_PATH`.
Local tests need ports 5173 and 5174 to be available.

## Performance and screenshots

From `frontend`:

```sh
npx playwright test -c playwright.perf.config.ts
PERF_CPU_THROTTLE=4 npx playwright test -c playwright.perf.config.ts working-tree.perf.ts
npm run test:e2e -- --grep screenshots
```

Performance tests use a production build and synthetic data. They measure the UI, not Git speed.
The last command updates images in `docs/screenshots`. Review the image changes before committing.

## Release

```sh
wails build
python3 build/linux/package.py
```

The archive puts `gitextensions-linux`, `install.sh` and a short EN/RU README at the top level. Icons and the menu launcher are in `assets/`; installation and user guides are in `docs/`. Sources and license notices remain in `source/` and `licenses/`.
Sources come from the current working tree, including new project files. The source snapshot excludes `.git`, dependencies, caches and test output.
Before a public release, check the archive contents and publish the exact sources with the build.
English guides use `.md`; Russian versions sit next to them as `.ru.md`. Keep both versions up to date.

## External Git tools

Commands and executable paths are read only from global/system Git config; repository-local commands are ignored. The settings screen saves executable paths and exit-code trust in the global config, and the chosen tool name in the repository config.
For a custom tool, configure a command you trust, for example:

```sh
git config --global mergetool.custom.cmd 'meld "$LOCAL" "$REMOTE" "$MERGED"'
```

External tool sessions allow repository reads. Close the tool before changing the repository. Long Git mutations have a 30-minute timeout; reads have a 3-minute timeout. Cancellation terminates the Git process group. Reads also remain available during long Git mutations; another mutation is rejected until completion.

Merge tools receive private snapshots and edit the worktree file. The original is saved beside it as `.gitextensions-merge-backup-*`; the result/error reports the backup path. Backups survive failures and cancellation. Successful runs remove them only when `mergetool.keepBackup=false`. If another Git client changes the conflict index while the tool is open, automatic staging stops for manual inspection.
