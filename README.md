# Git Extensions Linux

English | [Русский](README.ru.md)

Thanks to the creators and contributors of [the original Git Extensions](https://github.com/gitextensions/gitextensions) for their Git client and open source code.
This project was created with the help of neural networks. It is an independent Linux app built with Go/Wails and Vue, with some parts adapted from the original.

<img src="frontend/public/appicon.svg" alt="Git Extensions Linux" width="64" />

A desktop Git app for Linux. Browse commits, manage branches and changes, and view files. No separate server or account is needed.

![Git Extensions Linux with a demo repository, branches, a merge commit and a diff](docs/screenshots/test-repository.png)

The Linux app with a real demo repository: history, branches, local changes and the selected commit's diff.

## Features

- Commit graph, search, author filter, branches and tags.
- Stage/unstage, commits, push/pull/fetch, stash, reflog and reset.
- Checkout, merge, rebase, cherry-pick and revert; external diff and merge tools.
- File history, blame and source code with highlighting and folding.
- Image previews with zoom, Fit and 100%; switch between image and source for SVG.
- Recent and favorite repositories, Git identity profiles, light/dark themes, English/Russian UI.
- Code review with Codex, Claude, Qwen or OpenCode in a separate terminal.

[Light theme](docs/screenshots/redesign-light.png) · [Dark theme](docs/screenshots/redesign-dark.png)

## Quick start

Extract a release archive into its own folder and install it without `sudo`:

```sh
./install.sh
~/.local/bin/gitextensions-linux --repo "/path/to/repository"
```

You need Git and the GTK 3/WebKitGTK libraries used by the build. The Ubuntu 22.04 build uses WebKitGTK 4.0.
Close the app before updating it.

To build from source, install Go 1.25+, Node.js LTS, npm, GCC and Wails 2.15.0:

```sh
wails build
./build/bin/gitextensions-linux
```

[Build and install](docs/linux-install.md) · [Development and checks](docs/development.md) · [Set up code review](docs/code-review.md)

## Shortcuts

| Action | Keys |
| --- | --- |
| Open repository | `Ctrl+O` |
| Command palette | `Ctrl+K` |
| Branches | `Ctrl+B` |
| Settings | `Ctrl+,` |
| Commit / commit and push | `Ctrl+Enter` / `Ctrl+Shift+Enter` in the message field |
| Image zoom | `Ctrl` + mouse wheel or the `+` / `−` buttons |

Errors appear at the bottom, above other windows. Close them with ×.

## Limits

Stage/unstage works with whole files. There is no built-in conflict editor, clone/init screen or interactive rebase editor yet.
Whole-file previews and diffs are limited to 4 MiB; regular diffs for untracked files are limited to 1 MiB. Unsupported binary files show a notice.
Remote access uses your system's Git settings, SSH agent and credential helpers.

## License

**GPL-3.0-only**, with no extra restrictions. You may use, change and share the project, including commercially, under the GPL.
When sharing a build, provide access to its corresponding source code. The app comes without warranty.

[License text](LICENSE.md) · [Credits and adapted code](NOTICE.md) · [Commit graph](docs/commit-graph.md)
