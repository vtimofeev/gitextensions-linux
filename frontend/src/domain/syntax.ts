import {
  StreamLanguage,
  type LanguageSupport,
  type Language,
} from "@codemirror/language";
export const syntaxLimit = 2 * 1024 * 1024;
export const extensions: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  vue: "html",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cxx: "cpp",
  php: "php",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  toml: "toml",
  rb: "ruby",
  lua: "lua",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  proto: "protobuf",
  ini: "properties",
  properties: "properties",
  cfg: "properties",
};
export function detectLanguage(fileName: string): string | null {
  const name = fileName.split(/[\\/]/).at(-1)!.toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile."))
    return "dockerfile";
  // Make recipes use shell syntax. No content-based guessing for unknown files.
  if (["makefile", "gnumakefile"].includes(name)) return "shell";
  if (!name.includes(".")) return null;
  return extensions[name.split(".").at(-1)!] ?? null;
}
export function largeFile(text: string) {
  return new TextEncoder().encode(text).byteLength > syntaxLimit;
}
export async function loadLanguage(
  fileName: string,
): Promise<LanguageSupport | Language | null> {
  const name = detectLanguage(fileName);
  switch (name) {
    case "javascript":
    case "typescript":
    case "jsx":
    case "tsx":
      return (await import("@codemirror/lang-javascript")).javascript({
        typescript: name === "typescript" || name === "tsx",
        jsx: name === "jsx" || name === "tsx",
      });
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "css":
    case "scss":
    case "less":
      return (await import("@codemirror/lang-css")).css();
    case "html":
      return (await import("@codemirror/lang-html")).html();
    case "xml":
      return (await import("@codemirror/lang-xml")).xml();
    case "markdown":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "python":
      return (await import("@codemirror/lang-python")).python();
    case "go":
      return (await import("@codemirror/lang-go")).go();
    case "rust":
      return (await import("@codemirror/lang-rust")).rust();
    case "java":
      return (await import("@codemirror/lang-java")).java();
    case "cpp":
      return (await import("@codemirror/lang-cpp")).cpp();
    case "php":
      return (await import("@codemirror/lang-php")).php();
    case "sql":
      return (await import("@codemirror/lang-sql")).sql();
    case "yaml":
      return (await import("@codemirror/lang-yaml")).yaml();
    case "shell":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/shell")).shell,
      );
    case "toml":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/toml")).toml,
      );
    case "dockerfile":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/dockerfile")).dockerFile,
      );
    case "ruby":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/ruby")).ruby,
      );
    case "lua":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/lua")).lua,
      );
    case "swift":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/swift")).swift,
      );
    case "kotlin":
    case "csharp":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/clike"))[name],
      );
    case "protobuf":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/protobuf")).protobuf,
      );
    case "properties":
      return StreamLanguage.define(
        (await import("@codemirror/legacy-modes/mode/properties")).properties,
      );
    default:
      return null;
  }
}
