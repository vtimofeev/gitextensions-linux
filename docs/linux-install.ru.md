# Сборка и установка в Linux

[English](linux-install.md) | Русский

## Готовая сборка

Для Ubuntu 22.04 и сборки с WebKitGTK 4.0:

```sh
sudo apt install git libgtk-3-0 libwebkit2gtk-4.0-37
mkdir -p gitextensions-linux-release
tar -xzf gitextensions-linux-amd64.tar.gz -C gitextensions-linux-release
cd gitextensions-linux-release
./build/linux/install.sh
```

Установщик работает без `sudo`: кладёт бинарник в `~/.local/bin`, launcher и иконки в `${XDG_DATA_HOME:-~/.local/share}`, ярлык — в пользовательский каталог рабочего стола.
Go и Node.js для запуска готовой сборки не нужны. Архитектура и ABI GTK/WebKitGTK должны совпадать с целевой системой.

```sh
~/.local/bin/gitextensions-linux
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

Перед повторной установкой закройте приложение. Новое имя иконки включает хеш её содержимого, чтобы GNOME не использовал старую картинку из кеша.

## GNOME / Ubuntu

Если ярлык на рабочем столе требует разрешения, нажмите правой кнопкой **Разрешить запуск / Allow Launching**.
Если файлы рабочего стола вообще не видны, проверьте расширение **Desktop Icons NG (DING)**.
Отключённый в XDG-настройках рабочий стол пропускается; launcher меню устанавливается всегда.
Меню запускает бинарник напрямую из `~/.local/bin`, даже если этого каталога нет в `PATH`.

## Сборка из исходников

Нужны Go 1.25+, Node.js LTS и npm. Для Ubuntu 22.04:

```sh
sudo apt install git build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
wails build
```

Команды выполняются из корня проекта. Результат — `build/bin/gitextensions-linux` со встроенным интерфейсом и PNG-иконкой.
На системах с WebKitGTK 4.1 установите `libwebkit2gtk-4.1-dev` и собирайте командой `wails build -tags webkit2_41`.
Подробности других дистрибутивов: [Wails installation](https://wails.io/docs/gettingstarted/installation/).

## Перенос и исходники

После сборки, из корня Git-репозитория:

```sh
python3 build/linux/package.py
```

Архив `build/bin/gitextensions-linux-amd64.tar.gz` содержит установщик, иконки, английские и русские инструкции, `LICENSE.md`, сведения об авторах, лицензии зависимостей и снимок исходников в `source/`.
Для изменения и повторной сборки приложения перейдите в `source/` и выполните инструкции выше.
Передавайте исходники вместе с бинарником: [условия GPL и заимствования](../NOTICE.ru.md).
Для упаковки нужны Python 3, Git, Go и установленные npm-зависимости.

## Удаление

```sh
rm -f ~/.local/bin/gitextensions-linux
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/applications/gitextensions-linux.desktop"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}"/icons/hicolor/256x256/apps/gitextensions-linux*.png
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}"/icons/hicolor/scalable/apps/gitextensions-linux*.svg
```

Удалите также `gitextensions-linux.desktop` из своего каталога рабочего стола.
Репозитории и их Git-настройки установщик не изменяет.
