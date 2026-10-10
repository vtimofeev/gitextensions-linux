import { describe, it, expect, vi } from "vitest";
import { Repository } from "../src/store/repository";
import { GitApi } from "../src/api/git-api";
import type { Snapshot } from "../src/domain/models";
const snapshot: Snapshot = {
  path: "/repo",
  branch: "main",
  detached: false,
  operation: "",
  commits: [],
  branches: [],
  files: [],
  remotes: [],
};
function fixture() {
  const api = new GitApi();
  api.identity = vi.fn().mockResolvedValue({
    name: "Test",
    email: "test@example.test",
    scope: "local",
  });
  api.snapshot = vi.fn().mockResolvedValue(structuredClone(snapshot));
  api.commitDetails = vi.fn().mockResolvedValue(null);
  api.workingState = vi.fn().mockResolvedValue({ files: [], operation: "" });
  return { api, repo: new Repository(api) };
}
describe("repository workflow state", () => {
  it("clears retry push when opening a different repository", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    repo.retryPush = true;
    api.snapshot = vi
      .fn()
      .mockResolvedValue({ ...structuredClone(snapshot), path: "/other" });
    await repo.open("/other");
    expect(repo.retryPush).toBe(false);
  });
  it("refreshes after failed mutations and preserves commit drafts", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    repo.message = "Keep draft";
    api.commit = vi.fn().mockRejectedValue(new Error("hook rejected"));
    await repo.commit();
    expect(repo.message).toBe("Keep draft");
    expect(repo.error).toContain("hook rejected");
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    expect(repo.busy).toBe(false);
  });
  it("moves the graph selection to the new HEAD after a commit", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    const commit = (hash: string, refs: string) =>
      ({
        hash,
        parents: [],
        author: "Test",
        authorEmail: "test@example.test",
        date: "2026-10-01T12:00:00Z",
        subject: hash,
        refs,
      }) as unknown as Snapshot["commits"][number];
    api.snapshot = vi.fn().mockResolvedValue({
      ...structuredClone(snapshot),
      commits: [commit("new", "HEAD -> main"), commit("old", "")],
    });
    api.commit = vi.fn().mockResolvedValue("committed");
    api.commitFiles = vi.fn().mockResolvedValue([]);
    repo.message = "Add feature";
    await repo.commit(false);
    expect(repo.message).toBe("");
    expect(repo.selectedCommit?.hash).toBe("new");
    expect(repo.graphFocus.hash).toBe("new");
  });
  it("ignores stale diffs after a new selection", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    let resolve!: (s: string) => void;
    api.diff = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce("new diff");
    const first = repo.loadDiff("old", "unstaged");
    await repo.loadDiff("new", "unstaged");
    resolve("old diff");
    await first;
    expect(repo.selectedFile).toBe("new");
    expect(repo.diff).toBe("new diff");
    expect(repo.diffLoading).toBe(false);
  });
  it("updates selection immediately and debounces diff requests to the last file and area", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    api.diff = vi.fn().mockResolvedValue("latest diff");
    vi.useFakeTimers();
    try {
      const first = repo.loadDiff("first", "unstaged", 120);
      await vi.advanceTimersByTimeAsync(60);
      const last = repo.loadDiff("last", "staged", 120);
      expect(repo.selectedFile).toBe("last");
      expect(repo.selectedArea).toBe("staged");
      expect(repo.diffLoading).toBe(true);
      expect(repo.busy).toBe(false);
      await vi.advanceTimersByTimeAsync(119);
      expect(api.diff).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([first, last]);
      expect(api.diff).toHaveBeenCalledExactlyOnceWith(
        "/repo",
        "last",
        "staged",
        "",
      );
      expect(repo.diff).toBe("latest diff");
      expect(repo.diffLoading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("cancels a pending diff when selection is cleared", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    api.diff = vi.fn();
    vi.useFakeTimers();
    try {
      const pending = repo.loadDiff("first", "untracked", 120);
      repo.clearDiff();
      await vi.runAllTimersAsync();
      await pending;
      expect(api.diff).not.toHaveBeenCalled();
      expect(repo.selectedFile).toBe("");
      expect(repo.diffLoading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("ignores a late diff error while reopening the same repository", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    let reject!: (error: Error) => void;
    api.diff = vi.fn().mockImplementation(
      () =>
        new Promise<string>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const pending = repo.loadDiff("old", "unstaged");
    await repo.open("/repo");
    reject(new Error("stale error"));
    await pending;
    expect(repo.error).toBe("");
    expect(repo.diff).toBe("");
    expect(repo.diffLoading).toBe(false);
  });
  it("stages only the new path of an indexed rename with additional edits", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    api.stage = vi.fn().mockResolvedValue("");
    await repo.stage({
      path: "new",
      originalPath: "old",
      index: "R",
      worktree: "M",
      conflict: false,
      untracked: false,
    });
    expect(api.stage).toHaveBeenCalledWith("/repo", ["new"]);
  });
  it("blocks overlapping mutations", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    repo.busy = true;
    api.checkout = vi.fn();
    await repo.checkout("other");
    expect(api.checkout).not.toHaveBeenCalled();
  });
  it("holds busy while the native picker returns focus", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    let resolve!: (path: string) => void;
    api.chooseRepository = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const choosing = repo.choose();
    await repo.refresh();
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    resolve("/selected");
    await choosing;
    expect(api.snapshot).toHaveBeenLastCalledWith("/selected", 150);
    expect(repo.busy).toBe(false);
  });
  it("clears a committed draft even when automatic push fails", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    repo.message = "Committed once";
    repo.pushAfterCommit = true;
    api.commit = vi.fn().mockResolvedValue("Created");
    api.push = vi.fn().mockRejectedValue(new Error("remote rejected"));
    await repo.commit();
    expect(repo.message).toBe("");
    expect(api.commit).toHaveBeenCalledTimes(1);
    expect(repo.error).toContain("Commit created; push failed");
    expect(api.push).toHaveBeenCalledTimes(1);
  });
  it("does not push after a failed commit", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    repo.message = "Keep draft";
    repo.pushAfterCommit = true;
    api.commit = vi.fn().mockRejectedValue(new Error("hook rejected"));
    api.push = vi.fn();
    await repo.commit();
    expect(repo.message).toBe("Keep draft");
    expect(api.push).not.toHaveBeenCalled();
  });
  it("persists the post-commit push checkbox", () => {
    const { api, repo } = fixture();
    repo.pushAfterCommit = true;
    repo.persistPushPreference();
    expect(new Repository(api).pushAfterCommit).toBe(true);
    localStorage.removeItem("gitextensions.pushAfterCommit");
  });
  it("selects the first file and diff when choosing a commit", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    api.commitFiles = vi.fn().mockResolvedValue(["first", "second"]);
    api.diff = vi.fn().mockResolvedValue("first diff");
    const commit = {
      hash: "a",
      parents: [],
      subject: "Commit",
      authorEmail: "author@example.test",
      author: "Author",
      date: "",
      refs: "",
    };
    await repo.selectCommit(commit);
    expect(repo.selectedFile).toBe("first");
    expect(repo.selectedArea).toBe("commit");
    expect(repo.diff).toBe("first diff");
    expect(api.diff).toHaveBeenCalledWith("/repo", "first", "commit", "a");
  });
  it("ignores a late file list and selects the new commit's first file", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    let resolve!: (files: string[]) => void;
    api.commitFiles = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string[]>((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce(["new"]);
    api.diff = vi.fn().mockResolvedValue("new diff");
    const commit = {
      hash: "old",
      parents: [],
      subject: "Commit",
      authorEmail: "author@example.test",
      author: "",
      date: "",
      refs: "",
    };
    const first = repo.selectCommit(commit);
    await repo.selectCommit({ ...commit, hash: "new" });
    resolve(["old"]);
    await first;
    expect(repo.selectedFile).toBe("new");
    expect(api.diff).toHaveBeenCalledTimes(1);
    api.commitFiles = vi.fn().mockResolvedValue([]);
    await repo.selectCommit({ ...commit, hash: "empty" });
    expect(repo.selectedFile).toBe("");
    expect(repo.diff).toBe("");
  });
  it("refreshes only working state after staging and preserves graph inputs", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    const commit = {
      hash: "a",
      parents: [],
      subject: "Selected",
      authorEmail: "author@example.test",
      author: "",
      date: "",
      refs: "",
    };
    repo.snapshot!.commits = [commit];
    repo.selectedCommit = commit;
    const state = repo.snapshot,
      commits = state!.commits;
    repo.snapshot!.files = [
      {
        path: "file",
        originalPath: "",
        index: "M",
        worktree: "M",
        untracked: false,
        conflict: false,
      },
    ];
    api.workingState = vi
      .fn()
      .mockResolvedValue({ files: repo.snapshot!.files, operation: "" });
    api.stage = vi.fn().mockResolvedValue("Staged");
    api.unstage = vi.fn().mockResolvedValue("Unstaged");
    await repo.stage();
    await repo.unstage();
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    expect(api.workingState).toHaveBeenCalledTimes(2);
    expect(repo.snapshot).toBe(state);
    expect(repo.snapshot!.commits).toBe(commits);
    expect(repo.selectedCommit).toBe(commit);
  });
  it("preserves graph inputs when a full refresh returns identical history", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    const state = repo.snapshot,
      commits = state!.commits;
    api.snapshot = vi.fn().mockResolvedValue(structuredClone(state));
    await repo.refresh();
    expect(repo.snapshot).toBe(state);
    expect(repo.snapshot!.commits).toBe(commits);
  });
  it("reveals an older branch tip outside the loaded history", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    const commit = {
      hash: "old",
      parents: ["parent"],
      subject: "Old branch",
      authorEmail: "author@example.test",
      author: "",
      date: "",
      refs: "topic",
    };
    api.commitInfo = vi.fn().mockResolvedValue(commit);
    api.commitFiles = vi.fn().mockResolvedValue([]);
    await repo.focusBranch("old");
    expect(repo.selectedCommit).toBe(commit);
    expect(repo.snapshot!.commits).toContain(commit);
    expect(repo.graphFocus.hash).toBe("old");
  });
  it("ignores stale full commit metadata across commit selections", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    const commit = {
      hash: "old",
      parents: [],
      authorEmail: "author@example.test",
      author: "Author",
      date: "2026-10-01",
      subject: "Old",
      refs: "",
    };
    let resolve!: (value: unknown) => void;
    api.commitDetails = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce({ ...commit, hash: "new", message: "New body" });
    api.commitFiles = vi.fn().mockResolvedValue([]);
    await repo.selectCommit(commit);
    await repo.selectCommit({ ...commit, hash: "new" });
    resolve({ ...commit, message: "Old body" });
    await Promise.resolve();
    await Promise.resolve();
    expect(repo.details?.hash).toBe("new");
    expect(repo.details?.message).toBe("New body");
  });
  it("keeps a revealed reflog commit on focus refresh and clears it for author filtering", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    const commit = {
      hash: "lost",
      parents: [],
      authorEmail: "author@example.test",
      author: "Original",
      date: "2026-10-01",
      subject: "Recovered",
      refs: "",
    };
    api.commitInfo = vi.fn().mockResolvedValue(commit);
    api.commitFiles = vi.fn().mockResolvedValue([]);
    await repo.focusBranch("lost");
    await repo.refresh();
    expect(repo.selectedCommit?.hash).toBe("lost");
    api.historySnapshot = vi.fn().mockResolvedValue(structuredClone(snapshot));
    await repo.filterAuthor("Other");
    expect(api.historySnapshot).toHaveBeenCalledWith("/repo", 150, "Other");
    expect(repo.selectedCommit).toBeNull();
    expect(repo.details).toBeNull();
  });
});

describe("working file selection", () => {
  const file = (path: string, index = " ", worktree = "M") => ({
    path,
    index,
    worktree,
    originalPath: "",
    conflict: false,
    untracked: false,
  });
  async function selectedFixture() {
    const { api, repo } = fixture();
    await repo.open("/repo");
    repo.snapshot!.files = [
      file("a"),
      file("b"),
      file("c"),
      file("d", "M", " "),
    ];
    api.diff = vi.fn().mockResolvedValue("diff");
    return { api, repo };
  }
  it("toggles paths and starts a new selection when changing lists", async () => {
    const { repo } = await selectedFixture();
    repo.toggleFile("a", "unstaged");
    repo.toggleFile("b", "unstaged");
    expect(repo.selectedFiles.paths).toEqual(["a", "b"]);
    repo.toggleFile("a", "unstaged");
    expect(repo.selectedFiles.paths).toEqual(["b"]);
    repo.toggleFile("d", "staged");
    expect(repo.selectedFiles).toEqual({ area: "staged", paths: ["d"] });
    repo.toggleFile("a", "staged");
    expect(repo.selectedFiles.paths).toEqual(["d"]);
    repo.clearSelection();
    expect(repo.selectedFiles.paths).toEqual([]);
  });
  it("extends and contracts ranges from the anchor without crossing lists", async () => {
    const { repo } = await selectedFixture();
    repo.selectFile("c", "unstaged");
    repo.selectRange("a", "unstaged");
    expect(repo.selectedFiles.paths).toEqual(["a", "b", "c"]);
    repo.selectRange("b", "unstaged");
    expect(repo.selectedFiles.paths).toEqual(["b", "c"]);
    repo.selectRange("d", "staged");
    expect(repo.selectedFiles).toEqual({ area: "staged", paths: ["d"] });
    repo.selectAll("unstaged");
    expect(repo.selectedFiles.paths).toEqual(["a", "b", "c"]);
  });
  it("prunes disappeared paths after working and repository refreshes", async () => {
    const { api, repo } = await selectedFixture();
    repo.selectAll("unstaged");
    api.workingState = vi
      .fn()
      .mockResolvedValue({ files: [file("a"), file("c")], operation: "" });
    await repo.execute(async () => "", false, "working");
    expect(repo.selectedFiles.paths).toEqual(["a", "c"]);
    api.snapshot = vi
      .fn()
      .mockResolvedValue({ ...snapshot, files: [file("c")] });
    await repo.refresh();
    expect(repo.selectedFiles.paths).toEqual(["c"]);
    await repo.open("/another");
    expect(repo.selectedFiles.paths).toEqual([]);
  });
  it("batches stage, unstage, and both revert modes with rename paths", async () => {
    const { api, repo } = await selectedFixture();
    const rename = { ...file("new", " ", "R"), originalPath: "old" };
    const indexedRename = { ...rename, index: "R", worktree: "M" };
    api.stage = vi.fn().mockResolvedValue("");
    api.unstage = vi.fn().mockResolvedValue("");
    api.discard = vi.fn().mockResolvedValue("");
    await repo.stage([rename, file("other")]);
    expect(api.stage).toHaveBeenCalledWith("/repo", ["new", "old", "other"]);
    await repo.stage([indexedRename, file("other")]);
    expect(api.stage).toHaveBeenLastCalledWith("/repo", ["new", "other"]);
    await repo.unstage([indexedRename, file("other")]);
    expect(api.unstage).toHaveBeenCalledWith("/repo", ["new", "old", "other"]);
    await repo.discard([indexedRename, file("other")], true);
    await repo.discard([indexedRename, file("other")], false);
    expect(vi.mocked(api.discard).mock.calls).toEqual([
      ["/repo", ["new", "other"], true],
      ["/repo", ["new", "other"], false],
    ]);
  });
});

describe("large working trees", () => {
  it("caches partitions and selections, retains raw status identity on both refresh scopes", async () => {
    const { reactive, isReactive } = await import("vue");
    const { api, repo: plain } = fixture();
    const repo = reactive(plain);
    const files = Array.from({ length: 35000 }, (_, i) => ({
      path: `file-${i}`,
      originalPath: "",
      index: i < 30000 ? " " : "M",
      worktree: i < 30000 ? "M" : " ",
      conflict: false,
      untracked: false,
    }));
    api.snapshot = vi
      .fn()
      .mockImplementation(async () => structuredClone({ ...snapshot, files }));
    api.workingState = vi
      .fn()
      .mockImplementation(async () =>
        structuredClone({ files, operation: "" }),
      );
    await repo.open("/repo");
    const identity = repo.snapshot!.files,
      staged = repo.staged,
      unstaged = repo.unstaged;
    expect(repo.staged).toBe(staged);
    expect(repo.unstaged).toBe(unstaged);
    expect(isReactive(identity)).toBe(false);
    expect(isReactive(identity[0])).toBe(false);
    repo.selectFile("file-20", "unstaged");
    repo.selectRange("file-29000", "unstaged");
    expect(repo.selectedFiles.paths).toHaveLength(28981);
    expect(repo.isFileSelected("file-29000", "unstaged")).toBe(true);
    expect(repo.isFileSelected("file-19", "unstaged")).toBe(false);
    const selected = repo.selectionFiles("unstaged");
    expect(repo.selectionFiles("unstaged")).toBe(selected);
    repo.toggleFile("file-200", "unstaged");
    expect(repo.isFileSelected("file-200", "unstaged")).toBe(false);
    await repo.refresh();
    expect(repo.snapshot!.files).toBe(identity);
    expect(repo.unstaged).toBe(unstaged);
    await repo.execute(async () => "", false, "working");
    expect(repo.snapshot!.files).toBe(identity);
    expect(repo.staged).toBe(staged);
    files[0]!.originalPath = "old";
    await repo.refresh();
    expect(repo.snapshot!.files).not.toBe(identity);
    expect(repo.unstaged).not.toBe(unstaged);
    repo.selectAll("unstaged");
    expect(repo.selectedFiles.paths).toHaveLength(30000);
    repo.clearSelection();
    expect(repo.isFileSelected("file-29999", "unstaged")).toBe(false);
  });
});

describe("external tool sessions", () => {
  it("keeps repository reads available and refreshes after closing", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    let close!: (output: string) => void;
    const running = repo.executeExternalTool(
      () =>
        new Promise<string>((resolve) => {
          close = resolve;
        }),
    );
    expect(repo.busy).toBe(false);
    expect(repo.externalToolRunning).toBe(true);
    expect(
      await repo.executeExternalTool(() => Promise.resolve("duplicate")),
    ).toBe(false);
    await repo.refresh();
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    close("closed");
    expect(await running).toBe(true);
    expect(repo.externalToolRunning).toBe(false);
    expect(repo.output).toBe("closed");
    expect(api.snapshot).toHaveBeenCalledTimes(3);
  });
  it("ignores a tool's late failure after switching repositories", async () => {
    const { api, repo } = fixture();
    await repo.open("/repo");
    let fail!: (error: Error) => void;
    const running = repo.executeExternalTool(
      () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        }),
    );
    api.snapshot = vi
      .fn()
      .mockResolvedValue({ ...structuredClone(snapshot), path: "/other" });
    await repo.open("/other");
    fail(new Error("old repository tool failed"));
    expect(await running).toBe(false);
    expect(repo.path).toBe("/other");
    expect(repo.error).toBe("");
    expect(repo.externalToolRunning).toBe(false);
    expect(api.snapshot).toHaveBeenCalledTimes(1);
  });
  it("retains a tool error after refreshing the repository", async () => {
    const { repo } = fixture();
    await repo.open("/repo");
    expect(
      await repo.executeExternalTool(() =>
        Promise.reject(new Error("tool failed")),
      ),
    ).toBe(false);
    expect(repo.error).toContain("tool failed");
    expect(repo.busy).toBe(false);
    expect(repo.externalToolRunning).toBe(false);
  });
});
