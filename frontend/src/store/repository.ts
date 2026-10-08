import {
  loadRecentRepos,
  sortRecentRepos,
  type RecentRepo,
} from "./recent-repos";
import { boundedSize } from "./preferences";
import type { IdentityProfile, Preferences } from "./preferences";
import type { MessageKey } from "../i18n/en";
import { pathMatches } from "./profile-rules";
import { markRaw } from "vue";
import type { GitApi } from "../api/git-api";
import type {
  Identity,
  Commit,
  CommitDetails,
  DiffArea,
  FileStatus,
  Snapshot,
  RefTarget,
  RefOptions,
} from "../domain/models";
export type FileArea = "staged" | "unstaged";
export class Repository {
  reviewStatus = "";
  selectedFiles: { area: FileArea; paths: string[] } = {
    area: "unstaged",
    paths: [],
  };
  private fileAnchor = "";
  filesIn(area: FileArea) {
    return area === "staged" ? this.staged : this.unstaged;
  }
  isFileSelected(path: string, area: FileArea) {
    return (
      this.selectedFiles.area === area &&
      selectionSet(this.selectedFiles.paths).has(path)
    );
  }
  selectionFiles(area: FileArea) {
    if (this.selectedFiles.area !== area) return EMPTY_FILES;
    const files = this.filesIn(area),
      paths = this.selectedFiles.paths;
    const cached = selectedCache.get(paths);
    if (cached?.files === files) return cached.selected;
    const membership = selectionSet(paths);
    const selected = markRaw(files.filter((f) => membership.has(f.path)));
    selectedCache.set(paths, { files, selected });
    return selected;
  }
  selectFile(path: string, area: FileArea) {
    if (!fileLists(this.snapshot?.files).maps[area].has(path)) return;
    this.selectedFiles = { area, paths: markRaw([path]) };
    this.fileAnchor = path;
  }
  toggleFile(path: string, area: FileArea) {
    if (!fileLists(this.snapshot?.files).maps[area].has(path)) return;
    const paths =
      this.selectedFiles.area === area ? this.selectedFiles.paths : [];
    this.selectedFiles = {
      area,
      paths: markRaw(
        selectionSet(paths).has(path)
          ? paths.filter((p) => p !== path)
          : [...paths, path],
      ),
    };
    this.fileAnchor = path;
  }
  selectRange(path: string, area: FileArea) {
    const files = this.filesIn(area);
    const end = files.findIndex((f) => f.path === path);
    if (end < 0) return;
    const start =
      this.selectedFiles.area === area
        ? files.findIndex((f) => f.path === this.fileAnchor)
        : -1;
    if (start < 0) {
      this.selectFile(path, area);
      return;
    }
    this.selectedFiles = {
      area,
      paths: markRaw(
        files
          .slice(Math.min(start, end), Math.max(start, end) + 1)
          .map((f) => f.path),
      ),
    };
  }
  selectAll(area: FileArea) {
    this.selectedFiles = {
      area,
      paths: markRaw(this.filesIn(area).map((f) => f.path)),
    };
    this.fileAnchor = this.selectedFiles.paths[0] ?? "";
  }
  clearSelection() {
    this.selectedFiles = { area: this.selectedFiles.area, paths: [] };
    this.fileAnchor = "";
  }
  private pruneSelection() {
    const available = fileLists(this.snapshot?.files).maps[
      this.selectedFiles.area
    ];
    const current = this.selectedFiles.paths;
    const paths = current.filter((p) => available.has(p));
    if (paths.length !== current.length)
      this.selectedFiles.paths = markRaw(paths);
    if (!available.has(this.fileAnchor)) this.fileAnchor = paths[0] ?? "";
  }

  refMenu: { target: RefTarget; x: number; y: number } | null = null;
  openRefMenu(event: MouseEvent | KeyboardEvent, target: RefTarget) {
    event.preventDefault();
    event.stopPropagation();
    if (this.busy) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.refMenu = {
      target,
      x:
        event instanceof MouseEvent && event.clientX
          ? event.clientX
          : rect.left,
      y:
        event instanceof MouseEvent && event.clientY
          ? event.clientY
          : rect.bottom,
    };
  }
  async refAction(options: RefOptions) {
    return this.execute(() => this.api.refAction(this.path, { ...options }));
  }
  diffToolTarget: { file: string; area: DiffArea; revision: string } | null =
    null;
  openDiffTool(file: string, area: DiffArea) {
    if (this.busy || !file || (area === "commit" && !this.selectedCommit))
      return;
    this.refMenu = null;
    this.error = "";
    this.diffToolTarget = {
      file,
      area,
      revision: area === "commit" ? this.selectedCommit!.hash : "",
    };
  }
  toolSettings = false;
  openToolSettings() {
    if (!this.busy) {
      this.error = "";
      this.toolSettings = true;
    }
  }
  conflictFile = "";
  openConflict(file: string) {
    if (!this.busy) {
      this.refMenu = null;
      this.error = "";
      this.clearDiff();
      this.selectedFile = file;
      this.selectedArea = "unstaged";
      this.conflictFile = file;
    }
  }
  graphFocus = { hash: "", request: 0 };
  async focusBranch(hash: string) {
    if (this.busy) return;
    this.refMenu = null;
    let commit = this.snapshot?.commits.find((c) => c.hash === hash);
    if (!commit) {
      this.busy = true;
      this.error = "";
      try {
        commit = await this.api.commitInfo(this.path, hash);
        this.snapshot!.commits = rawCommits([
          ...this.snapshot!.commits,
          commit,
        ]);
      } catch (error) {
        this.error = String(error);
        return;
      } finally {
        this.busy = false;
        this.activity = "";
      }
    }
    this.graphFocus = { hash, request: this.graphFocus.request + 1 };
    await this.selectCommit(commit);
  }
  utility: "stash" | "reflog" | "reset" | "" = "";
  resetTarget = "";
  authorFilter = "";
  details: CommitDetails | null = null;
  detailsLoading = false;
  private detailsSelection = 0;
  fileInspection: {
    file: string;
    area: DiffArea;
    revision: string;
    mode: "file" | "history" | "blame";
  } | null = null;
  inspectFile(
    file: string,
    area: DiffArea,
    mode: "file" | "history" | "blame",
  ) {
    this.fileInspection = {
      file,
      area,
      mode,
      revision:
        area === "commit" ? (this.selectedCommit?.hash ?? "HEAD") : "HEAD",
    };
  }
  openReset(hash = this.selectedCommit?.hash ?? "HEAD") {
    this.resetTarget = hash;
    this.refMenu = null;
    this.utility = "reset";
  }
  async filterAuthor(value: string) {
    if (this.busy || !this.path) return;
    this.authorFilter = value.trim();
    // A new filter (or clearing it) starts again from the first page.
    this.limit = this.pageSize;
    this.graphFocus = { hash: "", request: this.graphFocus.request };
    await this.refresh();
  }
  private async readSnapshot(path: string) {
    const snapshot = await (this.authorFilter
      ? this.api.historySnapshot(path, this.limit, this.authorFilter)
      : this.api.snapshot(path, this.limit));
    snapshot.commits = rawCommits(snapshot.commits);
    snapshot.files = rawFiles(snapshot.files);
    return snapshot;
  }
  snapshot: Snapshot | null = null;
  identity: Identity | null = null;
  settingsTab = "";
  createBranchRequested = 0;
  createTagRequested = 0;
  activity = "";
  busy = false;
  error = "";
  output = "";
  tab: "history" | "changes" = "history";
  limit = 150;
  selectedCommit: Commit | null = null;
  commitFiles: string[] = [];
  selectedFile = "";
  selectedArea: DiffArea = "unstaged";
  diff = "";
  diffLoading = false;
  pushAfterCommit =
    localStorage.getItem("gitextensions.pushAfterCommit") === "true";
  persistPushPreference() {
    localStorage.setItem(
      "gitextensions.pushAfterCommit",
      String(this.pushAfterCommit),
    );
  }
  async copyFilePaths(files: FileStatus[]) {
    try {
      await this.api.copyText(files.map((f) => f.path).join("\n"));
    } catch (error) {
      this.error = String(error);
    }
  }
  async discard(files: FileStatus[], worktreeOnly: boolean) {
    const ok = await this.execute(
      () =>
        this.api.discard(
          this.path,
          files.map((f) => f.path),
          worktreeOnly,
        ),
      true,
      "working",
    );
    if (
      ok &&
      files.some((f) => f.path === this.selectedFile) &&
      !this.snapshot?.files.some((f) => f.path === this.selectedFile)
    )
      this.clearDiff();
    this.activity = "";
    return ok;
  }
  message = "";
  retryPush = false;
  recent: RecentRepo[] = loadRecentRepos();
  repositoryExists: Record<string, boolean> = {};
  private selection = 0;
  constructor(
    private readonly api: GitApi,
    readonly preferences?: Pick<
      Preferences,
      | "profiles"
      | "rules"
      | "historyPageSize"
      | "repoProfiles"
      | "rememberProfile"
    > &
      Partial<Pick<Preferences, "recentRepoLimit">>,
  ) {
    if (preferences) this.limit = preferences.historyPageSize;
    this.trimRecent();
  }
  translate: (
    key: MessageKey,
    params?: Record<string, string | number>,
  ) => string = (_key, params) =>
    "Commit created; push failed: " + params?.error;
  notice = "";
  get path() {
    return this.snapshot?.path ?? "";
  }
  get activeProfile() {
    const profiles = this.preferences?.profiles;
    return (
      profiles?.find(
        (p) => p.id === this.preferences?.repoProfiles[this.path],
      ) ??
      profiles?.find(
        (p) =>
          p.name === this.identity?.name && p.email === this.identity?.email,
      )
    );
  }
  get staged(): FileStatus[] {
    return fileLists(this.snapshot?.files).staged;
  }
  get unstaged(): FileStatus[] {
    return fileLists(this.snapshot?.files).unstaged;
  }
  async bootstrap() {
    try {
      const path = await this.api.initialRepository();
      if (path) await this.open(path);
    } catch (e) {
      this.error = String(e);
    }
  }
  async choose() {
    if (this.busy) return;
    this.busy = true;
    this.activity = "activityChoose";
    let path = "";
    try {
      path = await this.api.chooseRepository();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.busy = false;
      this.activity = "";
    }
    if (path) await this.open(path);
  }

  async open(path: string) {
    if (this.busy) return;
    this.busy = true;
    this.activity = "activityOpen";
    this.error = "";
    try {
      this.authorFilter = "";
      const snapshot = await this.readSnapshot(path);
      const identity = await this.api.identity(snapshot.path);
      this.identity = identity;
      this.notice = "";
      const localName = identity.localName ?? identity.scope === "local";
      const localEmail = identity.localEmail ?? identity.scope === "local";
      const rememberedId = this.preferences?.repoProfiles[snapshot.path];
      const remembered = this.preferences?.profiles.find(
        (p) => p.id === rememberedId,
      );
      if (rememberedId && !remembered)
        this.preferences?.rememberProfile(snapshot.path);
      if (remembered) {
        if (
          !localName ||
          !localEmail ||
          identity.name !== remembered.name ||
          identity.email !== remembered.email
        ) {
          await this.api.setIdentity(
            snapshot.path,
            remembered.name,
            remembered.email,
          );
          this.identity = await this.api.identity(snapshot.path);
          this.notice = this.translate("rememberedProfileApplied", {
            label: remembered.label,
          });
        }
      } else if (this.preferences && !localName && !localEmail) {
        const rule = this.preferences.rules.find((r) =>
          pathMatches(
            r.pattern,
            snapshot.path,
            snapshot.homePath ||
              snapshot.path.match(/^\/home\/[^/]+/)?.[0] ||
              "/root",
          ),
        );
        const profile = this.preferences.profiles.find(
          (p) => p.id === rule?.profileId,
        );
        if (rule && profile) {
          await this.api.setIdentity(
            snapshot.path,
            profile.name,
            profile.email,
          );
          this.identity = await this.api.identity(snapshot.path);
          this.preferences.rememberProfile(snapshot.path, profile.id);
          this.notice = this.translate("profileApplied", {
            label: profile.label,
            pattern: rule.pattern,
          });
        }
      }
      this.detailsSelection++;
      this.details = null;
      this.utility = "";
      this.fileInspection = null;
      this.snapshot = snapshot;
      this.clearSelection();
      this.selectedCommit = null;
      this.commitFiles = [];
      this.clearDiff();
      this.message = "";
      this.output = "";
      this.retryPush = false;
      const existing = this.recent.find((repo) => repo.path === snapshot.path);
      this.recent = [
        {
          path: snapshot.path,
          lastOpened: new Date().toISOString(),
          favorite: existing?.favorite ?? false,
        },
        ...this.recent.filter((repo) => repo.path !== snapshot.path),
      ];
      this.repositoryExists[snapshot.path] = true;
      this.trimRecent();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.busy = false;
      this.activity = "";
    }
  }
  async refresh() {
    await this.execute(
      () => Promise.resolve(""),
      false,
      "repository",
      "activityRefresh",
    );
  }
  async execute(
    action: () => Promise<string>,
    record = true,
    scope: "repository" | "working" = "repository",
    activity = "activityOperation",
  ): Promise<boolean> {
    if (this.busy || !this.path) return false;
    this.busy = true;
    this.activity = activity;
    this.error = "";
    let ok = false;
    try {
      const output = await action();
      if (record) this.output = output || "✓";
      ok = true;
    } catch (e) {
      this.error = String(e);
      if (record) this.output = this.error;
    }
    try {
      if (scope === "working") {
        const next = await this.api.workingState(this.path);
        next.files = sameFiles(this.snapshot!.files, next.files)
          ? this.snapshot!.files
          : rawFiles(next.files);
        Object.assign(this.snapshot!, next);
      } else {
        const next = await this.readSnapshot(this.path);
        const current = this.snapshot!;
        // Retain only the explicitly revealed commit (a branch tip outside the
        // loaded page). Retaining every tip of the previous list appended the
        // tips of a filtered view after a filter reset, each drawing its own
        // lane to the bottom of the graph.
        const hashes = new Set(next.commits.map((c) => c.hash));
        const focus = this.graphFocus.hash;
        next.commits = [
          ...next.commits,
          ...current.commits.filter(
            (c) => !!focus && c.hash === focus && !hashes.has(c.hash),
          ),
        ];
        // Preserve reactive dependencies when a focus refresh changes no history,
        // so the graph layout and ref labels are not rebuilt for unchanged data.
        if (sameCommits(current.commits, next.commits))
          next.commits = current.commits;
        if (sameFiles(current.files, next.files)) next.files = current.files;
        for (const key of ["branches", "remotes"] as const) {
          if (JSON.stringify(current[key]) === JSON.stringify(next[key]))
            Object.assign(next, { [key]: current[key] });
        }
        Object.assign(current, next);
        this.identity = await this.api.identity(this.path);
      }
      this.pruneSelection();
      if (this.selectedCommit) {
        this.selectedCommit =
          this.snapshot!.commits.find(
            (c) => c.hash === this.selectedCommit?.hash,
          ) ?? null;
        if (this.details && this.details.hash === this.selectedCommit?.hash)
          this.details.refs = this.selectedCommit.refs;
        if (!this.selectedCommit) {
          this.commitFiles = [];
          this.detailsSelection++;
          this.details = null;
          this.clearDiff();
        }
      }
      if (this.selectedFile && this.selectedArea !== "commit") {
        const file = this.snapshot!.files.find(
          (f) => f.path === this.selectedFile,
        );
        if (!file) this.clearDiff();
        else if (file.conflict) {
          this.diff = "";
        } else {
          const staged = file.index !== " " && !file.untracked;
          const unstaged = file.worktree !== " " || file.untracked;
          const area = file.untracked
            ? "untracked"
            : this.selectedArea === "staged" && staged
              ? "staged"
              : unstaged
                ? "unstaged"
                : "staged";
          await this.loadDiff(this.selectedFile, area);
        }
      }
    } catch (e) {
      this.error += (this.error ? "\n" : "") + String(e);
    } finally {
      this.busy = false;
      this.activity = "";
    }
    return ok;
  }
  removeRecent(path: string) {
    this.recent = this.recent.filter((repo) => repo.path !== path);
    this.persistRecent();
  }
  private persistRecent() {
    localStorage.setItem(
      "gitextensions.recentRepos",
      JSON.stringify(this.recent),
    );
  }
  trimRecent(
    limit = this.preferences?.recentRepoLimit ??
      boundedSize(
        localStorage.getItem("gitextensions.recent.limit"),
        5,
        200,
        50,
      ),
  ) {
    let count = 0;
    const size = boundedSize(limit, 5, 200, 50);
    this.recent = sortRecentRepos(this.recent).filter(
      (repo) => repo.favorite || ++count <= size,
    );
    this.persistRecent();
  }
  toggleFavorite(path: string) {
    const repo = this.recent.find((repo) => repo.path === path);
    if (!repo) return;
    repo.favorite = !repo.favorite;
    this.trimRecent();
  }
  async checkRecentRepositories() {
    const paths = this.recent.map((repo) => repo.path);
    try {
      const exists = await this.api.repositoryExists(paths);
      this.repositoryExists = { ...this.repositoryExists, ...exists };
    } catch {
      // A failed availability check must not prevent opening or removing entries.
    }
  }
  async applyProfile(profile: { id?: string; name: string; email: string }) {
    return this.execute(async () => {
      const output = await this.api.setIdentity(
        this.path,
        profile.name,
        profile.email,
      );
      this.preferences?.rememberProfile(this.path, profile.id);
      return output;
    });
  }
  async profilesSaved(previous: IdentityProfile[]) {
    const profile = this.preferences?.profiles.find(
      (p) => p.id === this.preferences?.repoProfiles[this.path],
    );
    const old = previous.find((p) => p.id === profile?.id);
    if (
      profile &&
      old &&
      (profile.name !== old.name || profile.email !== old.email)
    )
      await this.applyProfile(profile);
  }
  async checkout(branch: string) {
    await this.execute(
      () => this.api.checkout(this.path, branch),
      true,
      "repository",
      "activityCheckout",
    );
  }
  async createBranch(name: string, start: string, checkout: boolean) {
    return this.execute(() =>
      this.api.createBranch(this.path, name, start, checkout),
    );
  }
  async deleteBranch(name: string, force: boolean) {
    return this.execute(() => this.api.deleteBranch(this.path, name, force));
  }
  async stage(files?: FileStatus[] | FileStatus) {
    const selected = files
      ? Array.isArray(files)
        ? files
        : [files]
      : this.unstaged;
    const paths = selected
      .filter((f) => !f.conflict)
      .flatMap((f) => [
        f.path,
        ...(f.originalPath && ["R", "C"].includes(f.worktree)
          ? [f.originalPath]
          : []),
      ]);
    if (!paths.length) return;
    await this.execute(
      () => this.api.stage(this.path, [...new Set(paths)]),
      true,
      "working",
      "activityStage",
    );
  }
  async unstage(files?: FileStatus[] | FileStatus) {
    const selected = files
      ? Array.isArray(files)
        ? files
        : [files]
      : this.staged;
    const paths = selected
      .filter((f) => !f.conflict)
      .flatMap((f) => [f.path, ...(f.originalPath ? [f.originalPath] : [])]);
    if (!paths.length) return;
    await this.execute(
      () => this.api.unstage(this.path, [...new Set(paths)]),
      true,
      "working",
      "activityUnstage",
    );
  }
  async commit(push = this.pushAfterCommit) {
    let committed = false;
    await this.execute(
      async () => {
        const output = await this.api.commit(this.path, this.message, false);
        committed = true;
        this.retryPush = false;
        if (push) {
          this.activity = "activityPush";
          try {
            const pushed = await this.api.push(this.path, {
              remote: "",
              branch: "",
              setUpstream: false,
              forceWithLease: false,
              tags: false,
              dryRun: false,
            });
            return output + "\n" + pushed;
          } catch (error) {
            this.retryPush = true;
            throw new Error(
              this.translate("commitPushFailed", { error: String(error) }),
            );
          }
        }
        return output;
      },
      true,
      "repository",
      "activityCommit",
    );
    if (committed) {
      this.message = "";
      // As in Git Extensions, the graph selection follows the new commit (HEAD).
      const head = this.headCommit();
      if (head) await this.focusBranch(head.hash);
    }
  }
  headCommit() {
    return this.snapshot?.commits.find((c) =>
      /(^|, )HEAD( -> |,|$)/.test(c.refs),
    );
  }
  async pushAgain() {
    if (
      await this.execute(
        () =>
          this.api.push(this.path, {
            remote: "",
            branch: "",
            setUpstream: false,
            forceWithLease: false,
            tags: false,
            dryRun: false,
          }),
        true,
        "repository",
        "activityPush",
      )
    )
      this.retryPush = false;
  }
  get pageSize() {
    return this.preferences?.historyPageSize || 150;
  }
  // True while the last page came back full, i.e. older history may exist.
  get hasMoreHistory() {
    return (
      !!this.snapshot &&
      this.snapshot.commits.length >= this.limit &&
      this.limit < MAX_HISTORY
    );
  }
  // Pages double so large histories load in a few requests while scrolling.
  async more() {
    if (this.busy || !this.hasMoreHistory) return;
    this.limit = Math.min(
      MAX_HISTORY,
      this.limit + Math.max(this.pageSize, this.limit),
    );
    await this.execute(
      () => Promise.resolve(""),
      false,
      "repository",
      "activityLoadMore",
    );
  }
  clearDiff() {
    this.selection++;
    this.diffLoading = false;
    this.selectedFile = "";
    this.diff = "";
  }
  async selectCommit(commit: Commit) {
    this.clearSelection();
    if (this.graphFocus.hash && this.graphFocus.hash !== commit.hash)
      this.graphFocus = { hash: "", request: this.graphFocus.request };
    this.clearDiff();
    this.selectedCommit = commit;
    this.details = null;
    this.detailsLoading = true;
    const detailsToken = ++this.detailsSelection;
    const detailsPath = this.path;
    void this.api
      .commitDetails(detailsPath, commit.hash)
      .then((details) => {
        if (detailsToken === this.detailsSelection && detailsPath === this.path)
          this.details = details;
      })
      .catch((error) => {
        if (detailsToken === this.detailsSelection && detailsPath === this.path)
          this.error = String(error);
      })
      .finally(() => {
        if (detailsToken === this.detailsSelection) this.detailsLoading = false;
      });
    this.commitFiles = [];
    const token = this.selection;
    const path = this.path;
    try {
      const files = await this.api.commitFiles(path, commit.hash);
      if (token === this.selection && path === this.path) {
        this.commitFiles = files;
        if (files[0]) await this.loadDiff(files[0], "commit");
      }
    } catch (e) {
      if (token === this.selection) this.error = String(e);
    }
  }
  async loadDiff(file: string, area: DiffArea) {
    this.selectedFile = file;
    this.selectedArea = area;
    this.diffLoading = true;
    const token = ++this.selection;
    const path = this.path;
    try {
      const diff = await this.api.diff(
        path,
        file,
        area,
        this.selectedCommit?.hash ?? "",
      );
      if (token === this.selection && path === this.path) this.diff = diff;
    } catch (e) {
      if (token === this.selection) {
        this.diff = "";
        this.error = String(e);
      }
    } finally {
      if (token === this.selection) this.diffLoading = false;
    }
  }
  showTab(tab: "history" | "changes") {
    this.tab = tab;
    this.clearDiff();
  }
}

// History rows are immutable once read; deep reactivity over thousands of
// commits only adds proxy overhead to scrolling and refreshes.
export const MAX_HISTORY = 100000;
export function rawCommits(commits: Commit[]): Commit[] {
  for (const commit of commits) markRaw(commit);
  return markRaw(commits);
}
export function sameCommits(a: Commit[], b: Commit[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!,
      y = b[i]!;
    if (
      x.hash !== y.hash ||
      x.refs !== y.refs ||
      x.subject !== y.subject ||
      x.parents.length !== y.parents.length
    )
      return false;
  }
  return true;
}

const EMPTY_FILES = markRaw([] as FileStatus[]);
const listCache = new WeakMap<
  FileStatus[],
  {
    staged: FileStatus[];
    unstaged: FileStatus[];
    maps: Record<FileArea, Map<string, FileStatus>>;
  }
>();
function fileLists(files = EMPTY_FILES) {
  let cached = listCache.get(files);
  if (!cached) {
    const staged: FileStatus[] = [],
      unstaged: FileStatus[] = [];
    const maps = {
      staged: new Map<string, FileStatus>(),
      unstaged: new Map<string, FileStatus>(),
    };
    for (const f of files) {
      if (f.index !== " " && !f.untracked && !f.conflict) {
        staged.push(f);
        maps.staged.set(f.path, f);
      }
      if (f.worktree !== " " || f.untracked || f.conflict) {
        unstaged.push(f);
        maps.unstaged.set(f.path, f);
      }
    }
    cached = { staged: markRaw(staged), unstaged: markRaw(unstaged), maps };
    listCache.set(files, cached);
  }
  return cached;
}
const membershipCache = new WeakMap<string[], Set<string>>();
function selectionSet(paths: string[]) {
  let set = membershipCache.get(paths);
  if (!set) {
    set = new Set(paths);
    membershipCache.set(paths, set);
  }
  return set;
}
const selectedCache = new WeakMap<
  string[],
  { files: FileStatus[]; selected: FileStatus[] }
>();
export function rawFiles(files: FileStatus[]) {
  for (const file of files) markRaw(file);
  return markRaw(files);
}
export function sameFiles(a: FileStatus[], b: FileStatus[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!,
      y = b[i]!;
    if (
      x.path !== y.path ||
      x.originalPath !== y.originalPath ||
      x.index !== y.index ||
      x.worktree !== y.worktree ||
      x.untracked !== y.untracked ||
      x.conflict !== y.conflict
    )
      return false;
  }
  return true;
}
