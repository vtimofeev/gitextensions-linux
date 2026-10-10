import { DiffDocument } from "../diff/document";
import { diffTokens, type CodeToken } from "./diff-syntax";
import { loadLanguage, largeFile } from "./syntax";

let tokens: CodeToken[][] | null = null;
let start = 0,
  end = 0;
let generation = 0;
function publish() {
  // Only the virtual viewport crosses back to the UI, keeping large token arrays here.
  if (tokens)
    self.postMessage({ generation, start, tokens: tokens.slice(start, end) });
}
self.onmessage = async (
  event: MessageEvent<{
    value?: string;
    fileName: string;
    plain: boolean;
    start: number;
    end: number;
    generation: number;
  }>,
) => {
  const data = event.data;
  if (data.value === undefined && data.generation !== generation) return;
  generation = data.generation;
  start = data.start;
  end = data.end;
  if (data.value === undefined) {
    publish();
    return;
  }
  const { value, fileName, plain } = data;
  tokens = null;
  try {
    const language = largeFile(value) ? null : await loadLanguage(fileName);
    tokens = language
      ? diffTokens(new DiffDocument(value, plain).rows, language)
      : [];
  } catch {
    // A preview remains readable even if a grammar cannot be loaded.
    tokens = [];
  }
  publish();
};
