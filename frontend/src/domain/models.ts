export interface Commit {
  authorEmail: string;
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  refs: string;
}
export interface Branch {
  ahead?: number;
  behind?: number;
  date?: string;
  name: string;
  hash: string;
  current: boolean;
  remote: boolean;
  upstream: string;
  tracking: string;
}
export interface FileStatus {
  path: string;
  originalPath: string;
  index: string;
  worktree: string;
  untracked: boolean;
  conflict: boolean;
}
export interface Snapshot {
  homePath?: string;
  ahead?: number;
  behind?: number;
  hasUpstream?: boolean;
  dirtyCount?: number;
  path: string;
  branch: string;
  detached: boolean;
  operation: string;
  commits: Commit[];
  branches: Branch[];
  files: FileStatus[];
  remotes: string[];
}
export interface PushOptions {
  remote: string;
  branch: string;
  setUpstream: boolean;
  forceWithLease: boolean;
  tags: boolean;
  dryRun: boolean;
}
export type DiffArea = "staged" | "unstaged" | "untracked" | "commit";
export type RefAction =
  | "checkout"
  | "merge"
  | "rebase"
  | "cherry-pick"
  | "revert"
  | "create-tag"
  | "delete-tag"
  | "create"
  | "rename"
  | "delete"
  | "continue"
  | "skip"
  | "abort";
export interface RefOptions {
  action: RefAction;
  target: string;
  name: string;
  mode: "ff" | "ff-only" | "no-ff";
  message: string;
  remote: boolean;
  detach: boolean;
  noCommit: boolean;
  squash: boolean;
  recordOrigin: boolean;
  mainline: number;
  rebaseMerges: boolean;
  force: boolean;
  checkout?: boolean;
  tagType?: "lightweight" | "annotated" | "signed";
  push?: boolean;
  remoteName?: string;
}
export interface TargetRef {
  name: string;
  kind: "local" | "remote" | "tag";
  current: boolean;
}
export interface RefTarget {
  name: string;
  hash: string;
  kind: "local" | "remote" | "tag" | "commit";
  current: boolean;
  parents: number;
  refs?: TargetRef[];
}

export interface ConflictData {
  path: string;
  token: string;
  binary: boolean;
  oursPresent: boolean;
  theirsPresent: boolean;
  externalSupported: boolean;
}
export interface MergeTool {
  name: string;
  path: string;
  available: boolean;
  configured: boolean;
  default: boolean;
  custom: boolean;
  trustExit: boolean;
}

export interface CommitDetails extends Commit {
  authorEmail: string;
  committer: string;
  committerEmail: string;
  committerDate: string;
  message: string;
}
export interface StashEntry {
  hash: string;
  selector: string;
  date: string;
  subject: string;
}
export interface FileRevision {
  commit: Commit;
  file: string;
  originalPath?: string;
}
export interface FileContent {
  text: string;
  binary: boolean;
  imageMime?: string;
  imageBase64?: string;
}
export interface BlameOptions {
  ignoreWhitespace: boolean;
  detectCopiesInFile: boolean;
  detectCopiesInAllFiles: boolean;
}
export interface BlameLine {
  originalPath: string;
  hash: string;
  author: string;
  email: string;
  date: string;
  summary: string;
  originalLine: number;
  line: number;
  text: string;
}

export interface Identity {
  name: string;
  email: string;
  scope: "local" | "global" | "system" | "none";
  localName?: boolean;
  localEmail?: boolean;
}
