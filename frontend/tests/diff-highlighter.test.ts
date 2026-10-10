import { afterEach, expect, it, vi } from "vitest";
import { DiffHighlighter } from "../src/domain/diff-highlighter";

class ParserWorker {
  static instances: ParserWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    ParserWorker.instances.push(this);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  ParserWorker.instances = [];
});

it("cancels obsolete parsing, ignores its late message and reuses the completed worker", async () => {
  vi.stubGlobal("Worker", ParserWorker);
  const parser = new DiffHighlighter();
  const old = parser.highlight("old", "old.ts", false);
  const firstWorker = ParserWorker.instances[0]!;
  const latest = parser.highlight("new", "new.ts", true);
  const latestWorker = ParserWorker.instances[1]!;
  expect(firstWorker.terminate).toHaveBeenCalledOnce();
  expect(await old).toEqual({ start: 0, tokens: [] });
  firstWorker.onmessage!({
    data: {
      generation: firstWorker.postMessage.mock.calls[0]![0].generation,
      start: 0,
      tokens: [[{ text: "old", className: "stale" }]],
    },
  });
  latestWorker.onmessage!({
    data: {
      start: 0,
      generation: latestWorker.postMessage.mock.calls[0]![0].generation,
      tokens: [[{ text: "new", className: "syntax-keyword" }]],
    },
  });
  expect(await latest).toEqual({
    start: 0,
    tokens: [[{ text: "new", className: "syntax-keyword" }]],
  });
  const next = parser.highlight("next", "next.ts", false);
  expect(ParserWorker.instances).toHaveLength(2);
  // An already queued viewport response from the reused worker belongs to its old document.
  const onRange = vi.fn();
  parser.range(10, 20, onRange);
  latestWorker.onmessage!({
    data: {
      generation: latestWorker.postMessage.mock.calls[0]![0].generation,
      start: 10,
      tokens: [],
    },
  });
  expect(onRange).not.toHaveBeenCalled();
  parser.dispose();
  expect(await next).toEqual({ start: 0, tokens: [] });
  expect(latestWorker.terminate).toHaveBeenCalledOnce();
});

it("falls back to plain text and releases a failed worker", async () => {
  vi.stubGlobal("Worker", ParserWorker);
  const parser = new DiffHighlighter();
  const pending = parser.highlight("text", "file.ts", false);
  ParserWorker.instances[0]!.onerror!();
  expect(await pending).toEqual({ start: 0, tokens: [] });
  expect(ParserWorker.instances[0]!.terminate).toHaveBeenCalledOnce();
});

it("requests only the visible range after parsing without restarting the worker", async () => {
  vi.stubGlobal("Worker", ParserWorker);
  const parser = new DiffHighlighter();
  const pending = parser.highlight("text", "file.ts", false, 0, 30);
  const worker = ParserWorker.instances[0]!;
  const generation = worker.postMessage.mock.calls[0]![0].generation;
  worker.onmessage!({ data: { generation, start: 0, tokens: [] } });
  await pending;
  const onRange = vi.fn();
  parser.range(500, 530, onRange);
  expect(worker.postMessage).toHaveBeenLastCalledWith({
    generation,
    start: 500,
    end: 530,
  });
  worker.onmessage!({
    data: {
      generation,
      start: 500,
      tokens: [[{ text: "const", className: "syntax-keyword" }]],
    },
  });
  expect(onRange).toHaveBeenCalledExactlyOnceWith({
    start: 500,
    tokens: [[{ text: "const", className: "syntax-keyword" }]],
  });
  expect(worker.terminate).not.toHaveBeenCalled();
  parser.dispose();
});
