import type { Page } from "@playwright/test";

// Fake Wails bridge (window.go.main.App) shared by the e2e and performance suites.
// The mutable repository state is exposed as window.testSnapshot.
export async function installBridge(page: Page) {
  await page.addInitScript(() => {
    const hash = "a".repeat(40);
    const snapshot = {
      path: "/tmp/ui-repo",
      homePath: "/home/test",
      ahead: 0,
      behind: 0,
      hasUpstream: false,
      dirtyCount: 1,
      branch: "main",
      detached: false,
      operation: "",
      commits: [
        {
          hash,
          parents: [],
          subject: "Initial commit",
          author: "Test Author",
          authorEmail: "mvp@example.test",
          date: "2026-09-30T12:00:00Z",
          refs: "HEAD -> main",
        },
      ],
      branches: [
        {
          name: "main",
          current: true,
          remote: false,
          hash,
          upstream: "",
          tracking: "",
        },
        {
          name: "feature",
          current: false,
          remote: false,
          hash,
          upstream: "",
          tracking: "",
        },
      ],
      files: [
        {
          path: "file.txt",
          originalPath: "",
          index: " ",
          worktree: "M",
          untracked: false,
          conflict: false,
        },
      ],
      remotes: ["origin"],
    };
    let identity = {
      name: "MVP Test",
      email: "mvp@example.test",
      scope: "local",
      localName: true,
      localEmail: true,
    };
    const identities: Record<string, typeof identity> = {};
    const calls: Array<{ name: string; args: unknown[] }> = [];
    Object.assign(window, {
      testStashes: [
        {
          hash: "d".repeat(40),
          selector: "stash@{0}",
          date: "2026-09-30",
          subject: "Saved changes",
        },
      ],
      testCalls: calls,
      testSnapshot: snapshot,
      testIdentities: identities,
      go: {
        main: {
          App: {
            StartReview: async (...args: unknown[]) => {
              calls.push({ name: "StartReview", args });
              return (args[1] as { tool: string }).tool;
            },
            CommitInfo: async (_path: string, revision: string) => ({
              ...snapshot.commits[0],
              hash: revision,
            }),
            CommitDetails: async (_path: string, revision: string) => ({
              ...snapshot.commits[0],
              hash: revision,
              authorEmail: "mvp@example.test",
              committer: "Test Committer",
              committerEmail: "committer@example.test",
              committerDate: "2026-09-30T13:00:00Z",
              message: "Initial commit\n\nComplete commit body",
            }),
            CopyText: async (...args: unknown[]) => {
              calls.push({ name: "CopyText", args });
            },
            HistorySnapshot: async (
              path: string,
              limit: number,
              author: string,
            ) => {
              calls.push({
                name: "HistorySnapshot",
                args: [path, limit, author],
              });
              return structuredClone({
                ...snapshot,
                path,
                commits: snapshot.commits.filter((c) =>
                  c.author.toLowerCase().includes(author.toLowerCase()),
                ),
              });
            },
            Stashes: async () =>
              structuredClone(
                (window as unknown as { testStashes: unknown[] }).testStashes,
              ),
            Reflog: async () => [
              {
                hash,
                selector: "HEAD@{0}",
                date: "2026-09-30 12:00:00 +0000",
                subject: "commit: Initial commit",
              },
              {
                hash: "b".repeat(40),
                selector: "HEAD@{1}",
                date: "2026-09-29 12:00:00 +0000",
                subject: "reset: moving to HEAD~1",
              },
            ],
            StashAction: async (...args: unknown[]) => {
              calls.push({ name: "StashAction", args });
              const target = window as unknown as {
                testStashes: Array<{
                  hash: string;
                  selector: string;
                  date: string;
                  subject: string;
                }>;
              };
              if (args[1] === "create") {
                target.testStashes.unshift({
                  hash: "c".repeat(40),
                  selector: "stash@{0}",
                  date: "2026-09-30",
                  subject: String(args[3]),
                });
                snapshot.files = [];
              }
              if (args[1] === "pop" || args[1] === "drop")
                target.testStashes = target.testStashes.filter(
                  (e) => e.hash !== args[2],
                );
              return "Stash applied";
            },
            Reset: async (...args: unknown[]) => {
              calls.push({ name: "Reset", args });
              return "Reset complete";
            },
            FileHistory: async (...args: unknown[]) => {
              calls.push({ name: "FileHistory", args });
              return [
                {
                  commit: snapshot.commits[0],
                  file: "file.txt",
                  originalPath: "old.txt",
                },
                {
                  commit: {
                    ...snapshot.commits[0],
                    hash: "b".repeat(40),
                    subject: "Before rename",
                    author: "Ada Lovelace",
                    authorEmail: "ada@example.test",
                  },
                  file: "old.txt",
                },
              ];
            },
            FileDiff: async (...args: unknown[]) => {
              calls.push({ name: "FileDiff", args });
              return `diff --git a/${args[1]} b/${args[1]}\n@@ -1,3 +1,3 @@\n unchanged\n-removed line\n+added line ${String(args[2]).slice(0, 8)}\n tail\n`;
            },
            FileContent: async (...args: unknown[]) => {
              calls.push({ name: "FileContent", args });
              return {
                text: "Full file content\nsecond line\n",
                binary: false,
              };
            },
            Blame: async (...args: unknown[]) => {
              calls.push({ name: "Blame", args });
              const first = {
                hash,
                author: "Test Author",
                email: "mvp@example.test",
                date: "2026-10-01T16:55:00+03:00",
                originalPath: "old.txt",
                summary: "Initial commit",
                line: 1,
                originalLine: 1,
                text: "Full file content",
              };
              return [
                first,
                { ...first, line: 2, originalLine: 2, text: "second line" },
                {
                  ...first,
                  hash: "b".repeat(40),
                  author: "Ada Lovelace",
                  email: "ada@example.test",
                  line: 3,
                  text: "third line",
                },
              ];
            },
            Identity: async (path: string) => identities[path] ?? identity,
            SetIdentity: async (_path: string, name: string, email: string) => {
              calls.push({ name: "SetIdentity", args: [_path, name, email] });
              identities[_path] = {
                name,
                email,
                scope: "local",
                localName: true,
                localEmail: true,
              };
              return "";
            },
            RepositoryExists: async (paths: string[]) =>
              Object.fromEntries(
                paths.map((path) => [path, !path.includes("missing")]),
              ),
            InitialRepository: async () =>
              localStorage.getItem("test.welcome") ? "" : "/tmp/ui-repo",
            ChooseRepository: async () => {
              window.dispatchEvent(new Event("focus"));
              return "/tmp/selected-repo";
            },
            Snapshot: async (path: string, limit?: number) => {
              if (path.includes("missing"))
                throw new Error("Repository not found: " + path);
              calls.push({ name: "Snapshot", args: [path, limit] });
              // Opt-in paging like the real backend (window.testHonorLimit).
              const honor = (window as unknown as { testHonorLimit?: boolean })
                .testHonorLimit;
              return structuredClone({
                ...snapshot,
                commits:
                  honor && limit
                    ? snapshot.commits.slice(0, limit)
                    : snapshot.commits,
                path,
                dirtyCount: snapshot.files.length,
              });
            },
            WorkingState: async () => ({
              files: structuredClone(snapshot.files),
              operation: snapshot.operation,
              dirtyCount: snapshot.files.length,
            }),
            RunDiffTool: async (...args: unknown[]) => {
              calls.push({ name: "RunDiffTool", args });
              return "Viewed";
            },
            CommitFiles: async () => ["file.txt"],
            Diff: async () =>
              "diff --git a/file.txt b/file.txt\nindex 123..456 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new",

            Conflict: async (_path: string, file: string) => ({
              path: file,
              token: "token",
              binary: false,
              oursPresent: true,
              theirsPresent: true,
              externalSupported: true,
            }),
            MergeTools: async () => [
              {
                name: "meld",
                path: "/usr/bin/meld",
                available: true,
                configured: false,
                default: true,
                custom: false,
                trustExit: false,
              },
            ],
            ConfigureMergeTool: async (...args: unknown[]) => {
              calls.push({ name: "ConfigureMergeTool", args });
              return "Configured";
            },
            RunMergeTool: async (...args: unknown[]) => {
              calls.push({ name: "RunMergeTool", args });
              snapshot.files[0]!.conflict = false;
              snapshot.files[0]!.index = "M";
              snapshot.files[0]!.worktree = " ";
              return "Resolved externally";
            },
            CancelMergeTool: async () => {},
            ResolveConflict: async (...args: unknown[]) => {
              calls.push({ name: "ResolveConflict", args });
              snapshot.files[0]!.conflict = false;
              snapshot.files[0]!.index = "M";
              snapshot.files[0]!.worktree = " ";
              return "Resolved";
            },
            Discard: async (...args: unknown[]) => {
              calls.push({ name: "Discard", args });
              const paths = new Set(args[1] as string[]);
              const worktreeOnly = args[2] as boolean;
              snapshot.files = snapshot.files.filter((f) => {
                if (!paths.has(f.path)) return true;
                if (worktreeOnly && !f.untracked && f.index !== " ") {
                  f.worktree = " ";
                  return true;
                }
                return false;
              });
              return "Discarded";
            },
            RefAction: async (...args: unknown[]) => {
              calls.push({ name: "RefAction", args });
              const options = args[1] as {
                action: string;
                target: string;
                name: string;
                checkout?: boolean;
              };
              if (options.action === "create-tag") {
                const commit = snapshot.commits.find(
                  (c) => c.hash === options.target,
                );
                if (commit) commit.refs += ", tag: " + options.name;
              }
              if (options.action === "delete-tag") {
                snapshot.commits.forEach((c) => {
                  c.refs = c.refs
                    .split(", ")
                    .filter((r) => r !== "tag: " + options.target)
                    .join(", ");
                });
              }
              if (options.action === "checkout") {
                snapshot.branch = options.target;
                snapshot.branches.forEach(
                  (b) => (b.current = b.name === options.target),
                );
              }
              if (options.action === "rename") {
                const branch = snapshot.branches.find(
                  (b) => b.name === options.target,
                );
                if (branch) branch.name = options.name;
              }
              if (options.action === "create") {
                snapshot.branches.push({
                  name: options.name,
                  current: false,
                  remote: false,
                  hash: options.target,
                  upstream: "",
                  tracking: "",
                });
                if (options.checkout) {
                  snapshot.branch = options.name;
                  snapshot.branches.forEach(
                    (b) => (b.current = b.name === options.name),
                  );
                }
              }
              if (["continue", "abort", "skip"].includes(options.action))
                snapshot.operation = "";
              return "Applied " + options.action;
            },
            Checkout: async (...args: unknown[]) => {
              calls.push({ name: "Checkout", args });
              snapshot.branch = String(args[1]);
              snapshot.branches.forEach((b) => {
                b.current = b.name === args[1];
              });
              return "Switched";
            },
            CreateBranch: async (...args: unknown[]) => {
              calls.push({ name: "CreateBranch", args });
              snapshot.branches.push({
                name: String(args[1]),
                current: false,
                remote: false,
                hash,
                upstream: "",
                tracking: "",
              });
              if (args[3]) {
                snapshot.branch = String(args[1]);
                snapshot.branches.forEach(
                  (b) => (b.current = b.name === args[1]),
                );
              }
              return "Created";
            },
            DeleteBranch: async (...args: unknown[]) => {
              calls.push({ name: "DeleteBranch", args });
              snapshot.branches = snapshot.branches.filter(
                (b) => b.name !== args[1],
              );
              return "Deleted";
            },
            Stage: async (...args: unknown[]) => {
              calls.push({ name: "Stage", args });
              const paths = new Set(args[1] as string[]);
              for (const f of snapshot.files.filter((f) => paths.has(f.path))) {
                f.index = f.untracked ? "A" : "M";
                f.worktree = " ";
                f.untracked = false;
              }
              return "Staged";
            },
            Unstage: async (...args: unknown[]) => {
              calls.push({ name: "Unstage", args });
              const paths = new Set(args[1] as string[]);
              for (const f of snapshot.files.filter((f) => paths.has(f.path))) {
                f.index = " ";
                f.worktree = "M";
              }
              return "Unstaged";
            },
            Commit: async (...args: unknown[]) => {
              calls.push({ name: "Commit", args });
              snapshot.files = [];
              return "Committed";
            },
            Push: async (...args: unknown[]) => {
              calls.push({ name: "Push", args });
              return "Pushed";
            },
            Pull: async (...args: unknown[]) => {
              calls.push({ name: "Pull", args });
              return "Pulled";
            },
            FetchAll: async (...args: unknown[]) => {
              calls.push({ name: "FetchAll", args });
              return "Fetched";
            },
          },
        },
      },
    });
  });
}
