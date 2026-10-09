# Сборка и установка в Linux

[English](linux-install.md) | Русский

## Готовая сборка

Установите библиотеки для вашего дистрибутива и ABI WebKitGTK, с которым собран архив:

| Дистрибутив | Пакеты для запуска | ABI |
| --- | --- | --- |
| Ubuntu 22.04 | `sudo apt install git libgtk-3-0 libwebkit2gtk-4.0-37` | 4.0 |
| Debian 12 | `sudo apt install git libgtk-3-0 libwebkit2gtk-4.1-0` | 4.1 |
| Debian 13 / Ubuntu 24.04+ | `sudo apt install git libgtk-3-0t64 libwebkit2gtk-4.1-0` | 4.1 |
| Fedora 40+ | `sudo dnf install git gtk3 webkit2gtk4.1` | 4.1 |
| Arch / Manjaro | `sudo pacman -Syu git gtk3 webkit2gtk-4.1` | 4.1 |
| openSUSE | `sudo zypper install git libgtk-3-0 libwebkit2gtk-4_1-0` | 4.1 |

Названия пакетов сверены с [Wails](https://wails.io/docs/guides/linux-distro-support/) и [пакетом GTK в Debian 13](https://packages.debian.org/trixie/libgtk-3-0t64).
Бинарник для Ubuntu 22.04 использует ABI 4.0. Установка библиотек 4.1 не делает его совместимым: нужна соответствующая сборка или сборка из исходников на целевой системе.
Архитектура процессора и glibc тоже должны быть совместимы. Бинарник, собранный на новом дистрибутиве, может не запуститься на старом.

Распакуйте архив в отдельную папку и установите приложение без `sudo`:

```sh
mkdir -p gitextensions-linux-release
tar -xzf gitextensions-linux-amd64.tar.gz -C gitextensions-linux-release
cd gitextensions-linux-release
./install.sh
```

Бинарник попадёт в `~/.local/bin`, launcher и иконки — в `${XDG_DATA_HOME:-~/.local/share}`. Ярлык рабочего стола устанавливается, если этот каталог включён в настройках XDG.
Go и Node.js для запуска готовой сборки не нужны.

```sh
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

## GNOME и обновления

Перед повторной установкой закройте приложение. Имя иконки фиксировано: `gitextensions-linux`, как у desktop-файла и идентификатора окна GTK.
Установщик обновляет кеши launcher и иконок. Если в панели остался стандартный значок, удалите старое закрепление, запустите **Git Extensions Linux** из меню приложений и закрепите заново. Если GNOME сохранил кеш, выйдите из сеанса и войдите снова.

Для ярлыка рабочего стола нажмите правой кнопкой **Разрешить запуск / Allow Launching**. В Ubuntu для отображения файлов рабочего стола может понадобиться **Desktop Icons NG (DING)**.
Launcher работает, даже если `~/.local/bin` отсутствует в `PATH`.

## Сборка из исходников

Установите Go 1.25+, Node.js LTS и npm, а также системные пакеты для сборки:

| Дистрибутив | Пакеты для сборки |
| --- | --- |
| Ubuntu 22.04 (ABI 4.0) | `sudo apt install git build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev` |
| Debian 12/13 / Ubuntu 24.04+ (ABI 4.1) | `sudo apt install git build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` |
| Fedora (ABI 4.1) | `sudo dnf install git gcc gcc-c++ make pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel` |
| Arch / Manjaro (ABI 4.1) | `sudo pacman -Syu git base-devel gtk3 webkit2gtk-4.1` |

Подробности: [WebKit для сборки в Fedora](https://packages.fedoraproject.org/pkgs/webkitgtk/webkit2gtk4.1-devel/) и [пакет Arch](https://archlinux.org/packages/extra/x86_64/webkit2gtk-4.1/). Для openSUSE и других дистрибутивов сверяйтесь с [инструкцией Wails](https://wails.io/docs/gettingstarted/installation/); `wails doctor` проверяет системные зависимости.

Из корня проекта:

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
wails build -tags webkit2_41
```

Для ABI 4.0 замените последнюю команду на `wails build`.
Результат — `build/bin/gitextensions-linux` со встроенным интерфейсом и PNG-иконкой. Установка: `./build/linux/install.sh`.

## Перенос и исходники

После сборки, из корня Git-репозитория:

```sh
python3 build/linux/package.py
```

`build/bin/gitextensions-linux-amd64.tar.gz` содержит `gitextensions-linux` и `install.sh` в корне, краткий README на EN/RU, иконки в `assets/`, инструкции по установке и использованию в `docs/`, `LICENSE.md`, атрибуцию, лицензии зависимостей и соответствующие сборке исходники в `source/`.
Для пересборки откройте `source/` и выполните команды выше. Передавайте исходники вместе с бинарником: [GPL и адаптированный код](../NOTICE.ru.md).
Упаковке нужны Python 3, Git, Go и установленные npm-зависимости.

## Удаление

```sh
rm -f ~/.local/bin/gitextensions-linux
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/applications/gitextensions-linux.desktop"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}"/icons/hicolor/256x256/apps/gitextensions-linux*.png
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}"/icons/hicolor/scalable/apps/gitextensions-linux*.svg
```

Также удалите `gitextensions-linux.desktop` из каталога рабочего стола.
Установщик не меняет репозитории и их настройки Git.
