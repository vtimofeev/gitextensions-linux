# Работа с проектом

[English](AGENTS.md) | Русский

Git Extensions Linux — локальное desktop-приложение на Go 1.25, Wails 2, Vue 3 и TypeScript. Интерфейс использует PrimeVue, SCSS и `vue-facing-decorator`.

## Структура

| Путь | Назначение |
| --- | --- |
| `main.go`, `app.go` | Запуск окна, CLI и Go-фасад для Wails |
| `internal/gitclient/` | Команды Git, модели, просмотр файлов и интеграционные тесты |
| `frontend/src/api/` | Типизированный адаптер Go-моста |
| `frontend/src/store/` | Состояние репозитория и локальные настройки |
| `frontend/src/components/` | Окна, панели и просмотрщики |
| `frontend/src/domain/`, `graph/`, `diff/` | Логика представления, граф и документы diff |
| `frontend/src/i18n/`, `theme/` | EN/RU переводы, темы и стили |
| `frontend/tests/` | Unit, браузерные и performance-проверки |
| `frontend/wailsjs/` | Сгенерированные Wails bindings |
| `frontend/public/appicon.svg`, `build/appicon.png` | Исходная иконка и PNG для native-окна |
| `build/linux/` | Установка, launcher и упаковка |
| `docs/` | Короткие инструкции и скриншоты |

## Команды

Из корня: `wails dev`, `wails build`, `go test ./...`.
Из `frontend`: `npm ci`, `npm test`, `npm run build`.
Браузерные проверки: `npm run test:e2e -- --grep-invert screenshots`.
Упаковка после сборки: `python3 build/linux/package.py`.
Подробнее: [docs/development.ru.md](docs/development.ru.md).

## Правила изменений

- Сохранять текущий стиль компонентов и store с классами; новые подписи добавлять в EN и RU.
- Git-операции реализовывать в `internal/gitclient`, передавать аргументы отдельно, проверять пути и refs. Не выполнять пользовательский текст как shell-код.
- При асинхронных загрузках учитывать смену репозитория, файла и ревизии; запоздавшие ответы не должны менять новый экран.
- Изменения Go-моделей требуют обновления bindings через Wails. Не редактировать их вручную.
- Не добавлять результаты сборки и тестов в Git. Тесты `screenshots` перезаписывают изображения в `docs/screenshots`; запускать их при обновлении документации.
- Проект — GPL-3.0-only. Сохранять лицензионные пометки, атрибуцию оригинала и сведения в `NOTICE.md`; упаковывать исходники вместе со сборкой.
- Не отменять чужие или уже существовавшие изменения. Проверять только затронутые сценарии; общий порядок проверок приведён в документации.

- Основные документы вести на английском в `.md`, русские версии — рядом в `.ru.md`. Обновлять обе версии и ссылки вместе. Текст `LICENSE.md` не менять.

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
