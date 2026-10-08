# Авторство и заимствования

[English](NOTICE.md) | Русский

Git Extensions Linux распространяется под **GPL-3.0-only**. Полный текст: [LICENSE.md](LICENSE.md).
Программа предоставляется без гарантий; использование, изменение и распространение разрешены на условиях GPL.

## Оригинальный Git Extensions

Спасибо [создателям и участникам Git Extensions](https://github.com/gitextensions/gitextensions/graphs/contributors).
Авторские права на заимствованные материалы принадлежат их первоначальным правообладателям; их лицензия сохранена.

| Материалы этого проекта | Источник в Git Extensions |
| --- | --- |
| `frontend/src/graph/layout.ts` | `RevisionGraph.cs`, `RevisionGraphRow.cs` |
| `frontend/tests/graph.test.ts`, `frontend/tests/graph-fixtures/*.txt` | `RevisionGraphTests.cs` и его snapshot fixtures |

Источники: [алгоритм графа](https://github.com/gitextensions/gitextensions/tree/master/src/app/GitUI/UserControls/RevisionGrid/Graph), [тесты](https://github.com/gitextensions/gitextensions/tree/master/tests/app/UnitTests/GitUI.Tests/UserControls/RevisionGrid/Graph), [лицензия оригинала](https://github.com/gitextensions/gitextensions/blob/master/LICENSE.md).

Это изменённая Linux/TypeScript-адаптация, а не исходная Windows-программа: граф отображается через Canvas и Web Worker, desktop-оболочка реализована на Go/Wails.
Оригинал также служит ориентиром для цветов подписей refs (`frontend/src/graph/ref-labels.ts`) и инициалов авторов (`frontend/src/domain/author-color.ts`).
Дата оформления изменений и этой атрибуции: **2026-10-08**. Особенности адаптации: [docs/commit-graph.md](docs/commit-graph.ru.md).
Это самостоятельный проект; благодарность не означает одобрение или поддержку со стороны авторов оригинала.

## Новая реализация

Copyright © 2026 Vasily Timofeev и участники Git Extensions Linux.
Проект создан с помощью нейросетей. Это не отменяет условия лицензий использованных материалов.

## Зависимости и сборки

Go- и npm-зависимости сохраняют собственные лицензии. Версии закреплены в `go.mod`, `go.sum` и `frontend/package-lock.json`.
Скрипт `build/linux/package.py` добавляет в релиз снимок исходников проекта и тексты лицензий установленных зависимостей, участвующих в сборке.
GTK/WebKitGTK и Git устанавливаются отдельно из пакетов системы.

При передаче бинарника также передавайте исходники именно этой версии либо предоставляйте равнозначный бесплатный доступ к ним, как требует [GPL, раздел 6](https://github.com/gitextensions/gitextensions/blob/master/LICENSE.md).
Наличие одного файла `LICENSE.md` в архиве не заменяет предоставление исходников.
