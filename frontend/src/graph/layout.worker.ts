import { RevisionGraph } from "./layout";
import type { Commit } from "../domain/models";
// Rows are posted in chunks: each structured-clone deserialization on the main
// thread stays short, and the first visible rows arrive before the whole graph.
export const LAYOUT_CHUNK = 2000;
self.onmessage = (event: MessageEvent<{ commits: Commit[] }>) => {
  try {
    const layout = new RevisionGraph().layout(event.data.commits);
    for (let i = 0; i < layout.rows.length || i === 0; i += LAYOUT_CHUNK)
      self.postMessage({
        rows: layout.rows.slice(i, i + LAYOUT_CHUNK),
        lanes: layout.lanes,
        done: i + LAYOUT_CHUNK >= layout.rows.length,
      });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
