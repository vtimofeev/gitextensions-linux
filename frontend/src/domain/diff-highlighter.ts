import type { CodeToken } from "./diff-syntax";

export interface HighlightedRange {
  start: number;
  tokens: CodeToken[][];
}

// Reuse an idle parser, but terminate unfinished work when navigation supersedes it.
export class DiffHighlighter {
  private worker: Worker | null = null;
  private pending: ((range: HighlightedRange) => void) | null = null;
  private onRange: ((range: HighlightedRange) => void) | null = null;
  private generation = 0;

  cancel() {
    ++this.generation;
    this.onRange = null;
    if (!this.pending) return;
    this.worker?.terminate();
    this.worker = null;
    this.pending({ start: 0, tokens: [] });
    this.pending = null;
  }

  highlight(
    value: string,
    fileName: string,
    plain: boolean,
    start = 0,
    end = 100,
  ): Promise<HighlightedRange> {
    this.cancel();
    return new Promise((resolve) => {
      try {
        this.worker ??= new Worker(
          new URL("./diff-highlight.worker.ts", import.meta.url),
          { type: "module" },
        );
        const worker = this.worker;
        this.pending = resolve;
        this.worker.onmessage = (
          event: MessageEvent<HighlightedRange & { generation: number }>,
        ) => {
          if (
            this.worker !== worker ||
            event.data.generation !== this.generation
          )
            return;
          const range = { start: event.data.start, tokens: event.data.tokens };
          this.pending?.(range);
          this.pending = null;
          this.onRange?.(range);
        };
        this.worker.onerror = () => {
          if (this.worker !== worker) return;
          this.dispose();
        };
        this.worker.postMessage({
          value,
          fileName,
          plain,
          start,
          end,
          generation: this.generation,
        });
      } catch {
        this.dispose();
        resolve({ start, tokens: [] });
      }
    });
  }

  range(
    start: number,
    end: number,
    onRange: (range: HighlightedRange) => void,
  ) {
    this.onRange = onRange;
    this.worker?.postMessage({ start, end, generation: this.generation });
  }

  dispose() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
