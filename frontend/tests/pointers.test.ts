import { it, expect, vi } from "vitest";
import { GraphPointers, GraphRenderer } from "../src/graph/renderer";
import type { Snapshot } from "../src/domain/models";
const snapshot: Snapshot = {
  path: "/repo",
  branch: "main",
  detached: false,
  operation: "",
  files: [],
  remotes: [],
  commits: [
    {
      hash: "head",
      parents: [],
      subject: "HEAD",
      authorEmail: "author@example.test",
      author: "",
      date: "",
      refs: "HEAD -> main",
    },
    {
      hash: "view",
      parents: [],
      subject: "Old",
      authorEmail: "author@example.test",
      author: "",
      date: "",
      refs: "",
    },
  ],
  branches: [
    {
      name: "main",
      hash: "head",
      current: true,
      remote: false,
      upstream: "",
      tracking: "",
    },
  ],
};
it("keeps Git pointers independent of diff selection and detached HEAD", () => {
  const pointers = new GraphPointers(snapshot);
  expect(pointers.head).toBe("head");
  expect(pointers.branch).toBe("head");
  const detached = new GraphPointers({
    ...snapshot,
    detached: true,
    branches: snapshot.branches.map((b) => ({ ...b, current: false })),
    commits: snapshot.commits.map((c) => ({
      ...c,
      refs: c.hash === "view" ? "HEAD" : "",
    })),
  });
  expect(detached.head).toBe("view");
  expect(detached.branch).toBe("");
});
it("draws HEAD and branch markers without a dashed selection ring", () => {
  const canvas = document.createElement("canvas");
  const context = {
    scale: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  };
  vi.spyOn(canvas, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  new GraphRenderer().draw(
    canvas,
    { lanes: 1, rows: [{ hash: "head", lane: 0, color: 0, lines: [] }] },
    0,
    64,
    new GraphPointers(snapshot),
    new Map(snapshot.commits.map((c) => [c.hash, c])),
  );
  expect(context.arc.mock.calls.map((args) => args[2])).toEqual([8]);
  expect(context.closePath).toHaveBeenCalledOnce();
  expect(context.setLineDash.mock.calls).toEqual([[[]]]);
});
