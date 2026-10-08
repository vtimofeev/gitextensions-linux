# Разработка

[English](development.md) | Русский

Структура проекта и правила изменений: [AGENTS.ru.md](../AGENTS.ru.md).
Используйте Go 1.25+, Node.js LTS, npm и Wails 2.15.0. Системные зависимости: [linux-install.md](linux-install.ru.md).

## Запуск и сборка

Из корня репозитория:

```sh
wails dev
wails dev -appargs '--repo /path/to/repository'
wails build
```

`wails build` устанавливает зависимости интерфейса, генерирует bindings, собирает frontend и встраивает его в бинарник.
`npm run dev` из `frontend` запускает только браузерный интерфейс: настоящие Git-операции требуют Wails-моста.
Браузерные тесты предоставляют отдельный mock-мост.

## Проверки

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

Go-тесты работают с временными репозиториями. Браузерные тесты проверяют интерфейс, аргументы моста и асинхронные переходы.
Playwright также может использовать системный Chrome/Chromium; путь задаётся через `PLAYWRIGHT_CHROMIUM_PATH`.
Для локальных тестов нужны доступные порты 5173 и 5174.

## Производительность и скриншоты

Из `frontend`:

```sh
npx playwright test -c playwright.perf.config.ts
PERF_CPU_THROTTLE=4 npx playwright test -c playwright.perf.config.ts working-tree.perf.ts
npm run test:e2e -- --grep screenshots
```

Performance-тесты используют production bundle и синтетические данные; это измерения интерфейса, а не скорости Git.
Последняя команда обновляет иллюстрации в `docs/screenshots`; проверяйте их diff перед коммитом.

## Релиз

```sh
wails build
python3 build/linux/package.py
```

Готовый архив содержит бинарник, установщик, иконки, документацию, исходники и лицензионные уведомления.
Исходники берутся из текущего рабочего дерева, включая новые файлы проекта; `.git`, зависимости, кеши и результаты тестов в снимок не попадают.
Перед публичным релизом проверьте состав архива и опубликуйте точную версию исходников вместе со сборкой.

Английские документы имеют расширение `.md`, русские версии лежат рядом в `.ru.md`. Обновляйте обе версии вместе.
