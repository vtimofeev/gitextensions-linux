# Credits and adapted code

English | [Русский](NOTICE.ru.md)

Git Extensions Linux is released under **GPL-3.0-only**. See [LICENSE.md](LICENSE.md) for the full text.
The app comes without warranty. You may use, change and share it under the GPL.

## Original Git Extensions

Thanks to [the creators and contributors of Git Extensions](https://github.com/gitextensions/gitextensions/graphs/contributors).
The original copyright holders keep their rights to the adapted materials. Their license is preserved.

| Files in this project | Git Extensions source |
| --- | --- |
| `frontend/src/graph/layout.ts` | `RevisionGraph.cs`, `RevisionGraphRow.cs` |
| `frontend/tests/graph.test.ts`, `frontend/tests/graph-fixtures/*.txt` | `RevisionGraphTests.cs` and its snapshot fixtures |

Upstream: [graph algorithm](https://github.com/gitextensions/gitextensions/tree/master/src/app/GitUI/UserControls/RevisionGrid/Graph), [tests](https://github.com/gitextensions/gitextensions/tree/master/tests/app/UnitTests/GitUI.Tests/UserControls/RevisionGrid/Graph), [license](https://github.com/gitextensions/gitextensions/blob/master/LICENSE.md).

This is a modified Linux/TypeScript adaptation, not the original Windows app. It draws the graph with Canvas and a Web Worker and uses Go/Wails for the desktop window.
The original also guides the ref label colors (`frontend/src/graph/ref-labels.ts`) and author initials (`frontend/src/domain/author-color.ts`).
Changes and attribution recorded on **2026-10-08**. See [docs/commit-graph.md](docs/commit-graph.md) for the adaptation details.
This is an independent project. These credits do not imply approval or support from the original authors.

## New implementation

Copyright © 2026 Vasily Timofeev and Git Extensions Linux contributors.
The project was created with the help of neural networks. This does not change the licenses of the materials used.

## Dependencies and releases

Go and npm dependencies keep their own licenses. Versions are locked in `go.mod`, `go.sum` and `frontend/package-lock.json`.
`build/linux/package.py` includes a snapshot of the project sources and license notices for the installed build dependencies in the release archive.
GTK/WebKitGTK and Git are installed separately as system packages.

When sharing a binary, also share the sources for that exact version or provide equivalent free access to them, as required by [GPL section 6](https://github.com/gitextensions/gitextensions/blob/master/LICENSE.md).
Including `LICENSE.md` alone does not replace providing source code.
