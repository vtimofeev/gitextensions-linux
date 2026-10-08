# Working on the project

English | [Русский](AGENTS.ru.md)

Git Extensions Linux is a local desktop app built with Go 1.25, Wails 2, Vue 3 and TypeScript. The UI uses PrimeVue, SCSS and `vue-facing-decorator`.

## Structure

| Path | Purpose |
| --- | --- |
| `main.go`, `app.go` | Window startup, CLI and the Go facade for Wails |
| `internal/gitclient/` | Git commands, models, file inspection and integration tests |
| `frontend/src/api/` | Typed adapter for the Go bridge |
| `frontend/src/store/` | Repository state and local settings |
| `frontend/src/components/` | Dialogs, panels and file viewers |
| `frontend/src/domain/`, `graph/`, `diff/` | Presentation logic, graph and diff documents |
| `frontend/src/i18n/`, `theme/` | EN/RU translations, themes and styles |
| `frontend/tests/` | Unit, browser and performance checks |
| `frontend/wailsjs/` | Generated Wails bindings |
| `frontend/public/appicon.svg`, `build/appicon.png` | Source icon and PNG for the native window |
| `build/linux/` | Installer, launcher and packaging |
| `docs/` | Short guides and screenshots |

## Commands

From the root: `wails dev`, `wails build`, `go test ./...`.
From `frontend`: `npm ci`, `npm test`, `npm run build`.
Browser checks: `npm run test:e2e -- --grep-invert screenshots`.
Package after building: `python3 build/linux/package.py`.
See [docs/development.md](docs/development.md).

## Change rules

- Keep the class-based component and store style. Add new UI text in both EN and RU.
- Put Git operations in `internal/gitclient`. Pass arguments separately and validate paths and refs. Do not run user text as shell code.
- Async loads must handle changes of repository, file and revision. Late responses must not update a newer screen.
- Generate Wails bindings after changing Go models. Do not edit generated bindings by hand.
- Do not commit build or test output. Tests named `screenshots` overwrite images in `docs/screenshots`; run them when updating documentation.
- The project is GPL-3.0-only. Keep license notices, original credits and `NOTICE.md` up to date. Package sources with the release.
- Do not undo other people's edits or existing changes. Check the affected scenarios; see the development guide for the usual checks.
- Keep English documentation in `.md` and Russian translations next to it in `.ru.md`. Update both versions and their links together. Keep `LICENSE.md` unchanged.

<!-- BEGIN agent-harness -->
# Global Agent Harness

## Available agents

- `ah-analyzer`: codebase analysis and measurements.
- `ah-requirement-quality-lead`: requirements analysis and clarification.
- `ah-fullstack-lead`: fullstack implementation across DevOps, Go, Vue, JS/TS and Node.js.
- `ah-architect-contracts`: API, event and schema design.
- `ah-architect-devops`, `ah-architect-go`, `ah-architect-js`, `ah-architect-python`, `ah-architect-vue3`: architecture and task preparation for their respective stacks.
- `ah-implementer-devops`, `ah-implementer-go`, `ah-implementer-js`, `ah-implementer-python`, `ah-implementer-vue3`: implementation of prepared tasks for their respective stacks.
- `ah-validator`: independent architecture, quality and readability review.

These agents are available on explicit user request. Their rules are loaded with the selected role.
<!-- END agent-harness -->
