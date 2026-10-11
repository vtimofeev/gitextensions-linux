# Build and run on macOS (Intel)

English | [Русский](macos-install.ru.md)

These steps build the app locally on an Intel Mac (`darwin/amd64`). The Go backend has passed cross-compilation for this target; the complete `.app` build and UI still need verification on a Mac.

## Requirements

- macOS 12 Monterey or newer: this is the [minimum version for Go 1.25](https://go.dev/doc/go1.25#darwin).
- [Go](https://go.dev/dl/) 1.25 or newer, for macOS x86-64.
- [Node.js](https://nodejs.org/en/download) LTS with npm; use Node.js 22.12+ or a newer LTS release.
- Git and the project sources.
- Xcode Command Line Tools, required by [Wails](https://wails.io/docs/gettingstarted/installation/).

Install the Apple tools and wait for installation to finish:

```sh
xcode-select --install
```

Check the installed tools in Terminal:

```sh
uname -m
go version
node --version
npm --version
git --version
```

On an Intel Mac, `uname -m` prints `x86_64`.

## Build

Open Terminal in the project root, which contains `wails.json` and `go.mod`, then run:

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
wails build -platform darwin/amd64
```

Resolve any missing required dependencies reported by `wails doctor` before building.
Wails runs `npm ci`, generates the Go bridge bindings, builds the frontend and packages it with the executable and icon.
The result is `build/bin/gitextensions-linux.app`; the app keeps the project name on macOS.
See the [Wails CLI documentation](https://wails.io/docs/reference/cli/) for platform options.

## Run and update

From the project root:

```sh
open build/bin/gitextensions-linux.app
```

To open a particular repository when starting the app:

```sh
open build/bin/gitextensions-linux.app --args --repo "/path/to/repository"
```

You can also drag the `.app` into **Applications** and launch it from Finder.
Close the app before rebuilding or replacing the installed copy. Git must remain installed to work with repositories; Go and Node.js are needed only for building.

For development and tests, see [Development](development.md). The scripts in `build/linux/` package and install Linux builds; use the `.app` for macOS.
