# Build and install on Linux

English | [Русский](linux-install.ru.md)

## Install a release

For Ubuntu 22.04 and a WebKitGTK 4.0 build:

```sh
sudo apt install git libgtk-3-0 libwebkit2gtk-4.0-37
mkdir -p gitextensions-linux-release
tar -xzf gitextensions-linux-amd64.tar.gz -C gitextensions-linux-release
cd gitextensions-linux-release
./build/linux/install.sh
```

The installer runs without `sudo`. It puts the binary in `~/.local/bin`, the launcher and icons under `${XDG_DATA_HOME:-~/.local/share}`, and a shortcut in your desktop folder.
You do not need Go or Node.js to run a release. The CPU architecture and GTK/WebKitGTK ABI must match the target system.

```sh
~/.local/bin/gitextensions-linux
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

Close the app before reinstalling. Icon names include a content hash so GNOME can use the new image instead of a cached one.

## GNOME / Ubuntu

If the desktop shortcut needs permission, right-click it and choose **Allow Launching**.
If no desktop files are visible, check the **Desktop Icons NG (DING)** extension.
If the desktop folder is disabled in XDG settings, the installer skips that shortcut but still installs the menu launcher.
The menu starts the binary directly from `~/.local/bin`, even if this folder is not in `PATH`.

## Build from source

You need Go 1.25+, Node.js LTS and npm. On Ubuntu 22.04:

```sh
sudo apt install git build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
wails build
```

Run these commands from the project root. The result is `build/bin/gitextensions-linux`, with the frontend and PNG icon embedded.
On systems with WebKitGTK 4.1, install `libwebkit2gtk-4.1-dev` and build with `wails build -tags webkit2_41`.
For other distributions, see [Wails installation](https://wails.io/docs/gettingstarted/installation/).

## Package and share

After building, from the Git repository root:

```sh
python3 build/linux/package.py
```

`build/bin/gitextensions-linux-amd64.tar.gz` includes the installer, icons, English and Russian guides, `LICENSE.md`, credits, dependency licenses and a source snapshot in `source/`.
To change and rebuild the app, open `source/` and follow the build steps above.
Share the sources with the binary: see [GPL and adapted code](../NOTICE.md).
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
