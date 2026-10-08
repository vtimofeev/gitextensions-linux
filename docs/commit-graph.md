# Commit graph

English | [Русский](commit-graph.ru.md)

The lane layout in `frontend/src/graph/layout.ts` is adapted from `RevisionGraph.cs` and `RevisionGraphRow.cs` in the original Git Extensions.
Graph snapshots and the ASCII checker come from `RevisionGraphTests.cs`. They keep **GPL-3.0-only**; credits and source links are in [NOTICE.md](../NOTICE.md).

## How the adaptation works

- Keeps all merge parents in their original order. Parents outside the loaded history remain unfinished edges.
- Shares lanes for a common parent and straightens lines with a limited lookahead.
- Builds layout in a Web Worker. A new request cancels the old worker and ignores late replies.
- Uses a viewport-sized Canvas and virtualized DOM rows. Layout data stays outside Vue's deep reactive proxies.
- Search does not replace missing parents with nearby matching commits.

The WinForms renderer was not ported. This app uses Canvas, its own colors, display-scale handling and Vue ref labels.
HEAD, the current branch and the commit selected for diff have separate markers.

Checks: `frontend/tests/graph.test.ts`, `graph-fixtures/`, `pointers.test.ts`, `ref-labels.test.ts` and browser history tests.
