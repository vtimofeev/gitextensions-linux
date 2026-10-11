# Сборка и запуск на macOS (Intel)

[English](macos-install.md) | Русский

Эти команды предназначены для локальной сборки на Intel Mac (`darwin/amd64`). Go-часть проекта прошла проверку кросс-компиляции для этой платформы; полную сборку `.app` и работу интерфейса ещё нужно проверить на Mac.

## Требования

- macOS 12 Monterey или новее: это [минимальная версия для Go 1.25](https://go.dev/doc/go1.25#darwin).
- [Go](https://go.dev/dl/) 1.25 или новее, версия для macOS x86-64.
- [Node.js](https://nodejs.org/en/download) LTS с npm: используйте Node.js 22.12+ или более новую LTS-версию.
- Git и исходники проекта.
- Xcode Command Line Tools, необходимые для [Wails](https://wails.io/docs/gettingstarted/installation/).

Установите инструменты Apple и дождитесь завершения установки:

```sh
xcode-select --install
```

Проверьте установленные инструменты в терминале:

```sh
uname -m
go version
node --version
npm --version
git --version
```

На Intel Mac команда `uname -m` выводит `x86_64`.

## Сборка

Откройте терминал в корне проекта, где находятся `wails.json` и `go.mod`, и выполните:

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
wails build -platform darwin/amd64
```

Если `wails doctor` сообщает об отсутствующих обязательных зависимостях, установите их перед сборкой.
Wails сам запускает `npm ci`, генерирует bindings Go-моста, собирает интерфейс и упаковывает его вместе с бинарником и иконкой.
Результат — `build/bin/gitextensions-linux.app`; на macOS приложение сохраняет название проекта.
Параметры платформ описаны в [документации Wails CLI](https://wails.io/docs/reference/cli/).

## Запуск и обновление

Из корня проекта:

```sh
open build/bin/gitextensions-linux.app
```

Чтобы при запуске открыть определённый репозиторий:

```sh
open build/bin/gitextensions-linux.app --args --repo "/path/to/repository"
```

Также можно перетащить `.app` в папку **Программы** и запускать через Finder.
Перед пересборкой или заменой установленной копии закройте приложение. Git нужен для работы с репозиториями; Go и Node.js нужны только для сборки.

Запуск в режиме разработки и проверки описаны в [руководстве разработчика](development.ru.md). Скрипты в `build/linux/` упаковывают и устанавливают Linux-сборки; для macOS используйте `.app`.
