# Build and install on Linux

English | [Русский](linux-install.ru.md)

## Install a release

Install the runtime libraries for your distribution and the archive's WebKitGTK ABI:

| Distribution | Runtime packages | ABI |
| --- | --- | --- |
| Ubuntu 22.04 | `sudo apt install git libgtk-3-0 libwebkit2gtk-4.0-37` | 4.0 |
| Debian 12 | `sudo apt install git libgtk-3-0 libwebkit2gtk-4.1-0` | 4.1 |
| Debian 13 / Ubuntu 24.04+ | `sudo apt install git libgtk-3-0t64 libwebkit2gtk-4.1-0` | 4.1 |
| Fedora 40+ | `sudo dnf install git gtk3 webkit2gtk4.1` | 4.1 |
| Arch / Manjaro | `sudo pacman -Syu git gtk3 webkit2gtk-4.1` | 4.1 |
| openSUSE | `sudo zypper install git libgtk-3-0 libwebkit2gtk-4_1-0` | 4.1 |

Package names follow [Wails](https://wails.io/docs/guides/linux-distro-support/), with Debian 13's [GTK package](https://packages.debian.org/trixie/libgtk-3-0t64).
The Ubuntu 22.04 binary uses ABI 4.0. Installing ABI 4.1 does not make a 4.0 binary compatible: use a matching release or build on the target system.
CPU architecture and glibc compatibility must also match. A build on a newer distribution may not run on an older one.

Extract into a separate folder, then install without `sudo`:

```sh
mkdir -p gitextensions-linux-release
tar -xzf gitextensions-linux-amd64.tar.gz -C gitextensions-linux-release
cd gitextensions-linux-release
./install.sh
```

The binary goes to `~/.local/bin`; the launcher and icons go under `${XDG_DATA_HOME:-~/.local/share}`. A desktop shortcut is also installed if enabled in XDG settings.
Go and Node.js are not needed to run a release.

```sh
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

## GNOME and updates

Close the app before reinstalling. The icon has a fixed name, `gitextensions-linux`, matching the desktop file and GTK window identity.
The installer refreshes desktop/icon caches. If the dock still shows a generic icon, remove the old favorite, launch **Git Extensions Linux** from the application menu, then pin it again. Log out and back in if GNOME retains its cache.

For a desktop shortcut, right-click and choose **Allow Launching**. Ubuntu may also need **Desktop Icons NG (DING)** to display desktop files.
The launcher works even when `~/.local/bin` is absent from `PATH`.

## Build from source

Install Go 1.25+, Node.js LTS and npm, plus native build packages:

| Distribution | Build packages |
| --- | --- |
| Ubuntu 22.04 (ABI 4.0) | `sudo apt install git build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev` |
| Debian 12/13 / Ubuntu 24.04+ (ABI 4.1) | `sudo apt install git build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` |
| Fedora (ABI 4.1) | `sudo dnf install git gcc gcc-c++ make pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel` |
| Arch / Manjaro (ABI 4.1) | `sudo pacman -Syu git base-devel gtk3 webkit2gtk-4.1` |

See [Fedora's WebKit development package](https://packages.fedoraproject.org/pkgs/webkitgtk/webkit2gtk4.1-devel/) and [Arch's package](https://archlinux.org/packages/extra/x86_64/webkit2gtk-4.1/) for details. For openSUSE and other distributions, use [Wails installation](https://wails.io/docs/gettingstarted/installation/) and `wails doctor` to check native dependencies.

From the project root:

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
wails build -tags webkit2_41
```

For ABI 4.0, replace the last command with `wails build`.
The output is `build/bin/gitextensions-linux`, with the frontend and PNG icon embedded. Install it using `./build/linux/install.sh`.

## Package and share

After building, from the Git repository root:

```sh
python3 build/linux/package.py
```

`build/bin/gitextensions-linux-amd64.tar.gz` contains `gitextensions-linux` and `install.sh` at the top level, a short EN/RU README, icons in `assets/`, installation and user guides in `docs/`, `LICENSE.md`, credits, dependency licenses and the matching source snapshot in `source/`.
To rebuild, open `source/` and follow the build steps above. Share the sources with the binary: see [GPL and adapted code](../NOTICE.md).
Packaging needs Python 3, Git, Go and installed npm dependencies.

## Uninstall

```sh
rm -f ~/.local/bin/gitextensions-linux
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/applications/gitextensions-linux.desktop"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}"/icons/hicolor/256x256/apps/gitextensions-linux*.png
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}"/icons/hicolor/scalable/apps/gitextensions-linux*.svg
```

Also remove `gitextensions-linux.desktop` from your desktop folder.
The installer does not change repositories or their Git settings.
