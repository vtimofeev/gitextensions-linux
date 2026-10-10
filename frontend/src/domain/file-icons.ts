import type { FileStatus } from "./models";
import type { MessageKey } from "../i18n/en";

const typeIcons: Record<string, string> = Object.create(null);
for (const [icon, extensions] of Object.entries({
  "pi-code":
    "go js mjs cjs jsx ts mts cts tsx vue svelte py rb rs java c h cc cpp hpp cxx cs php sh bash zsh lua swift kt kts sql proto",
  "pi-image": "png jpg jpeg gif webp bmp ico svg avif tif tiff heic",
  "pi-file-pdf": "pdf",
  "pi-file-word": "doc docx odt rtf",
  "pi-file-excel": "xls xlsx ods csv tsv",
  "pi-volume-up": "mp3 wav ogg flac aac m4a opus",
  "pi-video": "mp4 webm mkv avi mov m4v",
  "pi-box": "zip gz bz2 xz tar tgz 7z rar deb rpm",
  "pi-cog": "json yaml yml toml ini cfg conf lock",
  "pi-file-edit": "md markdown txt rst adoc",
  "pi-database": "db sqlite sqlite3",
})) {
  for (const extension of extensions.split(" ")) typeIcons[extension] = icon;
}

export function fileTypeIcon(path: string) {
  const name = path.split(/[\\/]/).at(-1)!.toLowerCase();
  if (/^(dockerfile(?:\.|$)|makefile$|gnumakefile$)/.test(name))
    return "pi-code";
  if (/^\.(gitignore|gitattributes|editorconfig)$/.test(name)) return "pi-cog";
  return (
    (name.includes(".") && typeIcons[name.split(".").at(-1)!]) || "pi-file"
  );
}

const statuses: Record<
  string,
  { icon: string; tone: string; label: MessageKey }
> = {
  U: { icon: "pi-exclamation-triangle", tone: "conflict", label: "conflict" },
  "?": {
    icon: "pi-question-circle",
    tone: "untracked",
    label: "fileUntracked",
  },
  A: { icon: "pi-plus-circle", tone: "added", label: "fileAdded" },
  D: { icon: "pi-minus-circle", tone: "deleted", label: "fileDeleted" },
  M: { icon: "pi-pencil", tone: "modified", label: "fileModified" },
  R: { icon: "pi-arrow-right", tone: "renamed", label: "fileRenamed" },
  C: { icon: "pi-copy", tone: "copied", label: "fileCopied" },
  T: { icon: "pi-refresh", tone: "modified", label: "fileTypeChanged" },
};
const unchanged = {
  icon: "pi-file",
  tone: "unchanged",
  label: "fileUnchanged" as const,
};

export function fileStatusIcon(file: FileStatus, area: "staged" | "unstaged") {
  const status = file.conflict
    ? "U"
    : file.untracked
      ? "?"
      : area === "staged"
        ? file.index
        : file.worktree;
  return statuses[status] ?? unchanged;
}
