import type { ReviewOptions } from "../domain/review";
import type {
  Identity,
  CommitDetails,
  StashEntry,
  FileRevision,
  FileContent,
  BlameLine,
  BlameOptions,
  Snapshot,
  Commit,
  PushOptions,
  DiffArea,
  RefOptions,
  ConflictData,
  MergeTool,
} from "../domain/models";

export interface DesktopBackend {
  StartReview(path: string, opts: ReviewOptions): Promise<string>;
  Identity(path: string): Promise<Identity>;
  SetIdentity(path: string, name: string, email: string): Promise<string>;
  HistorySnapshot(
    path: string,
    limit: number,
    author: string,
  ): Promise<Snapshot>;
  CommitDetails(path: string, revision: string): Promise<CommitDetails>;
  Stashes(path: string): Promise<StashEntry[]>;
  Reflog(path: string): Promise<StashEntry[]>;
  StashAction(
    path: string,
    action: string,
    hash: string,
    message: string,
    untracked: boolean,
    keepIndex: boolean,
    restoreIndex: boolean,
  ): Promise<string>;
  Reset(path: string, revision: string, mode: string): Promise<string>;
  FileHistory(
    path: string,
    file: string,
    revision: string,
  ): Promise<FileRevision[]>;
  FileDiff(
    path: string,
    file: string,
    revision: string,
    fullContext: boolean,
  ): Promise<string>;
  FileContent(
    path: string,
    file: string,
    area: DiffArea,
    revision: string,
  ): Promise<FileContent>;
  Blame(
    path: string,
    file: string,
    revision: string,
    options: BlameOptions,
  ): Promise<BlameLine[]>;
  CopyText(text: string): Promise<void>;

  CommitInfo(path: string, revision: string): Promise<Commit>;
  WorkingState(
    path: string,
  ): Promise<Pick<Snapshot, "files" | "operation" | "dirtyCount">>;
  RunDiffTool(
    path: string,
    file: string,
    area: DiffArea,
    revision: string,
    name: string,
  ): Promise<string>;
  Discard(
    path: string,
    files: string[],
    worktreeOnly: boolean,
  ): Promise<string>;
  RefAction(path: string, options: RefOptions): Promise<string>;
  Conflict(path: string, file: string): Promise<ConflictData>;
  ResolveConflict(
    path: string,
    file: string,
    token: string,
    mode: string,
  ): Promise<string>;
  MergeTools(path: string): Promise<MergeTool[]>;
  ConfigureMergeTool(
    path: string,
    name: string,
    binary: string,
    trustExit: boolean,
  ): Promise<string>;
  RunMergeTool(path: string, file: string, name: string): Promise<string>;
  CancelMergeTool(): Promise<void>;
  RepositoryExists(paths: string[]): Promise<Record<string, boolean>>;
  InitialRepository(): Promise<string>;
  ChooseRepository(): Promise<string>;
  Snapshot(path: string, limit: number): Promise<Snapshot>;
  Checkout(path: string, branch: string): Promise<string>;
  CreateBranch(
    path: string,
    name: string,
    start: string,
    checkout: boolean,
  ): Promise<string>;
  DeleteBranch(path: string, name: string, force: boolean): Promise<string>;
  Stage(path: string, files: string[]): Promise<string>;
  Unstage(path: string, files: string[]): Promise<string>;
  Commit(path: string, message: string, amend: boolean): Promise<string>;
  Push(path: string, options: PushOptions): Promise<string>;
  Pull(
    path: string,
    remote: string,
    branch: string,
    mode: string,
  ): Promise<string>;
  FetchAll(path: string, prune: boolean): Promise<string>;
  CommitFiles(path: string, revision: string): Promise<string[]>;
  Diff(
    path: string,
    file: string,
    area: DiffArea,
    revision: string,
  ): Promise<string>;
}

declare global {
  interface Window {
    go?: { main: { App: DesktopBackend } };
  }
}

// The only frontend boundary with the native desktop application.
export class GitApi {
  startReview(path: string, opts: ReviewOptions) {
    return this.backend.StartReview(path, opts);
  }
  identity(path: string) {
    return this.backend.Identity(path);
  }
  setIdentity(path: string, name: string, email: string) {
    return this.backend.SetIdentity(path, name, email);
  }
  historySnapshot(path: string, limit: number, author: string) {
    return this.backend.HistorySnapshot(path, limit, author);
  }
  commitDetails(path: string, revision: string) {
    return this.backend.CommitDetails(path, revision);
  }
  stashes(path: string) {
    return this.backend.Stashes(path);
  }
  reflog(path: string) {
    return this.backend.Reflog(path);
  }
  stashAction(
    path: string,
    action: string,
    hash: string,
    message: string,
    untracked: boolean,
    keepIndex: boolean,
    restoreIndex: boolean,
  ) {
    return this.backend.StashAction(
      path,
      action,
      hash,
      message,
      untracked,
      keepIndex,
      restoreIndex,
    );
  }
  reset(path: string, revision: string, mode: string) {
    return this.backend.Reset(path, revision, mode);
  }
  fileHistory(path: string, file: string, revision: string) {
    return this.backend.FileHistory(path, file, revision);
  }
  fileDiff(path: string, file: string, revision: string, fullContext: boolean) {
    return this.backend.FileDiff(path, file, revision, fullContext);
  }
  fileContent(path: string, file: string, area: DiffArea, revision: string) {
    return this.backend.FileContent(path, file, area, revision);
  }
  blame(
    path: string,
    file: string,
    revision: string,
    options: BlameOptions = {
      ignoreWhitespace: true,
      detectCopiesInFile: false,
      detectCopiesInAllFiles: false,
    },
  ) {
    return this.backend.Blame(path, file, revision, options);
  }
  copyText(text: string) {
    return this.backend.CopyText(text);
  }

  get backend(): DesktopBackend {
    const backend = window.go?.main.App;
    if (!backend)
      throw new Error(
        "Desktop bridge unavailable. Start this app with wails dev or the built desktop binary.",
      );
    return backend;
  }
  commitInfo(path: string, revision: string) {
    return this.backend.CommitInfo(path, revision);
  }
  workingState(path: string) {
    return this.backend.WorkingState(path);
  }
  runDiffTool(
    path: string,
    file: string,
    area: DiffArea,
    revision: string,
    name: string,
  ) {
    return this.backend.RunDiffTool(path, file, area, revision, name);
  }
  discard(path: string, files: string[], worktreeOnly: boolean) {
    return this.backend.Discard(path, files, worktreeOnly);
  }
  // Includes create-tag/delete-tag with explicit tag type and remote options.
  refAction(path: string, options: RefOptions) {
    return this.backend.RefAction(path, options);
  }

  conflict(path: string, file: string) {
    return this.backend.Conflict(path, file);
  }
  resolveConflict(path: string, file: string, token: string, mode: string) {
    return this.backend.ResolveConflict(path, file, token, mode);
  }
  mergeTools(path: string) {
    return this.backend.MergeTools(path);
  }
  configureMergeTool(
    path: string,
    name: string,
    binary: string,
    trustExit: boolean,
  ) {
    return this.backend.ConfigureMergeTool(path, name, binary, trustExit);
  }
  runMergeTool(path: string, file: string, name: string) {
    return this.backend.RunMergeTool(path, file, name);
  }
  cancelMergeTool() {
    return this.backend.CancelMergeTool();
  }
  repositoryExists(paths: string[]) {
    return this.backend.RepositoryExists(paths);
  }
  initialRepository() {
    return this.backend.InitialRepository();
  }
  chooseRepository() {
    return this.backend.ChooseRepository();
  }
  snapshot(path: string, limit: number) {
    return this.backend.Snapshot(path, limit);
  }
  checkout(path: string, branch: string) {
    return this.backend.Checkout(path, branch);
  }
  createBranch(path: string, name: string, start: string, checkout: boolean) {
    return this.backend.CreateBranch(path, name, start, checkout);
  }
  deleteBranch(path: string, name: string, force: boolean) {
    return this.backend.DeleteBranch(path, name, force);
  }
  stage(path: string, files: string[]) {
    return this.backend.Stage(path, files);
  }
  unstage(path: string, files: string[]) {
    return this.backend.Unstage(path, files);
  }
  commit(path: string, message: string, amend: boolean) {
    return this.backend.Commit(path, message, amend);
  }
  push(path: string, options: PushOptions) {
    return this.backend.Push(path, options);
  }
  pull(path: string, remote: string, branch: string, mode: string) {
    return this.backend.Pull(path, remote, branch, mode);
  }
  fetchAll(path: string, prune: boolean) {
    return this.backend.FetchAll(path, prune);
  }
  commitFiles(path: string, revision: string) {
    return this.backend.CommitFiles(path, revision);
  }
  diff(path: string, file: string, area: DiffArea, revision = "") {
    return this.backend.Diff(path, file, area, revision);
  }
}
