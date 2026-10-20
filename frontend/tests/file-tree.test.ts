import { expect, it } from "vitest";
import { buildFileTree, fileTreeRows } from "../src/domain/file-tree";

it("groups directories before files and keeps basenames and exact Git paths", () => {
  const tree = buildFileTree([
    "README.md",
    "src/z.ts",
    "src/a.ts",
    "assets/icon.svg",
    "literal\\name.txt",
    "src/a.ts",
  ]);
  const rows = fileTreeRows(tree, new Set());
  expect(rows.map((row) => row.path)).toEqual([
    "assets",
    "assets/icon.svg",
    "src",
    "src/a.ts",
    "src/z.ts",
    "literal\\name.txt",
    "README.md",
  ]);
  expect(rows.find((row) => row.path === "src/a.ts")).toMatchObject({
    name: "a.ts",
    depth: 1,
    directory: false,
  });
});
it("collapses nested folders without removing adjacent files or losing paths", () => {
  const tree = buildFileTree([
    "src/api/a.ts",
    "src/api/b.ts",
    "src/index.ts",
    "docs/index.ts",
  ]);
  expect(
    fileTreeRows(tree, new Set(["src/api"])).map((row) => row.path),
  ).toEqual(["docs", "docs/index.ts", "src", "src/api", "src/index.ts"]);
  expect(fileTreeRows(tree, new Set(["src"])).map((row) => row.path)).toEqual([
    "docs",
    "docs/index.ts",
    "src",
  ]);
});

it("compacts single-child directory chains while preserving full paths and file names", () => {
  const rows = fileTreeRows(
    buildFileTree(["one/two/three/a.ts", "one/two/three/b.ts"]),
    new Set(),
  );
  expect(rows.map((row) => [row.path, row.name, row.depth])).toEqual([
    ["one/two/three", "one/two/three", 0],
    ["one/two/three/a.ts", "a.ts", 1],
    ["one/two/three/b.ts", "b.ts", 1],
  ]);
  expect(
    fileTreeRows(
      buildFileTree(["one/two/three/a.ts"]),
      new Set(["one/two/three"]),
    ),
  ).toHaveLength(1);
});

it("stops compaction at branching directories and keeps sibling paths separate", () => {
  const tree = buildFileTree(["one/two/three/a.ts", "one/two/four/b.ts"]);
  expect(
    fileTreeRows(tree, new Set()).map((row) => [row.path, row.depth]),
  ).toEqual([
    ["one/two", 0],
    ["one/two/four", 1],
    ["one/two/four/b.ts", 2],
    ["one/two/three", 1],
    ["one/two/three/a.ts", 2],
  ]);
  expect(
    fileTreeRows(tree, new Set(["one/two/three"])).map((row) => row.path),
  ).not.toContain("one/two/three/a.ts");
});
