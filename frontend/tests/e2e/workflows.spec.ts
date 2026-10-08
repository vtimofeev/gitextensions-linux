import { test, expect, type Page } from "@playwright/test";
import { installBridge } from "./bridge";

async function more(page: Page, label: string) {
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function darkTheme(page: Page) {
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
}
async function remoteOptions(page: Page, mode: string) {
  await page.locator(".sync-" + mode + " .p-splitbutton-dropdown").click();
  await page.getByRole("menuitem", { name: "Options…", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await installBridge(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Initial commit", exact: false }),
  ).toBeVisible();
});

test("history, diff, branch create checkout and delete", async ({ page }) => {
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click();
  await expect(page.locator(".diff-panel .file-row.selected")).toContainText(
    "file.txt",
  );
  await expect(page.locator(".diff-viewer")).toContainText("new");
  await page
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("checkbox", { name: "Switch to new branch" }),
  ).toBeChecked();
  await dialog.getByLabel("Branch name", { exact: true }).fill("topic");
  await dialog
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(page.locator(".branch-switcher")).toContainText("topic");
  await page
    .getByRole("button", { name: "Delete branch: feature", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete branch", exact: true })
    .click();
  await expect(
    page.getByTitle("Checkout: feature", { exact: true }),
  ).toHaveCount(0);
});

test("staging, unstaging and committing through class components", async ({
  page,
}) => {
  await page.locator('[data-area="unstaged"] .file-row').hover();
  await page
    .getByRole("button", { name: "Stage: file.txt", exact: true })
    .click();
  await page.locator('[data-area="staged"] .file-row').hover();
  await page
    .getByRole("button", { name: "Unstage: file.txt", exact: true })
    .click();
  await page.getByRole("button", { name: "Stage all", exact: true }).click();
  await page.getByLabel("Commit message", { exact: true }).fill("GUI commit");
  await page.evaluate(() => {
    // The new commit becomes HEAD, as git would report after committing.
    const w = window as unknown as {
      testSnapshot: { commits: { hash: string; refs: string }[] };
      go: { main: { App: { Commit: (...a: unknown[]) => Promise<string> } } };
    };
    const commit = w.go.main.App.Commit;
    w.go.main.App.Commit = async (...args: unknown[]) => {
      const result = await commit(...args);
      const previous = w.testSnapshot.commits[0]!;
      previous.refs = previous.refs.replace(/^HEAD -> /, "");
      w.testSnapshot.commits.unshift({
        ...previous,
        hash: "c".repeat(40),
        parents: [previous.hash],
        subject: "GUI commit",
        refs: "HEAD -> main",
      } as never);
      return result;
    };
  });
  await page
    .getByRole("button", { name: /^Commit(?: & push)? \d+ files$/ })
    .click();
  await expect(page.getByLabel("Commit message", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".output")).toContainText("Committed");
  await expect(page.locator(".commit-row.selected")).toContainText(
    "GUI commit",
  );
});

test("remote options, repository chooser, theme and localization", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Push", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Remote", { exact: true }).selectOption("origin");
  await dialog
    .getByLabel("Remote branch (empty uses configured default)", {
      exact: true,
    })
    .fill("topic");
  await dialog.getByLabel("Set upstream", { exact: true }).check();
  await dialog.getByLabel("Dry run", { exact: true }).check();
  await dialog.getByRole("button", { name: "Push", exact: true }).click();
  await remoteOptions(page, "pull");
  await dialog
    .getByLabel("Pull strategy", { exact: true })
    .selectOption("rebase");
  await dialog.getByRole("button", { name: "Pull", exact: true }).click();
  await remoteOptions(page, "fetch");
  await dialog.getByLabel("Prune deleted remote refs", { exact: true }).check();
  await dialog.getByRole("button", { name: "Fetch all", exact: true }).click();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  expect(calls.find((c) => c.name === "Push")?.args[1]).toMatchObject({
    remote: "origin",
    branch: "topic",
    setUpstream: true,
    dryRun: true,
  });
  expect(calls.find((c) => c.name === "Pull")?.args[3]).toBe("rebase");
  expect(calls.find((c) => c.name === "FetchAll")?.args[1]).toBe(true);
  await page.keyboard.press("Control+o");
  await page.getByRole("menuitem", { name: "Open folder…" }).click();
  await expect(page.locator(".repo-switcher")).toContainText("selected-repo");
  await darkTheme(page);
  await expect(page.locator("html")).toHaveClass(/app-theme-dark/);
  await more(page, "Language: EN");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("virtual graph keeps bounded rows, keyboard navigation and truthful filtered tails", async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = (
      window as unknown as {
        go: { main: { App: { Snapshot: () => Promise<unknown> } } };
      }
    ).go.main.App;
    app.Snapshot = async () => ({
      path: "/tmp/ui-repo",
      branch: "main",
      detached: false,
      operation: "",
      branches: [],
      files: [],
      remotes: [],
      commits: Array.from({ length: 1000 }, (_, i) => ({
        hash: `${i.toString(16).padStart(8, "0")}${"a".repeat(32)}`,
        parents:
          i < 999
            ? [`${(i + 1).toString(16).padStart(8, "0")}${"a".repeat(32)}`]
            : [],
        subject: `History commit ${i}`,
        author: "Graph Author",
        date: "2026-09-30T12:00:00Z",
        refs: i === 0 ? "HEAD -> main" : "",
      })),
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "HEAD -> main History commit 0",
      exact: true,
    }),
  ).toBeVisible();
  const scroller = page.locator(".history-scroll");
  expect(await page.locator(".commit-row").count()).toBeLessThan(25);
  const canvas = page.locator(".commit-canvas");
  expect(
    await canvas.evaluate((c) => (c as HTMLCanvasElement).height),
  ).toBeLessThan(700);
  await scroller.focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("button", { name: "History commit 999", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".commit-row.selected")).toContainText(
    "History commit 999",
  );
  expect(await page.locator(".commit-row").count()).toBeLessThan(25);
  const search = page.getByRole("textbox", {
    name: "Search recent commits",
    exact: true,
  });
  await search.fill("History commit 450");
  // Filters apply on Enter, not while typing.
  expect(await page.locator(".commit-row").count()).toBeGreaterThan(1);
  await search.press("Enter");
  await expect(page.locator(".commit-row")).toHaveCount(1);
  await expect(page.locator(".commit-row")).toContainText("History commit 450");
  await page
    .getByRole("button", { name: "History commit 450", exact: true })
    .click();
  await expect(page.locator(".commit-row.selected")).toContainText(
    "History commit 450",
  );
  // A sparse match set keeps a narrow graph: no lanes to hidden parents.
  await search.fill("History commit 4");
  await search.press("Enter");
  await expect(page.locator(".graph-loading")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".commit-canvas")
        .evaluate((el) => parseFloat((el as HTMLElement).style.width)),
    )
    .toBeLessThan(3 * 18 + 29);
  await page.getByRole("button", { name: "Clear filter" }).first().click();
  await expect(search).toHaveValue("");
  await expect
    .poll(() => page.locator(".commit-row").count())
    .toBeGreaterThan(10);
});

test("history loads more on scroll, keeps position and resets after filters", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as unknown as {
      testHonorLimit: boolean;
      testSnapshot: { commits: unknown[] };
    };
    w.testHonorLimit = true;
    w.testSnapshot.commits = Array.from({ length: 2000 }, (_, i) => ({
      hash: String(i).padStart(40, "0"),
      parents: i < 1999 ? [String(i + 1).padStart(40, "0")] : [],
      subject: `Paged commit ${i}`,
      author: "Author",
      authorEmail: "author@example.test",
      date: "2026-09-30T12:00:00Z",
      refs: i === 0 ? "HEAD -> main" : "",
    }));
    // Branch tips far below the first page (as in repositories with many branches).
    (w.testSnapshot as unknown as { branches: unknown[] }).branches.push(
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `origin/topic-${i}`,
        hash: String(1500 + i * 10).padStart(40, "0"),
        current: false,
        remote: true,
        upstream: "",
        tracking: "",
        date: "2026-09-30T12:00:00Z",
        ahead: 0,
        behind: 0,
      })),
    );
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const rows = page.locator(".history-panel .commit-row, .history .commit-row");
  await expect(page.locator(".commit-row").first()).toContainText(
    "Paged commit 0",
  );
  const loaded = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            testCalls: Array<{ name: string; args: unknown[] }>;
          }
        ).testCalls
          .filter((c) => c.name === "Snapshot")
          .map((c) => c.args[1] as number)
          .pop() ?? 0,
    );
  const scroller = page.locator(".history-scroll");
  // The first page uses the configured page size (default 200).
  const firstPage = await loaded();
  // Near the end of the first page the next page loads automatically.
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(loaded).toBeGreaterThan(firstPage);
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);
  // The position is kept: the view is not reset to the top.
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(1000);
  await expect(page.locator(".commit-row").first()).not.toContainText(
    "Paged commit 0",
  );
  expect(await rows.count()).toBeLessThan(60);
  // A filter starts again from the first page.
  const author = page.getByLabel("Author contains (name or email)");
  await author.fill("Author");
  await author.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls
            .filter((c) => c.name === "HistorySnapshot")
            .pop()?.args[1],
      ),
    )
    .toBe(firstPage);
  await page.getByRole("button", { name: "Clear filter" }).last().click();
  await expect.poll(loaded).toBe(firstPage);
  // No branch tips from the filtered result are appended after the reset, so
  // the graph does not grow dangling lanes.
  await expect(page.locator(".history h2")).toContainText(String(firstPage));
  await expect(page.locator(".graph-loading")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".commit-canvas")
        .evaluate((el) => parseFloat((el as HTMLElement).style.width)),
    )
    .toBeLessThan(3 * 18 + 29);
});

test("branch click opens menu with merge and rebase options", async ({
  page,
}) => {
  await page
    .getByTitle("Checkout: feature", { exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Merge", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Merge mode", { exact: true }).selectOption("no-ff");
  await dialog.getByLabel("Apply without committing", { exact: true }).check();
  await dialog
    .getByLabel("Optional merge message", { exact: true })
    .fill("Merge topic");
  await dialog.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByTitle("Checkout: feature", { exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rebase", exact: true }).click();
  await dialog.getByLabel("Recreate merge commits", { exact: true }).check();
  await dialog.getByRole("button", { name: "Rebase", exact: true }).click();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  expect(
    calls.filter((c) => c.name === "RefAction").map((c) => c.args[1]),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "merge",
        mode: "no-ff",
        noCommit: true,
        message: "Merge topic",
        target: "feature",
      }),
      expect.objectContaining({ action: "rebase", rebaseMerges: true }),
    ]),
  );
  await expect(page.locator(".panel").first()).toHaveCSS(
    "border-radius",
    "0px",
  );
});

test("commit context actions, errors and operation recovery", async ({
  page,
}) => {
  const commit = page.getByRole("button", {
    name: "Initial commit",
    exact: false,
  });
  await commit.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Cherry-pick", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Apply without committing", { exact: true }).check();
  await dialog
    .getByLabel("Record original commit ID (-x)", { exact: true })
    .uncheck();
  await dialog
    .getByRole("button", { name: "Cherry-pick", exact: true })
    .click();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  expect(calls.find((c) => c.name === "RefAction")?.args[1]).toMatchObject({
    action: "cherry-pick",
    noCommit: true,
    recordOrigin: false,
    mainline: 0,
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: { operation: string };
      go: { main: { App: { RefAction: () => Promise<string> } } };
    };
    w.go.main.App.RefAction = async () => {
      w.testSnapshot.operation = "merge";
      throw new Error("Merge conflict in file.txt");
    };
  });
  await page
    .getByTitle("Checkout: feature", { exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Merge", exact: true }).click();
  await dialog.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(
    page.locator("#error-notifications").getByRole("alert"),
  ).toContainText("Merge conflict");
  await expect(
    page.getByRole("button", { name: "Abort operation", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: { operation: string };
      go: { main: { App: { RefAction: () => Promise<string> } } };
    };
    w.go.main.App.RefAction = async () => {
      w.testSnapshot.operation = "";
      return "Aborted";
    };
  });
  await page
    .getByRole("button", { name: "Abort operation", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Abort operation", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".operation-controls")).toHaveCount(0);
});

test("sidebar working diff, drag staging, file menu and remembered commit push", async ({
  page,
}) => {
  const sidebar = page.locator(".sidebar-changes");
  await sidebar.getByRole("button", { name: "file.txt", exact: true }).click();
  await expect(page.locator(".diff-viewer")).toContainText("new");
  await sidebar
    .locator(".file-row")
    .dragTo(sidebar.locator('[data-area="staged"]'));
  await sidebar.locator('[data-area="staged"] .file-row').hover();
  await expect(
    sidebar.getByRole("button", { name: "Unstage: file.txt", exact: true }),
  ).toBeVisible();
  await sidebar
    .getByRole("button", { name: "file.txt", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unstage", exact: true }).click();
  await sidebar.locator('[data-area="unstaged"] .file-row').hover();
  await expect(
    sidebar.getByRole("button", { name: "Stage: file.txt", exact: true }),
  ).toBeVisible();
  await sidebar
    .getByRole("button", { name: "Commit Options…", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /Commit & push/ }).click();
  await page.reload();
  await expect(
    sidebar.getByRole("button", { name: /^Commit & push \d+ files$/ }),
  ).toBeVisible();
  await sidebar.locator('[data-area="unstaged"] .file-row').hover();
  await sidebar
    .getByRole("button", { name: "Stage: file.txt", exact: true })
    .click();
  await sidebar
    .getByLabel("Commit message", { exact: true })
    .fill("Sidebar commit");
  await sidebar
    .getByRole("button", { name: /^Commit(?: & push)? \d+ files$/ })
    .click();
  await expect(
    sidebar.getByLabel("Commit message", { exact: true }),
  ).toHaveValue("");
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  expect(
    calls.filter((c) => ["Commit", "Push"].includes(c.name)).map((c) => c.name),
  ).toEqual(["Commit", "Push"]);
});

test("sidebar file removal requires confirmation and clears stale diff", async ({
  page,
}) => {
  const file = page
    .locator(".sidebar-changes")
    .getByRole("button", { name: "file.txt", exact: true });
  await file.click();
  await expect(page.locator(".diff-viewer")).toBeVisible();
  await file.click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: "Revert",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("This cannot be undone");
  await dialog.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(file).toHaveCount(0);
  await expect(page.locator(".diff-viewer")).toHaveCount(0);
});

test("commit selection opens first diff and highlights files in both themes", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click();
  await expect(page.locator(".commit-row.selected")).toHaveCount(1);
  await expect(page.locator(".diff-panel .file-row.selected")).toContainText(
    "file.txt",
  );
  await expect(page.locator(".diff-viewer")).toContainText("new");
  await expect(page.locator(".commit-row.selected")).toHaveCSS(
    "background-color",
    "rgb(220, 235, 255)",
  );
  await darkTheme(page);
  await expect(page.locator(".commit-row.selected")).toHaveCSS(
    "background-color",
    "rgb(26, 58, 99)",
  );
  await page
    .locator(".sidebar-changes")
    .getByRole("button", { name: "file.txt", exact: true })
    .click();
  await expect(page.locator(".sidebar-changes .file-row.selected")).toHaveCSS(
    "background-color",
    "rgb(26, 58, 99)",
  );
  await expect(page.locator(".diff-panel > aside")).toHaveCount(0);
});

test("Git pointer markers remain on HEAD when viewing another commit", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: {
        commits: Array<{
          hash: string;
          parents: string[];
          subject: string;
          author: string;
          date: string;
          refs: string;
        }>;
      };
    };
    w.testSnapshot.commits.push({
      hash: "b".repeat(40),
      parents: [],
      subject: "Older commit",
      author: "Author",
      date: "2026-09-29T12:00:00Z",
      refs: "",
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Older commit", exact: true }).click();
  await expect(page.locator('.commit-row[data-head="true"]')).toContainText(
    "Initial commit",
  );
  await expect(
    page.locator('.commit-row[data-current-branch="true"]'),
  ).toContainText("Initial commit");
  await expect(page.locator(".commit-row.selected")).toContainText(
    "Older commit",
  );
  await expect(page.locator(".commit-row.selected")).toHaveAttribute(
    "data-head",
    "false",
  );
});

test("diff viewer strips Git metadata, numbers lines and virtualizes large patches", async ({
  page,
}) => {
  await page.evaluate(() => {
    const app = (
      window as unknown as {
        go: { main: { App: { Diff: () => Promise<string> } } };
      }
    ).go.main.App;
    app.Diff = async () =>
      "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1,10000 @@\n" +
      Array.from({ length: 10000 }, (_, i) => `+Line ${i + 1}`).join("\n");
  });
  await page
    .locator(".sidebar-changes")
    .getByRole("button", { name: "file.txt", exact: true })
    .click();
  const viewer = page.locator(".diff-viewer");
  await expect(viewer.locator(".diff-line.added").first()).toContainText(
    "Line 1",
  );
  await expect(viewer).not.toContainText("diff --git");
  await expect(viewer).not.toContainText("@@");
  await expect(viewer.locator(".new-line").first()).toHaveText("1");
  expect(await viewer.locator(".diff-line").count()).toBeLessThan(40);
  await viewer.locator(".diff-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(viewer.locator(".new-line").last()).toHaveText("10000");
  await expect(viewer).toContainText("Line 10000");
  expect(await viewer.locator(".diff-line").count()).toBeLessThan(40);
});

test("external merge-tool settings and conflict launch without a built-in editor", async ({
  page,
}) => {
  await more(page, "Merge tool settings");
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("External merge tool", { exact: true })
    .selectOption("meld");
  await dialog
    .getByLabel("Trust tool exit code for resolution", { exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Save as repository tool", exact: true })
    .click();
  await dialog
    .locator(".dialog-form")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: {
        operation: string;
        files: Array<{ conflict: boolean; index: string; worktree: string }>;
      };
    };
    w.testSnapshot.operation = "merge";
    Object.assign(w.testSnapshot.files[0]!, {
      conflict: true,
      index: "U",
      worktree: "U",
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByRole("button", { name: "Resolve conflict: file.txt", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("textarea")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Open external merge tool", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.locator('[data-area="staged"] .file-row').hover();
  await expect(
    page
      .locator(".sidebar-changes")
      .getByRole("button", { name: "Unstage: file.txt", exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  expect(calls.find((c) => c.name === "ConfigureMergeTool")?.args).toEqual([
    "/tmp/ui-repo",
    "meld",
    "/usr/bin/meld",
    true,
  ]);
  expect(calls.find((c) => c.name === "RunMergeTool")?.args).toEqual([
    "/tmp/ui-repo",
    "file.txt",
    "meld",
  ]);
  await page
    .getByRole("button", { name: "Continue operation", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Continue operation", exact: true })
    .click();
  await expect(page.locator(".operation-controls")).toHaveCount(0);
});

test("conflict side choice requires confirmation", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: {
        operation: string;
        files: Array<{ conflict: boolean; index: string; worktree: string }>;
      };
    };
    w.testSnapshot.operation = "rebase";
    Object.assign(w.testSnapshot.files[0]!, {
      conflict: true,
      index: "U",
      worktree: "U",
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .locator(".sidebar-changes")
    .getByRole("button", { name: "file.txt", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("During rebase");
  await dialog
    .getByRole("button", { name: "Keep theirs (stage 3)", exact: true })
    .click();
  await expect(dialog).toContainText("Replace the working file");
  await dialog
    .getByRole("button", { name: "Apply resolution", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  expect(calls.find((c) => c.name === "ResolveConflict")?.args).toEqual([
    "/tmp/ui-repo",
    "file.txt",
    "token",
    "theirs",
  ]);
});

test("persistent panel splitters resize the sidebar and history", async ({
  page,
}) => {
  const sidebar = page.locator(".sidebar");
  const width = (await sidebar.boundingBox())!.width;
  const horizontal = page.getByRole("separator", { name: "Resize sidebar" });
  const handle = (await horizontal.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + 100, handle.y + handle.height / 2);
  await page.mouse.up();
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(width + 60);
  const graph = page.locator(".history-scroll");
  const height = (await graph.boundingBox())!.height;
  const vertical = page.getByRole("separator", {
    name: "Resize history and diff",
  });
  const divider = (await vertical.boundingBox())!;
  await page.mouse.move(
    divider.x + divider.width / 2,
    divider.y + divider.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2, divider.y + 60);
  await page.mouse.up();
  expect((await graph.boundingBox())!.height).toBeGreaterThan(height + 35);
  const resizedWidth = (await sidebar.boundingBox())!.width;
  await page.reload();
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(resizedWidth, 0);
});

test("file menus pass the correct versions to the external tool", async ({
  page,
}) => {
  await page
    .locator('[data-area="unstaged"] .file-row')
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "View changes in external tool" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "View changes in external tool", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('[data-area="unstaged"] .file-row').hover();
  await page
    .getByRole("button", { name: "Stage: file.txt", exact: true })
    .click();
  const staged = page.locator('[data-area="staged"]');
  await expect(staged.locator(".file-row")).toHaveCount(1);
  expect(
    await staged.evaluate(
      (el) => el.parentElement!.previousElementSibling?.textContent,
    ),
  ).toContain("Commit");
  await staged.locator(".file-row").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "View changes in external tool" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "View changes in external tool", exact: true })
    .click();
  await page.locator(".commit-row .subject").click();
  await page.locator(".diff-panel .file-row").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "View changes in external tool" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "View changes in external tool", exact: true })
    .click();
  const calls = await page.evaluate(() =>
    (
      window as unknown as { testCalls: { name: string; args: unknown[] }[] }
    ).testCalls.filter((c) => c.name === "RunDiffTool"),
  );
  expect(calls.map((c) => c.args.slice(1))).toEqual([
    ["file.txt", "unstaged", "", "meld"],
    ["file.txt", "staged", "", "meld"],
    ["file.txt", "commit", "a".repeat(40), "meld"],
  ]);
});

test("branch click reveals its commit and staging preserves graph scroll and selection", async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = (
      window as unknown as {
        testSnapshot: { commits: unknown[]; branches: { hash: string }[] };
      }
    ).testSnapshot;
    const commits = Array.from({ length: 140 }, (_, i) => ({
      hash: String(i).padStart(40, "0"),
      parents: i < 139 ? [String(i + 1).padStart(40, "0")] : [],
      subject: `Commit ${i}`,
      author: "Author",
      date: "2026-09-30T12:00:00Z",
      refs: i === 0 ? "HEAD -> main" : "",
    }));
    state.commits = commits;
    state.branches[1]!.hash = commits[110]!.hash;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".graph-loading")).toHaveCount(0);
  await page.getByTitle("Checkout: feature", { exact: true }).click();
  await expect(page.locator(".commit-row.selected")).toContainText(
    "Commit 110",
  );
  await expect(page.getByRole("menu")).toHaveCount(0);
  const scroll = await page
    .locator(".history-scroll")
    .evaluate((el) => el.scrollTop);
  expect(scroll).toBeGreaterThan(2000);
  await page.locator('[data-area="unstaged"] .file-row').hover();
  await page
    .getByRole("button", { name: "Stage: file.txt", exact: true })
    .click();
  await expect(page.locator('[data-area="staged"] .file-row')).toHaveCount(1);
  expect(
    await page.locator(".history-scroll").evaluate((el) => el.scrollTop),
  ).toBe(scroll);
  await expect(page.locator(".commit-row.selected")).toContainText(
    "Commit 110",
  );
  await page.locator('[data-area="staged"] .file-row').hover();
  await page
    .getByRole("button", { name: "Unstage: file.txt", exact: true })
    .click();
  await expect(page.locator('[data-area="unstaged"] .file-row')).toHaveCount(1);
  expect(
    await page.locator(".history-scroll").evaluate((el) => el.scrollTop),
  ).toBe(scroll);
});

test("ref capsules use Ocean colors and emphasize Git's current branch", async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = (
      window as unknown as {
        testSnapshot: {
          commits: {
            hash: string;
            refs: string;
            subject: string;
            parents: string[];
            author: string;
            date: string;
          }[];
          branches: {
            name: string;
            hash: string;
            current: boolean;
            remote: boolean;
            upstream: string;
            tracking: string;
          }[];
        };
      }
    ).testSnapshot;
    state.commits[0]!.refs = "HEAD -> main, origin/main, tag: v1";
    state.branches.push({
      ...state.branches[0]!,
      name: "origin/main",
      remote: true,
      current: false,
    });
    const older = {
      ...state.commits[0]!,
      hash: "b".repeat(40),
      refs: "feature",
      subject: "Older commit",
    };
    state.commits.push(older);
    state.branches[1]!.hash = older.hash;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const current = page.locator(".ref-label.current");
  await expect(current).toHaveText("main");
  await expect(current).toHaveCSS("font-weight", "600");
  await expect(current).toHaveCSS("border-radius", "4px");
  await expect(current).toHaveCSS("border-top-width", "1px");
  await expect(
    page.locator(".ref-label.local").filter({ hasText: "feature" }),
  ).toHaveCSS("font-weight", "400");
  const colors = async () =>
    Promise.all(
      ["local", "remote", "tag"].map((kind) =>
        page
          .locator(".ref-label." + kind)
          .first()
          .evaluate((el) => getComputedStyle(el).color),
      ),
    );
  expect(new Set(await colors()).size).toBe(3);
  await page
    .getByRole("button", { name: "Older commit", exact: false })
    .click();
  await expect(current).toHaveText("main");
  await expect(page.locator(".commit-row.selected")).toContainText(
    "Older commit",
  );
  await darkTheme(page);
  expect(new Set(await colors()).size).toBe(3);
  await expect(current).toHaveCSS("font-weight", "600");
});

test("stash create options, apply index and confirmed drop", async ({
  page,
}) => {
  await more(page, "Stash");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Stash message").fill("WIP with index");
  await dialog.getByLabel("Keep staged changes").check();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog.locator(".entry")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls
            .filter((c) => c.name === "StashAction")
            .at(-1)?.args,
      ),
    )
    .toEqual([
      "/tmp/ui-repo",
      "create",
      "",
      "WIP with index",
      true,
      true,
      false,
    ]);
  await dialog.locator(".entry").filter({ hasText: "WIP with index" }).click();
  await dialog.getByLabel("Restore staged state").check();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls
            .filter((c) => c.name === "StashAction")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "apply", "c".repeat(40), "", false, false, true]);
  await dialog.locator(".entry").filter({ hasText: "Saved changes" }).click();
  await dialog
    .getByRole("button", { name: "Remove stash", exact: true })
    .click();
  await expect(dialog).toContainText("Remove this stash permanently?");
  await dialog
    .getByRole("button", { name: "Remove stash", exact: true })
    .last()
    .click();
  await expect(dialog.locator(".entry")).toHaveCount(1);
});

test("reflog selects immutable commit and hard reset requires confirmation", async ({
  page,
}) => {
  await more(page, "Reflog");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".entry").filter({ hasText: "HEAD@{1}" }).click();
  await dialog.getByRole("button", { name: "Reset to this commit" }).click();
  await expect(dialog.getByLabel("Target commit")).toHaveValue("b".repeat(40));
  await dialog.getByLabel("Reset mode").selectOption("hard");
  const submit = dialog.getByRole("button", {
    name: "Reset current branch",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("I confirm discarding local changes").check();
  await submit.click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls.find((c) => c.name === "Reset")?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "b".repeat(40), "hard"]);
});

test("complete commit details context copies native clipboard and author filter reaches backend", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click();
  const info = page.getByRole("group", { name: "Commit information" });
  await expect(info).toContainText("Complete commit body");
  await expect(info).toContainText("committer@example.test");
  await info.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy commit information" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls.find((c) => c.name === "CopyText")?.args[0],
      ),
    )
    .toContain("Complete commit body");
  const author = page.getByLabel("Author contains (name or email)");
  await author.fill("Unknown");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.locator(".commit-row")).toHaveCount(0);
  // × resets the filter and reloads the full history.
  await page.getByRole("button", { name: "Clear filter" }).last().click();
  await expect(author).toHaveValue("");
  await expect(page.locator(".commit-row")).toHaveCount(1);
  // Enter applies the filter.
  await author.fill("Unknown");
  await author.press("Enter");
  await expect(page.locator(".commit-row")).toHaveCount(0);
  await author.press("Escape");
  await expect(page.locator(".commit-row")).toHaveCount(1);
});

test("file context whole content, rename history and blame navigate committed versions", async ({
  page,
}) => {
  await page
    .locator('[data-area="unstaged"] .file-button')
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "View whole file", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".cm-scroller")).toContainText(
    "Full file content",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls.find((c) => c.name === "FileContent")?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "file.txt", "unstaged", "HEAD"]);
  await dialog
    .getByRole("button", { name: "File history", exact: true })
    .click();
  await expect(dialog.locator(".history-entry")).toHaveCount(2);
  await expect(dialog.locator(".history-entry.selected")).toContainText(
    "Initial commit",
  );
  await expect(dialog.locator(".diff-line.hunk")).toHaveCount(1);
  await expect(dialog.locator(".history-entry").first()).toContainText(
    "old.txt → file.txt",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls.find((call) => call.name === "FileDiff")?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "file.txt", "a".repeat(40), false]);
  await dialog.getByRole("tab", { name: "Blame", exact: true }).click();
  await expect(dialog.locator(".cm-gutters")).toContainText("Test Author");
  await dialog.locator(".blame-gutter").first().click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("tab", { name: "Whole file with changes", exact: true })
    .click();
  await expect(dialog.locator(".cm-added-line")).toContainText(
    "added line aaaaaaaa",
  );
  await expect(dialog.locator(".cm-removed-block")).toContainText(
    "removed line",
  );
  await expect(dialog.locator(".cm-removed-block .removed-number")).toHaveText(
    "2",
  );
  for (const kind of ["added", "removed"]) {
    expect(
      await dialog
        .locator(kind === "added" ? ".cm-added-line" : ".cm-removed-block")
        .evaluate((el, type) => {
          const probe = document.createElement("div");
          probe.style.backgroundColor = `var(--diff-${type}-background)`;
          el.append(probe);
          const matches =
            getComputedStyle(el).backgroundColor ===
            getComputedStyle(probe).backgroundColor;
          probe.remove();
          return matches;
        }, kind),
    ).toBe(true);
  }
  await dialog
    .locator(".history-entry")
    .filter({ hasText: "Before rename" })
    .locator(".revision-button")
    .click();
  await expect(
    dialog.getByRole("tab", { name: "Whole file with changes" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(dialog.locator(".cm-added-line")).toContainText(
    "added line bbbbbbbb",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls
            .filter((c) => c.name === "FileDiff")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "old.txt", "b".repeat(40), true]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await openFileHistory(page);
  await expect(
    dialog.getByRole("tab", { name: "Whole file with changes" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(dialog.locator(".cm-added-line")).toContainText(
    "added line aaaaaaaa",
  );
  await dialog.locator(".file-history").focus();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator(".history-entry.selected")).toContainText(
    "Before rename",
  );
  await dialog
    .locator(".history-entry")
    .first()
    .getByRole("button", { name: "View commit", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".commit-row.selected")).toHaveCount(1);
});

test("whole-file view keeps large files virtual and supports horizontal scrolling and binary notices", async ({
  page,
}) => {
  await page.evaluate(() => {
    const backend = (
      window as unknown as {
        go: {
          main: {
            App: {
              FileContent: () => Promise<{ text: string; binary: boolean }>;
            };
          };
        };
      }
    ).go.main.App;
    backend.FileContent = async () => ({
      text: Array.from(
        { length: 10000 },
        (_, i) => `line ${i + 1}${i === 9999 ? " " + "x".repeat(4000) : ""}`,
      ).join("\n"),
      binary: false,
    });
  });
  await page
    .locator('[data-area="unstaged"] .file-button')
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "View whole file", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".cm-scroller")).toContainText("line 1");
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(80);
  await dialog.locator(".cm-scroller").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(dialog.locator(".cm-scroller")).toContainText("line 10000");
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(80);
  expect(
    await dialog
      .locator(".cm-scroller")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.evaluate(() => {
    const backend = (
      window as unknown as {
        go: {
          main: {
            App: {
              FileContent: () => Promise<{ text: string; binary: boolean }>;
            };
          };
        };
      }
    ).go.main.App;
    backend.FileContent = async () => ({ text: "", binary: true });
  });
  await dialog
    .getByRole("button", { name: "View whole file", exact: true })
    .click();
  await expect(dialog).toContainText("Binary file — text preview unavailable");
});

test("top bar aligns at three widths, collapses and fits 1100px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const alignment = async () =>
    page.evaluate(() => {
      const left = document
        .querySelector(".toolbar-left")!
        .getBoundingClientRect();
      const gutter = document
        .querySelector(".workspace-split > .p-splitter-gutter")!
        .getBoundingClientRect();
      return Math.abs(left.right - (gutter.left + gutter.width / 2));
    });
  await expect.poll(alignment).toBeLessThanOrEqual(1);
  await expect(page.locator(".app-toolbar")).toHaveCSS("height", "44px");
  for (const desired of [260, 350, 440]) {
    const gutter = (await page
      .locator(".workspace-split > .p-splitter-gutter")
      .boundingBox())!;
    await page.mouse.move(gutter.x + gutter.width / 2, gutter.y + 200);
    await page.mouse.down();
    await page.mouse.move(desired, gutter.y + 200);
    await page.mouse.up();
    await expect.poll(alignment).toBeLessThanOrEqual(1);
  }
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBe(0);
  await expect.poll(alignment).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect
    .poll(() =>
      page
        .locator(".app-toolbar")
        .evaluate((el) => el.scrollWidth - el.clientWidth),
    )
    .toBe(0);
});

test("settings theme import, live fonts, save/reload and cancel rollback", async ({
  page,
}) => {
  await page.keyboard.press("Control+,");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await expect(dialog.getByLabel("Font Family", { exact: true })).toHaveValue(
    '"Ubuntu", system-ui, "Segoe UI", "Droid Sans", sans-serif',
  );
  await dialog.getByLabel("Font Size", { exact: true }).fill("20");
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "49px");
  await expect
    .poll(() =>
      page
        .locator(".commit-canvas")
        .evaluate((el) => parseFloat((el as HTMLElement).style.width)),
    )
    .toBeGreaterThan(50);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "32px");
  await page.keyboard.press("Control+,");
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".commit-row .subject").first().click();
  const canvasBefore = await page
    .locator(".commit-canvas")
    .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await page.keyboard.press("Control+,");
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  const primaryBefore = await dialog
    .getByRole("button", { name: "Save", exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const accent = dialog.getByLabel("color-accent hex", { exact: true });
  await accent.fill("#123456");
  await accent.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent")
          .trim(),
      ),
    )
    .toBe("#123456");
  await expect
    .poll(() =>
      dialog
        .getByRole("button", { name: "Save", exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .not.toBe(primaryBefore);
  await dialog.getByLabel("graph-lane-1 hex", { exact: true }).fill("#654321");
  await dialog.getByLabel("graph-lane-1 hex", { exact: true }).press("Tab");
  await expect
    .poll(() =>
      page
        .locator(".commit-canvas")
        .evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
    )
    .not.toBe(canvasBefore);
  await dialog.getByLabel("Font Size", { exact: true }).fill("16");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "39px");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent")
          .trim(),
      ),
    )
    .toBe("#123456");
  await page.keyboard.press("Control+0");
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "32px");
  await page.keyboard.press("Control+,");
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export theme", exact: true })
    .click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let json = "";
  if (stream) for await (const chunk of stream) json += chunk.toString();
  const exported = JSON.parse(json);
  await dialog.getByRole("button", { name: "Neutral", exact: true }).click();
  await dialog.getByLabel("Paste theme JSON", { exact: true }).fill(json);
  await dialog
    .getByRole("button", { name: "Import theme", exact: true })
    .click();
  await expect(accent).toHaveValue(exported.light["color-accent"]);
  await expect
    .poll(() =>
      page.evaluate(
        (keys) =>
          Object.fromEntries(
            keys.map((key) => [
              key,
              getComputedStyle(document.documentElement)
                .getPropertyValue("--" + key)
                .trim(),
            ]),
          ),
        Object.keys(exported.light),
      ),
    )
    .toEqual(exported.light);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent")
          .trim(),
      ),
    )
    .toBe("#123456");
});

test("profiles, path rules and missing identity guard", async ({ page }) => {
  await page.keyboard.press("Control+,");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("tab", { name: "Profiles", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await dialog.getByLabel("Label", { exact: true }).fill("Work");
  await dialog.getByLabel("Name", { exact: true }).fill("Worker");
  await dialog.getByLabel("Email", { exact: true }).fill("work@example.test");
  await dialog.getByRole("button", { name: "Add rule", exact: true }).click();
  await dialog
    .getByLabel("Path glob (e.g. ~/work/**)", { exact: true })
    .fill("/tmp/**");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".identity-avatar").click();
  await page.getByRole("menuitem", { name: /Work — Worker/ }).click();
  await expect(page.locator(".committing-as")).toContainText(
    "Work · work@example.test",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "SetIdentity")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "Worker", "work@example.test"]);
  await page.evaluate(() => {
    (window as any).go.main.App.Identity = async () => ({
      name: "",
      email: "",
      scope: "local",
      localName: false,
      localEmail: false,
    });
  });
  await page.keyboard.press("Control+o");
  await page
    .getByLabel("Repository path", { exact: true })
    .fill("/tmp/rule-repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "SetIdentity")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/rule-repo", "Worker", "work@example.test"]);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Applied profile Work by rule /tmp/**" }),
  ).toBeVisible();
  await expect(page.locator(".identity-error")).toContainText(
    "Identity not configured",
  );
  await page.getByRole("button", { name: "Stage all", exact: true }).click();
  await page
    .getByLabel("Commit message", { exact: true })
    .fill("Needs identity");
  await expect(
    page.getByRole("button", { name: "Commit 1 files", exact: true }),
  ).toBeDisabled();
});

test("palette keyboard navigation, go-to-commit and font shortcuts", async ({
  page,
}) => {
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Search commands…" });
  await expect(search).toBeFocused();
  await search.fill("sip");
  await expect(
    page.locator(".command-palette").getByRole("option"),
  ).toContainText("Switch identity profile");
  await page.keyboard.press("Escape");
  await expect(search).not.toBeVisible();
  await page.keyboard.press("Control+Shift+g");
  await page.getByLabel("SHA or ref", { exact: true }).fill("aaaa");
  await page.getByLabel("SHA or ref", { exact: true }).press("Enter");
  await expect(page.locator(".commit-row.selected")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+g");
  await page.getByLabel("SHA or ref", { exact: true }).fill("missing");
  await page.getByLabel("SHA or ref", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toContainText("Not in loaded history");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+=");
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "34px");
  await page.keyboard.press("Control+-");
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "32px");
});

test("sync primary styling, remembered modes, force confirmation and retry push", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.assign((window as any).testSnapshot, {
      ahead: 2,
      behind: 1,
      hasUpstream: true,
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".branch-switcher")).toContainText("↑2 ↓1");
  await expect(
    page.locator(".sync-push .p-splitbutton-button"),
  ).not.toHaveClass(/p-button-secondary/);
  await page.locator(".sync-pull .p-splitbutton-dropdown").click();
  await page.getByRole("menuitem", { name: "Rebase", exact: true }).click();
  await page.getByRole("button", { name: "Pull", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls.filter((c: any) => c.name === "Pull").at(-1)
            ?.args[3],
      ),
    )
    .toBe("rebase");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".sync-push .p-splitbutton-dropdown").click();
  await page
    .getByRole("menuitem", { name: "Push (force with lease)", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls.filter((c: any) => c.name === "Push")
            .length,
      ),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Stage all", exact: true }).click();
  await page.getByLabel("Commit message", { exact: true }).fill("Retry safely");
  await page.evaluate(() => {
    (window as any).go.main.App.Push = async () => {
      throw new Error("remote rejected");
    };
  });
  await page
    .getByLabel("Commit message", { exact: true })
    .press("Control+Shift+Enter");
  await expect(page.getByLabel("Commit message", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: "Retry push", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  await expect(
    page.locator("#error-notifications").getByRole("alert"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry push", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).go.main.App.Push = async (...args: unknown[]) => {
      (window as any).testCalls.push({ name: "Push", args });
      return "Pushed";
    };
  });
  await page.getByRole("button", { name: "Retry push", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry push", exact: true }),
  ).not.toBeVisible();
});

test("redesign screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".commit-row .subject").first().click();
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({ path: "../docs/screenshots/redesign-light.png" });
  await page.keyboard.press("Control+o");
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({ path: "../docs/screenshots/redesign-repo-menu.png" });
  await page.keyboard.press("Escape");
  await page.locator(".identity-avatar").click();
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "../docs/screenshots/redesign-identity-menu.png",
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+b");
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "../docs/screenshots/redesign-branch-menu.png",
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+,");
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({ path: "../docs/screenshots/redesign-settings.png" });
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "../docs/screenshots/redesign-configurator.png",
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await darkTheme(page);
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({ path: "../docs/screenshots/redesign-dark.png" });
  await page.keyboard.press("Control+,");
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "../docs/screenshots/redesign-configurator-dark.png",
  });
  await page.getByLabel("Font Size", { exact: true }).scrollIntoViewIfNeeded();
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({ path: "../docs/screenshots/redesign-fonts.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Control+k");
  // Let PrimeVue overlay enter animations finish before capturing.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "../docs/screenshots/redesign-command-palette.png",
  });
  await page.keyboard.press("Escape");
});

test("System theme follows OS and focus refresh obeys its setting", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/app-theme-dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/app-theme-dark/);
  await page.keyboard.press("Control+,");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog
    .getByLabel("Auto-refresh on window focus", { exact: true })
    .uncheck();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const calls = () =>
    page.evaluate(
      () =>
        (window as any).testCalls.filter((c: any) => c.name === "Snapshot")
          .length,
    );
  const count = await calls();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(await calls()).toBe(count);
  await page.keyboard.press("Control+,");
  await dialog
    .getByLabel("Auto-refresh on window focus", { exact: true })
    .check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(calls).toBeGreaterThan(count);
});

test("toolbar menus work from keyboard and split arrows are labelled", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Fetch all Options…", exact: true }),
  ).toHaveAttribute("title", "Options…");
  await expect(
    page.getByRole("button", { name: "Pull Options…", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Push Options…", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+b");
  await expect(
    page.getByLabel("Search branches (contains)", { exact: true }).last(),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls.find((c: any) => c.name === "Checkout")
            ?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "feature"]);
  await page.keyboard.press("Control+o");
  await expect(
    page.getByLabel("Repository path", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Repository path", { exact: true }),
  ).not.toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search commands…" })
    .fill("settings");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("sync progress names the operation and clears when ready", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).go.main.App.FetchAll = () =>
      new Promise<string>((resolve) => {
        (window as any).releaseFetch = resolve;
      });
  });
  await page.getByRole("button", { name: "Fetch all", exact: true }).click();
  await expect(page.locator(".progress")).toContainText("Fetching…");
  await expect(page.locator("footer")).toContainText("Fetching…");
  await page.evaluate(() => {
    (window as any).releaseFetch("Fetched");
  });
  await expect(page.locator(".progress")).not.toBeVisible();
  await expect(page.locator("footer")).toContainText("Ready");
});

test("graph row checkout flyout checks out a local branch immediately", async ({
  page,
}) => {
  await page.locator(".commit-row .hash").first().click({ button: "right" });
  const checkout = page.getByRole("menuitem", {
    name: "Checkout branch",
    exact: false,
  });
  await checkout.hover();
  const submenu = page.getByRole("menu", {
    name: "Checkout branch",
    exact: true,
  });
  await expect(
    submenu.getByRole("menuitem", { name: "✓ main", exact: true }),
  ).toBeDisabled();
  await submenu.getByRole("menuitem", { name: "feature", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "Checkout")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "feature"]);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("remote graph pill checkout prefills its tracking branch name", async ({
  page,
}) => {
  await page.evaluate(() => {
    const snapshot = (window as any).testSnapshot;
    snapshot.branches.push({
      ...snapshot.branches[1],
      name: "origin/topic/nested",
      remote: true,
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .locator('.ref-label.remote[title="origin/topic/nested"]')
    .click({ button: "right" });
  await expect(page.locator(".ref-menu-target")).toHaveText(
    "origin/topic/nested",
  );
  await page.getByRole("menuitem", { name: "Checkout", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Checkout", exact: true });
  await expect(dialog.getByLabel("Branch name", { exact: true })).toHaveValue(
    "topic/nested",
  );
  await dialog.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "RefAction")
            .at(-1)?.args[1],
      ),
    )
    .toMatchObject({
      action: "checkout",
      target: "origin/topic/nested",
      remote: true,
      name: "topic/nested",
      detach: false,
    });
});

test("graph row delete flyout opens branch confirmation", async ({ page }) => {
  await page.locator(".commit-row .hash").first().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete branch", exact: false })
    .hover();
  const submenu = page.getByRole("menu", {
    name: "Delete branch",
    exact: true,
  });
  await expect(
    submenu.getByRole("menuitem", { name: "✓ main", exact: true }),
  ).toBeDisabled();
  await submenu.getByRole("menuitem", { name: "feature", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete branch",
    exact: true,
  });
  await expect(dialog).toContainText("Delete branch feature?");
  await expect(
    dialog.getByLabel("Force delete unmerged branch", { exact: true }),
  ).not.toBeChecked();
});

test("graph flyouts support keyboard opening, closing and activation", async ({
  page,
}) => {
  await page.locator(".commit-row .hash").first().focus();
  await page.keyboard.press("Shift+F10");
  const checkout = page.getByRole("menuitem", {
    name: "Checkout branch",
    exact: false,
  });
  await expect(checkout).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const submenu = page.getByRole("menu", {
    name: "Checkout branch",
    exact: true,
  });
  await expect(
    submenu.getByRole("menuitem", { name: "feature", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(submenu).not.toBeVisible();
  await expect(checkout).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(submenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(submenu).not.toBeVisible();
  await expect(checkout).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "Checkout")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "feature"]);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("graph flyouts flip left at the viewport edge", async ({ page }) => {
  const row = page.locator(".commit-row").first();
  const bounds = (await row.boundingBox())!;
  await row.click({
    button: "right",
    position: { x: bounds.width - 8, y: 16 },
  });
  await page
    .getByRole("menuitem", { name: "Checkout branch", exact: false })
    .hover();
  const flyout = page.getByRole("menu", {
    name: "Checkout branch",
    exact: true,
  });
  await expect(flyout).toBeVisible();
  const parent = (await page
    .locator(".ref-menu:not(.ref-submenu)")
    .boundingBox())!;
  const child = (await flyout.boundingBox())!;
  expect(child.x).toBeGreaterThanOrEqual(4);
  expect(child.x + child.width).toBeLessThanOrEqual(parent.x + 4);
  await flyout.getByRole("menuitem", { name: "feature", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("graph local and tag pills target their own refs", async ({ page }) => {
  await page
    .locator('.ref-label.local[title="feature"]')
    .click({ button: "right" });
  await expect(page.locator(".ref-menu-target")).toHaveText("feature");
  await page.getByRole("menuitem", { name: "Checkout", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "Checkout")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "feature"]);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() => {
    (window as any).testSnapshot.commits[0].refs += ", tag: v1";
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.locator('.ref-label.tag[title="v1"]').click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText([
    "Checkout",
    "Merge",
    "Rebase",
    "Create branch",
    "Delete tag…",
  ]);
  await page.getByRole("menuitem", { name: "Checkout", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Checkout", exact: true });
  await expect(dialog).toContainText("detached HEAD");
  await dialog.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((c: any) => c.name === "RefAction")
            .at(-1)?.args[1],
      ),
    )
    .toMatchObject({ action: "checkout", target: "v1", detach: true });
});

async function openFileHistory(page: Page) {
  await page
    .locator('[data-area="unstaged"] .file-button')
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "File history", exact: true })
    .click();
}

test("file history caches lazy tabs and ignores stale revision responses", async ({
  page,
}) => {
  await page.evaluate(() => {
    const target = window as unknown as {
      go: {
        main: { App: { FileDiff: (...args: unknown[]) => Promise<string> } };
      };
      testCalls: Array<{ name: string; args: unknown[] }>;
      finishHistoryDiff: () => void;
    };
    target.go.main.App.FileDiff = async (...args) => {
      target.testCalls.push({ name: "FileDiff", args });
      if (String(args[2]).startsWith("a"))
        await new Promise<void>((resolve) => {
          target.finishHistoryDiff = resolve;
        });
      return `@@ -1 +1 @@\n-old\n+${String(args[2]).slice(0, 8)}\n`;
    };
  });
  await openFileHistory(page);
  const dialog = page.getByRole("dialog");
  await dialog
    .locator(".history-entry")
    .last()
    .locator(".revision-button")
    .click();
  await expect(dialog.locator(".diff-line.added")).toContainText("bbbbbbbb");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { testCalls: Array<{ name: string }> }
          ).testCalls.filter((c) => c.name === "FileDiff").length,
      ),
    )
    .toBe(2);
  await page.evaluate(() =>
    (
      window as unknown as { finishHistoryDiff: () => void }
    ).finishHistoryDiff(),
  );
  await expect(dialog.locator(".history-entry.selected")).toContainText(
    "Before rename",
  );
  await expect(dialog.locator(".diff-line.added")).toContainText("bbbbbbbb");
  await dialog.getByRole("tab", { name: "Blame", exact: true }).click();
  await expect(dialog.locator(".blame-info")).toHaveCount(2);
  await dialog.getByRole("tab", { name: "Diff", exact: true }).click();
  await expect(dialog.locator(".diff-line.added")).toContainText("bbbbbbbb");
  await dialog
    .locator(".history-entry")
    .first()
    .locator(".revision-button")
    .click();
  await expect(dialog.locator(".diff-line.added")).toContainText("aaaaaaaa");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { testCalls: Array<{ name: string }> }
          ).testCalls.filter((c) => c.name === "FileDiff").length,
      ),
    )
    .toBe(2);
});

test("file history virtualizes large patches and jumps between change blocks", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.go!.main.App.FileDiff = async () =>
      "@@ -1,10000 +1,10000 @@\n" +
      Array.from({ length: 10000 }, (_, i) =>
        i === 500 || i === 9500 ? `-old ${i}\n+new ${i}` : ` line ${i}`,
      ).join("\n") +
      "\n";
  });
  await openFileHistory(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".diff-line").first()).toBeVisible();
  expect(await dialog.locator(".diff-line").count()).toBeLessThan(100);
  await dialog.getByRole("tab", { name: "Whole file with changes" }).click();
  await expect(dialog.locator(".cm-added-line")).toContainText("new 500");
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(100);
  await dialog
    .getByRole("button", { name: "Next change", exact: true })
    .click();
  await expect(dialog.locator(".cm-added-line")).toContainText("new 9500");
  await dialog.locator(".cm-content").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(dialog.locator(".cm-added-line")).toContainText("new 500");
  await dialog.locator(".cm-scroller").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(dialog.locator(".cm-content")).toContainText("line 9999");
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(100);
});

test("file history split screenshots", async ({ page }) => {
  await openFileHistory(page);
  await expect(
    page
      .getByRole("dialog", { name: "File history", exact: true })
      .locator(".diff-line.hunk"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "File history", exact: true }),
  ).not.toHaveClass(/p-dialog-enter-active/);
  await page.screenshot({ path: "../docs/screenshots/file-history-light.png" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await darkTheme(page);
  await openFileHistory(page);
  await expect(
    page
      .getByRole("dialog", { name: "File history", exact: true })
      .locator(".diff-line.hunk"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "File history", exact: true }),
  ).not.toHaveClass(/p-dialog-enter-active/);
  await page.screenshot({ path: "../docs/screenshots/file-history-dark.png" });
});

async function workingFiles(page: Page, index = " ") {
  await page.evaluate((index) => {
    const w = window as unknown as {
      testSnapshot: {
        files: {
          path: string;
          originalPath: string;
          index: string;
          worktree: string;
          untracked: boolean;
          conflict: boolean;
        }[];
      };
    };
    w.testSnapshot.files = [
      "file.txt",
      "second.txt",
      "third.txt",
      "fourth.txt",
    ].map((path) => ({
      path,
      originalPath: "",
      index,
      worktree: "M",
      untracked: false,
      conflict: false,
    }));
  }, index);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator('[data-area="unstaged"] .file-row')).toHaveCount(4);
}
async function bridgeCalls(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      (
        window as unknown as { testCalls: { name: string; args: unknown[] }[] }
      ).testCalls.filter((c) => c.name === name),
    name,
  );
}

test("working row actions reserve space and reveal on hover, focus and selection", async ({
  page,
}) => {
  const row = page.locator('[data-area="unstaged"] .file-row');
  const actions = row.locator(".row-actions");
  await page.mouse.move(1100, 900);
  await expect(actions).toHaveCSS("visibility", "hidden");
  const width = (await row.boundingBox())!.width;
  await row.hover();
  await expect(actions).toHaveCSS("visibility", "visible");
  expect((await row.boundingBox())!.width).toBe(width);
  await page.mouse.move(1100, 900);
  await row.locator(".file-button").focus();
  await expect(actions).toHaveCSS("visibility", "visible");
  await row.locator(".file-button").click();
  await page.getByRole("button", { name: "Refresh", exact: true }).focus();
  await page.mouse.move(1100, 900);
  await expect(actions).toHaveCSS("visibility", "visible");
  await expect(row).toHaveClass(/selected/);
});

test("working and staged Revert send different modes and preserve staged content", async ({
  page,
}) => {
  await workingFiles(page, "M");
  const unstaged = page.locator('[data-area="unstaged"] .file-row').first();
  await unstaged.hover();
  await unstaged
    .getByRole("button", { name: "Revert: file.txt", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Discard working-tree changes in file.txt?",
  );
  await expect(
    dialog.getByRole("button", { name: "Revert", exact: true }),
  ).toHaveClass(/p-button-danger/);
  await dialog.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-area="staged"] .file-row')).toHaveCount(4);
  const staged = page.locator('[data-area="staged"] .file-row').first();
  await staged.hover();
  await staged
    .getByRole("button", { name: "Revert: file.txt", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Discard all changes (staged and unstaged) in file.txt?",
  );
  await dialog.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await bridgeCalls(page, "Discard")).map((c) => c.args)).toEqual([
    ["/tmp/ui-repo", ["file.txt"], true],
    ["/tmp/ui-repo", ["file.txt"], false],
  ]);
});

test("Ctrl selection stages one batch and prunes moved rows", async ({
  page,
}) => {
  await workingFiles(page);
  const rows = page.locator('[data-area="unstaged"] .file-row');
  await rows.nth(0).locator(".file-button").click();
  await rows
    .nth(2)
    .locator(".file-button")
    .click({ modifiers: ["Control"] });
  await expect(
    rows
      .filter({ has: page.locator(".row-actions") })
      .locator(".row-actions")
      .first(),
  ).toBeVisible();
  await expect(page.locator('[data-area="unstaged"] .selected')).toHaveCount(2);
  await rows
    .first()
    .getByRole("button", { name: "Stage 2 files", exact: true })
    .click();
  await expect(page.locator('[data-area="staged"] .file-row')).toHaveCount(2);
  await expect(page.locator(".sidebar-changes .selected")).toHaveCount(0);
  expect((await bridgeCalls(page, "Stage")).map((c) => c.args)).toEqual([
    ["/tmp/ui-repo", ["file.txt", "third.txt"]],
  ]);
});

test("Shift ranges confirm every path and batch revert", async ({ page }) => {
  await workingFiles(page);
  const rows = page.locator('[data-area="unstaged"] .file-row');
  await rows.first().locator(".file-button").click();
  await rows
    .nth(2)
    .locator(".file-button")
    .click({ modifiers: ["Shift"] });
  await expect(page.locator('[data-area="unstaged"] .selected')).toHaveCount(3);
  await page.getByRole("button", { name: "Revert 3", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Revert 3 files");
  for (const path of ["file.txt", "second.txt", "third.txt"])
    await expect(dialog).toContainText(path);
  await dialog.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await bridgeCalls(page, "Discard"))[0]!.args).toEqual([
    "/tmp/ui-repo",
    ["file.txt", "second.txt", "third.txt"],
    true,
  ]);
});

test("list keyboard selection, arrows, Escape and ranges stay in one list", async ({
  page,
}) => {
  await workingFiles(page, "M");
  const list = page.locator('[data-area="unstaged"]');
  await list.focus();
  await page.keyboard.press("Control+a");
  await expect(list.locator(".selected")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(list.locator(".selected")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(list.locator(".file-button").first()).toBeFocused();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(list.locator(".selected")).toHaveCount(2);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(list.locator(".selected")).toHaveCount(3);
  await page.keyboard.press("Shift+ArrowUp");
  await expect(list.locator(".selected")).toHaveCount(2);
  const staged = page.locator('[data-area="staged"]');
  await staged
    .locator(".file-button")
    .nth(2)
    .click({ modifiers: ["Shift"] });
  await expect(staged.locator(".selected")).toHaveCount(1);
  await expect(list.locator(".selected")).toHaveCount(0);
  await staged
    .locator(".file-button")
    .nth(3)
    .click({ modifiers: ["Meta"] });
  await expect(staged.locator(".selected")).toHaveCount(2);
});

test("dragging a selection stages the entire batch", async ({ page }) => {
  await workingFiles(page);
  const list = page.locator('[data-area="unstaged"]');
  await list.locator(".file-button").first().click();
  await list
    .locator(".file-button")
    .nth(1)
    .click({ modifiers: ["Control"] });
  await list
    .locator(".file-row")
    .first()
    .dragTo(page.locator('[data-area="staged"]'));
  await expect(page.locator('[data-area="staged"] .file-row')).toHaveCount(2);
  expect((await bridgeCalls(page, "Stage"))[0]!.args).toEqual([
    "/tmp/ui-repo",
    ["file.txt", "second.txt"],
  ]);
});

test("selection context menu copies paths, opens first diff and unstages one batch", async ({
  page,
}) => {
  await workingFiles(page, "M");
  const staged = page.locator('[data-area="staged"]');
  await staged.locator(".file-button").first().click();
  await staged
    .locator(".file-button")
    .nth(1)
    .click({ modifiers: ["Control"] });
  await staged.locator(".file-row").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy paths", exact: true }).click();
  expect((await bridgeCalls(page, "CopyText"))[0]!.args).toEqual([
    "file.txt\nsecond.txt",
  ]);
  await staged.locator(".file-row").nth(1).click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: "View changes in external tool",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "View changes in external tool", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect((await bridgeCalls(page, "RunDiffTool"))[0]!.args[1]).toBe("file.txt");
  await staged.locator(".file-row").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unstage", exact: true }).click();
  await expect(staged.locator(".selected")).toHaveCount(0);
  expect((await bridgeCalls(page, "Unstage"))[0]!.args).toEqual([
    "/tmp/ui-repo",
    ["file.txt", "second.txt"],
  ]);
});

test("mixed revert offers optional deletion and untracked-only revert requires deletion", async ({
  page,
}) => {
  await workingFiles(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: { files: { untracked: boolean; worktree: string }[] };
    };
    w.testSnapshot.files[1]!.untracked = true;
    w.testSnapshot.files[1]!.worktree = "?";
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const list = page.locator('[data-area="unstaged"]');
  await list.locator(".file-button").first().click();
  await list
    .locator(".file-button")
    .nth(1)
    .click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Revert 2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Delete new files")).not.toBeChecked();
  await dialog.getByLabel("Delete new files").check();
  await expect(dialog).toContainText("This will delete the untracked file.");
  await dialog.getByLabel("Delete new files").uncheck();
  await dialog.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await bridgeCalls(page, "Discard"))[0]!.args[1]).toEqual([
    "file.txt",
  ]);
  const untracked = list.locator(".file-row").first();
  await untracked.hover();
  await untracked
    .getByRole("button", { name: "Revert: second.txt", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Revert", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await bridgeCalls(page, "Discard"))[1]!.args[1]).toEqual([
    "second.txt",
  ]);
});

test("working file hover and multi-selection screenshots", async ({ page }) => {
  await workingFiles(page);
  const list = page.locator('[data-area="unstaged"]');
  await list.locator(".file-row").nth(1).hover();
  await page.screenshot({
    path: "../docs/screenshots/changes-hover-light.png",
  });
  await list.locator(".file-button").first().click();
  await list
    .locator(".file-button")
    .nth(2)
    .click({ modifiers: ["Shift"] });
  await page.screenshot({
    path: "../docs/screenshots/changes-selection-light.png",
  });
  await darkTheme(page);
  await expect(page.locator(".toolbar-menu")).toHaveCount(0);
  await page.screenshot({
    path: "../docs/screenshots/changes-selection-dark.png",
  });
  await list.focus();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Refresh", exact: true }).focus();
  await list.locator(".file-row").nth(1).hover();
  await page.screenshot({ path: "../docs/screenshots/changes-hover-dark.png" });
});

async function seedRememberedProfiles(page: Page, identical = false) {
  await page.evaluate((identical) => {
    localStorage.setItem(
      "gitextensions.identity.profiles",
      JSON.stringify([
        {
          id: "home",
          label: "Home",
          name: "Home User",
          email: "home@test",
          color: "#123456",
        },
        {
          id: "work",
          label: "Work",
          name: identical ? "Home User" : "Work User",
          email: identical ? "home@test" : "work@test",
          color: "#654321",
        },
      ]),
    );
  }, identical);
  await page.reload();
}
async function openProfileRepository(page: Page, path: string) {
  await page.keyboard.press("Control+o");
  await page.getByLabel("Repository path", { exact: true }).fill(path);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".repo-switcher")).toHaveAttribute("title", path);
}
async function selectIdentityProfile(page: Page, label: string) {
  await page.locator(".identity-avatar").click();
  await page.getByRole("menuitem", { name: new RegExp(`${label} —`) }).click();
  await expect(page.locator(".committing-as")).toContainText(label);
}

test("remembers Home and Work per repository, skips equal identities and restores external changes", async ({
  page,
}) => {
  await seedRememberedProfiles(page);
  await selectIdentityProfile(page, "Home");
  await openProfileRepository(page, "/tmp/repo-b");
  await selectIdentityProfile(page, "Work");
  await page.evaluate(() => {
    (window as any).testCalls.length = 0;
  });
  await openProfileRepository(page, "/tmp/ui-repo");
  await expect(page.locator(".committing-as")).toContainText(
    "Home · home@test",
  );
  await expect(page.locator(".identity-avatar .avatar")).toHaveCSS(
    "background-color",
    "rgb(18, 52, 86)",
  );
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((c: any) => c.name === "SetIdentity"),
    ),
  ).toEqual([]);
  await page.locator(".identity-avatar").click();
  await expect(page.getByRole("menuitem", { name: /✓ Home —/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (window as any).testIdentities["/tmp/ui-repo"] = {
      name: "External",
      email: "external@test",
      scope: "local",
      localName: true,
      localEmail: true,
    };
  });
  await openProfileRepository(page, "/tmp/ui-repo");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Applied remembered profile Home" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).testCalls
        .filter((c: any) => c.name === "SetIdentity")
        .map((c: any) => c.args),
    ),
  ).toEqual([["/tmp/ui-repo", "Home User", "home@test"]]);
});

test("keeps the selected profile active when identities share an email and saves profile edits", async ({
  page,
}) => {
  await seedRememberedProfiles(page, true);
  await selectIdentityProfile(page, "Work");
  await openProfileRepository(page, "/tmp/ui-repo");
  await expect(page.locator(".identity-avatar .avatar")).toHaveCSS(
    "background-color",
    "rgb(101, 67, 33)",
  );
  await page.locator(".identity-avatar").click();
  await expect(page.getByRole("menuitem", { name: /✓ Work —/ })).toBeVisible();
  await page.getByRole("menuitem", { name: "Manage profiles…" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const work = dialog
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: "Work" }) });
  await expect(work.locator("summary")).toHaveText("Used by 1 repositories");
  await expect(work.locator("summary")).toHaveAttribute(
    "title",
    "/tmp/ui-repo",
  );
  await work.getByLabel("Name", { exact: true }).fill("Edited Worker");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".identity-avatar")).toHaveAttribute(
    "aria-label",
    "Edited Worker",
  );
  await page.keyboard.press("Control+,");
  await dialog.getByRole("tab", { name: "Profiles", exact: true }).click();
  await work.locator("summary").click();
  await work
    .getByRole("button", { name: "Forget: /tmp/ui-repo", exact: true })
    .click();
  await expect(work.locator("summary")).toHaveText("Used by 0 repositories");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gitextensions.identity.repoProfiles")!),
    ),
  ).toEqual({});
});

async function openCreateTag(page: Page) {
  await page.locator(".commit-row").first().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Create new tag here…", exact: true })
    .click();
  return page.getByRole("dialog");
}

test("create annotated tag refreshes pill and remembers choices", async ({
  page,
}) => {
  const dialog = await openCreateTag(page);
  await expect(dialog.getByLabel("Tag name", { exact: true })).toBeFocused();
  await expect(dialog).toContainText("aaaaaaaaaaaa Initial commit");
  await dialog.getByLabel("Tag name", { exact: true }).fill("v2");
  await dialog.getByRole("radio", { name: "Annotated", exact: true }).check();
  const submit = dialog.getByRole("button", {
    name: "Create new tag here…",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Message", { exact: true }).fill("Release v2");
  await dialog.getByLabel("Push tag to", { exact: true }).check();
  await submit.click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator(".ref-label").filter({ hasText: "v2" }),
  ).toBeVisible();
  const payload = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls.find((c) => c.name === "RefAction")?.args[1],
  );
  expect(payload).toMatchObject({
    action: "create-tag",
    target: "a".repeat(40),
    name: "v2",
    tagType: "annotated",
    message: "Release v2",
    push: true,
    remoteName: "origin",
    force: false,
  });
  const reopened = await openCreateTag(page);
  await expect(
    reopened.getByRole("radio", { name: "Annotated", exact: true }),
  ).toBeChecked();
  await expect(
    reopened.getByLabel("Push tag to", { exact: true }),
  ).toBeChecked();
});

test("annotated tag requires a nonblank message", async ({ page }) => {
  const dialog = await openCreateTag(page);
  await dialog.getByLabel("Tag name", { exact: true }).fill("v2");
  await dialog.getByRole("radio", { name: "Annotated", exact: true }).check();
  const submit = dialog.getByRole("button", {
    name: "Create new tag here…",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Message", { exact: true }).fill("   ");
  await expect(submit).toBeDisabled();
});

test("delete tag can also remove it from a selected remote", async ({
  page,
}) => {
  const create = await openCreateTag(page);
  await create.getByLabel("Tag name", { exact: true }).fill("v2");
  await create
    .getByRole("button", { name: "Create new tag here…", exact: true })
    .click();
  await page
    .locator(".ref-label")
    .filter({ hasText: "v2" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete tag…", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("v2");
  await dialog.getByLabel("Also delete from", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Delete tag…", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator(".ref-label").filter({ hasText: "v2" }),
  ).toHaveCount(0);
  const payload = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls
        .filter((c) => c.name === "RefAction")
        .at(-1)?.args[1],
  );
  expect(payload).toMatchObject({
    action: "delete-tag",
    target: "v2",
    push: true,
    remoteName: "origin",
  });
});

test("tag push is disabled without remotes", async ({ page }) => {
  await page.evaluate(() => {
    (
      window as unknown as { testSnapshot: { remotes: string[] } }
    ).testSnapshot.remotes = [];
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const dialog = await openCreateTag(page);
  await expect(
    dialog.getByLabel("Push tag to", { exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Remote", { exact: true })).toBeDisabled();
});

test("palette creates tag on selected commit and defaults to its upstream remote", async ({
  page,
}) => {
  await page.evaluate(() => {
    const snapshot = (
      window as unknown as {
        testSnapshot: {
          remotes: string[];
          branches: Array<{ current: boolean; upstream: string }>;
        };
      }
    ).testSnapshot;
    snapshot.remotes = ["origin", "team"];
    snapshot.branches.find((b) => b.current)!.upstream = "team/main";
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.locator(".commit-row .subject").first().click();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search commands…" })
    .fill("Create tag on selected commit");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Tag name", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Remote", { exact: true })).toHaveValue(
    "team",
  );
});

test("code review commit shows target and tools, composes prompt and remembers details", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Code review commit…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Code review", exact: true });
  await expect(dialog).toContainText("aaaaaaaa Initial commit");
  await expect(
    dialog.getByRole("textbox", { name: "Review instructions" }),
  ).toHaveValue(/You are a senior reviewer/);
  await expect(dialog.getByRole("combobox", { name: "Tool" })).toHaveValue(
    "codex",
  );
  await expect(dialog.getByRole("option", { name: "Qwen" })).toBeEnabled();
  await expect(dialog.getByRole("option", { name: "OpenCode" })).toBeEnabled();
  await expect(
    dialog.getByRole("option", { name: "Claude", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("textbox", { name: "Task details" })
    .fill("Ticket 123: focus on races");
  await dialog
    .getByRole("button", { name: "Start review", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const calls = await page.evaluate(() =>
    (
      window as unknown as {
        testCalls: Array<{ name: string; args: unknown[] }>;
      }
    ).testCalls.filter((c) => c.name === "StartReview"),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]!.args[0]).toBe("/tmp/ui-repo");
  expect(calls[0]!.args[1]).toMatchObject({
    tool: "codex",
    commit: "a".repeat(40),
    details: "Ticket 123: focus on races",
  });
  const options = calls[0]!.args[1] as { prompt: string };
  expect(options.prompt).toContain("You are a senior reviewer");
  expect(options.prompt).toContain("git show --stat --patch " + "a".repeat(40));
  expect(options.prompt).toContain("Ticket 123: focus on races");
  await expect(page.locator("footer")).toContainText("Review started in Codex");
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Code review commit…", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Task details" }),
  ).toHaveValue("Ticket 123: focus on races");
});

test("all code review tools launch without PATH detection and preserve the selected tool", async ({
  page,
}) => {
  for (const tool of ["codex", "claude", "qwen", "opencode"]) {
    await page
      .getByRole("button", {
        name: "Code review uncommitted changes…",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Code review",
      exact: true,
    });
    const select = dialog.getByRole("combobox", { name: "Tool", exact: true });
    await select.selectOption(tool);
    await expect(
      dialog.getByRole("button", { name: "Start review", exact: true }),
    ).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Start review", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page
      .getByRole("button", {
        name: "Code review uncommitted changes…",
        exact: true,
      })
      .click();
    await expect(select).toHaveValue(tool);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  const calls = await page.evaluate(
    () => (window as unknown as { testCalls: { name: string }[] }).testCalls,
  );
  expect(calls.some((c) => c.name.startsWith("DetectReviewTools"))).toBe(false);
});

test("uncommitted review uses git diff HEAD and Ctrl+Enter launches only the review", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Code review uncommitted changes…",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Code review", exact: true });
  await expect(dialog).toContainText("Uncommitted changes");
  await dialog
    .getByRole("textbox", { name: "Task details" })
    .fill("Working changes");
  await page.keyboard.press("Control+Enter");
  await expect(dialog).not.toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          testCalls: Array<{ name: string; args: unknown[] }>;
        }
      ).testCalls,
  );
  const opts = calls.find((c) => c.name === "StartReview")!.args[1] as {
    prompt: string;
    commit: string;
  };
  expect(opts.commit).toBe("");
  expect(opts.prompt).toContain("git diff HEAD; git status");
  expect(calls.some((c) => c.name === "Commit")).toBe(false);
});

test("code review settings save and cancel, and the command palette uses the selected commit", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("tab", { name: "Code review", exact: true }).click();
  await settings
    .getByRole("textbox", { name: "Review instructions", exact: true })
    .fill("Review for data loss only");
  await expect(settings).not.toContainText("Not found in PATH");
  await expect(settings).toContainText("{prompt}");
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search commands…" })
    .fill("Code review selected");
  await page
    .getByRole("option", { name: "Code review selected commit…" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Code review", exact: true });
  await expect(
    dialog.getByRole("textbox", { name: "Review instructions" }),
  ).toHaveValue("Review for data loss only");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Control+,");
  await settings.getByRole("tab", { name: "Code review", exact: true }).click();
  await settings
    .getByRole("textbox", { name: "Review instructions", exact: true })
    .fill("Cancelled edits");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Code review uncommitted changes…",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Review instructions" }),
  ).toHaveValue("Review for data loss only");
});

async function seedRecentRepositories(
  page: Page,
  count: number,
  favorite = false,
  welcome = false,
) {
  await page.evaluate(
    ({ count, favorite, welcome }) => {
      const paths = [
        "/tmp/ui-repo",
        ...Array.from(
          { length: count - 1 },
          (_, i) => "/home/test/project-" + (i + 1),
        ),
      ];
      const entries = paths.map((path, index) => ({
        path,
        favorite: false,
        lastOpened: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
      }));
      if (favorite)
        entries.push({
          path: "/home/test/favorite",
          favorite: true,
          lastOpened: "2025-01-01T00:00:00Z",
        });
      localStorage.setItem(
        "gitextensions.recentRepos",
        JSON.stringify(entries),
      );
      if (welcome) localStorage.setItem("test.welcome", "true");
    },
    { count, favorite, welcome },
  );
  await page.reload();
  if (!welcome)
    await expect(page.locator(".repo-text b")).toHaveText("ui-repo");
}
async function openRepositoryMenu(page: Page) {
  await page
    .getByRole("button", { name: "Recent repositories", exact: true })
    .click();
  return page.locator(".toolbar-menu .repository-list");
}

test("starring a repository creates Favorites above Recent and persists after reload", async ({
  page,
}) => {
  await seedRecentRepositories(page, 7);
  let list = await openRepositoryMenu(page);
  const row = list.locator('[data-path="/home/test/project-6"]');
  await row.hover();
  await row
    .getByRole("button", {
      name: "Add to favorites: /home/test/project-6",
      exact: true,
    })
    .click();
  await expect(list.locator("section").first()).toHaveAttribute(
    "aria-label",
    "Favorites",
  );
  await expect(list.locator(".repository-row").first()).toHaveAttribute(
    "data-path",
    "/home/test/project-6",
  );
  await expect(list.locator(".favorite-toggle").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".repo-text b")).toHaveText("ui-repo");
  const order = await list
    .locator(".repository-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-path")));
  await page.reload();
  list = await openRepositoryMenu(page);
  expect(
    await list
      .locator(".repository-row")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-path"))),
  ).toEqual(order);
});

test("opening a repository moves it to the top of Recent below Favorites", async ({
  page,
}) => {
  await seedRecentRepositories(page, 7, true);
  let list = await openRepositoryMenu(page);
  await list
    .locator('[data-path="/home/test/project-5"] .repository-open')
    .click();
  await expect(page.locator(".repo-text b")).toHaveText("project-5");
  list = await openRepositoryMenu(page);
  await expect(list.locator(".repository-row").first()).toHaveAttribute(
    "data-path",
    "/home/test/favorite",
  );
  await expect(
    list.locator('section[aria-label="Recent"] .repository-row').first(),
  ).toHaveAttribute("data-path", "/home/test/project-5");
});

test("saving a limit of five keeps five recent entries plus the favorite", async ({
  page,
}) => {
  await seedRecentRepositories(page, 7, true);
  await page.keyboard.press("Control+,");
  await page
    .getByLabel("Recent repositories to keep", { exact: true })
    .fill("5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const list = await openRepositoryMenu(page);
  await expect(
    list.locator('section[aria-label="Favorites"] .repository-row'),
  ).toHaveCount(1);
  await expect(
    list.locator('section[aria-label="Recent"] .repository-row'),
  ).toHaveCount(5);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gitextensions.recent.limit"),
    ),
  ).toBe("5");
  await page.reload();
  await openRepositoryMenu(page);
  await expect(page.locator(".toolbar-menu .repository-row")).toHaveCount(6);
});

test("the repository filter searches name and path and Enter opens the first match", async ({
  page,
}) => {
  await seedRecentRepositories(page, 12, true);
  const list = await openRepositoryMenu(page);
  const filter = list.getByRole("textbox", { name: "Filter repositories" });
  await expect(list.locator(".repository-row")).toHaveCount(13);
  await filter.fill("/home/test/");
  await expect(list.locator(".repository-row")).toHaveCount(12);
  await filter.fill("PROJECT-11");
  await expect(list.locator(".repository-row")).toHaveCount(1);
  await filter.press("Enter");
  await expect(page.locator(".repo-text b")).toHaveText("project-11");
});

test("welcome list supports favorites, filtering and removable missing repositories", async ({
  page,
}) => {
  await seedRecentRepositories(page, 12, true, true);
  const list = page.locator(".welcome .repository-list");
  await expect(list.locator(".repository-row")).toHaveCount(13);
  await list.locator('[data-path="/home/test/project-11"]').hover();
  await list
    .getByRole("button", {
      name: "Add to favorites: /home/test/project-11",
      exact: true,
    })
    .click();
  await expect(list.locator(".repository-row").first()).toHaveAttribute(
    "data-path",
    "/home/test/project-11",
  );
  await list
    .getByRole("textbox", { name: "Filter repositories" })
    .fill("project-11");
  await list
    .getByRole("textbox", { name: "Filter repositories" })
    .press("Enter");
  await expect(page.locator(".repo-text b")).toHaveText("project-11");
  await page.evaluate(() => {
    const entries = JSON.parse(
      localStorage.getItem("gitextensions.recentRepos")!,
    );
    entries.push({
      path: "/tmp/missing-repo",
      favorite: false,
      lastOpened: new Date().toISOString(),
    });
    localStorage.setItem("gitextensions.recentRepos", JSON.stringify(entries));
  });
  await page.reload();
  const missing = page.locator('.welcome [data-path="/tmp/missing-repo"]');
  await expect(missing).toHaveClass(/missing/);
  await expect(missing).toContainText("Not found");
  await missing.locator(".repository-open").click();
  await expect(page.getByRole("alert")).toContainText("Repository not found");
  await expect(missing).toBeVisible();
  await missing.hover();
  await missing
    .getByRole("button", {
      name: "Remove from list: /tmp/missing-repo",
      exact: true,
    })
    .click();
  await expect(missing).toHaveCount(0);
});

test("command palette switches favorites first and toggles the current favorite", async ({
  page,
}) => {
  await seedRecentRepositories(page, 7, true);
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search commands…" })
    .fill("Switch repository");
  const options = page.locator(".command-palette").getByRole("option");
  await expect(options.nth(1)).toContainText("★ /home/test/favorite");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search commands…" })
    .fill("Toggle favorite for current repository");
  await page.keyboard.press("Enter");
  const list = await openRepositoryMenu(page);
  await expect(list.locator(".repository-row").first()).toHaveAttribute(
    "data-path",
    "/tmp/ui-repo",
  );
  await expect(list.locator(".favorite-toggle").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("file history opens its diff and keyboard selection reloads it", async ({
  page,
}) => {
  await openFileHistory(page);
  const dialog = page.getByRole("dialog", {
    name: "File history",
    exact: true,
  });
  await expect(
    dialog.getByRole("tab", { name: "Diff", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".diff-line.added")).toContainText("aaaaaaaa");
  await dialog.getByRole("listbox").focus();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator(".history-entry.selected")).toContainText(
    "Before rename",
  );
  await expect(dialog.locator(".diff-line.added")).toContainText("bbbbbbbb");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls
            .filter((c) => c.name === "FileDiff")
            .at(-1)?.args,
      ),
    )
    .toEqual(["/tmp/ui-repo", "old.txt", "b".repeat(40), false]);
});

test("blame blocks show metadata once and select file revisions", async ({
  page,
}) => {
  await openFileHistory(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Blame", exact: true }).click();
  const gutters = dialog.locator(".blame-gutter");
  await expect(gutters).toHaveCount(3);
  await expect(gutters.nth(0)).toContainText(/26.*\d{2}:\d{2}.* - Test Author/);
  await expect(gutters.nth(1)).toHaveText("");
  const colors = await gutters.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).borderLeftColor),
  );
  expect(colors[0]).not.toBe(colors[2]);
  await expect(gutters.nth(0)).toHaveAttribute(
    "title",
    /Initial commit.*Test Author <mvp@example.test>.*aaaa/,
  );
  await expect(gutters.nth(0).locator(".blame-path")).toHaveText("old.txt");
  await gutters.nth(2).click();
  await expect(dialog.locator(".history-entry.selected")).toContainText(
    "Before rename",
  );
});

test("graph avatars and identity highlighting follow settings", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: { commits: Array<Record<string, unknown>> };
    };
    w.testSnapshot.commits.push({
      ...w.testSnapshot.commits[0],
      hash: "b".repeat(40),
      author: "Ada Lovelace",
      authorEmail: "ada@example.test",
      subject: "Another author",
      refs: "",
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const rows = page.locator(".commit-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.locator(".avatar-cell .author-avatar")).toHaveCount(2);
  await expect(rows.first()).toHaveClass(/authored/);
  await expect(rows.last()).not.toHaveClass(/authored/);
  const colors = await rows
    .locator(".author")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
  expect(colors[0]).not.toBe(colors[1]);
  await page.keyboard.press("Control+,");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog
    .getByLabel("Show author avatar column", { exact: true })
    .uncheck();
  await dialog.getByLabel("Highlight my commits", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rows.locator(".avatar-cell")).toHaveCount(0);
  await expect(page.locator(".commit-row.authored")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".avatar-cell")).toHaveCount(0);
});

test("blame settings change ordering and backend flags", async ({ page }) => {
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("tab", { name: "Blame", exact: true }).click();
  await settings.getByLabel("Author first", { exact: true }).check();
  await settings.getByLabel("Ignore whitespace", { exact: true }).uncheck();
  await settings
    .getByLabel("Detect copies in all files", { exact: true })
    .check();
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await openFileHistory(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Blame", exact: true }).click();
  await expect(dialog.locator(".blame-info").first()).toHaveText(
    /^Test Author - .*26.*\d{2}:\d{2}/,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              testCalls: Array<{ name: string; args: unknown[] }>;
            }
          ).testCalls
            .filter((c) => c.name === "Blame")
            .at(-1)?.args[3],
      ),
    )
    .toEqual({
      ignoreWhitespace: false,
      detectCopiesInFile: false,
      detectCopiesInAllFiles: true,
    });
});

test("blame virtualizes large files across block boundaries", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.go!.main.App.Blame = async () =>
      Array.from({ length: 10001 }, (_, i) => ({
        hash: (i < 5000 ? "a" : "b").repeat(40),
        author: i < 5000 ? "Test Author" : "Ada Lovelace",
        email: i < 5000 ? "mvp@example.test" : "ada@example.test",
        date: "2026-10-01T16:55:00+03:00",
        summary: "Large file",
        originalPath: "file.txt",
        line: i + 1,
        originalLine: i + 1,
        text: `Line ${i + 1}`,
      }));
  });
  await openFileHistory(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Blame", exact: true }).click();
  const scroll = dialog.locator(".cm-scroller");
  await expect(dialog.locator(".blame-info")).toHaveCount(1);
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(100);
  await scroll.evaluate((el) => {
    el.scrollTop =
      4998 *
      parseFloat(getComputedStyle(el.querySelector(".cm-line")!).lineHeight);
  });
  await expect(dialog.locator(".blame-info")).toHaveText(/Ada Lovelace/);
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(scroll).toContainText("Line 10001");
  await expect(dialog.locator(".blame-info")).toHaveCount(0);
});

test("blame screenshots", async ({ page }) => {
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark") await darkTheme(page);
    await openFileHistory(page);
    const dialog = page.getByRole("dialog", {
      name: "File history",
      exact: true,
    });
    await dialog.getByRole("tab", { name: "Blame", exact: true }).click();
    await expect(dialog.locator(".blame-info")).toHaveCount(2);
    await expect(dialog).not.toHaveClass(/p-dialog-enter-active/);
    await page.screenshot({ path: `../docs/screenshots/blame-${mode}.png` });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

const viewerSample = `class Changed {
  value = 42;
  message = "hello";
}
class Unchanged {
  value = 1;
  nested() {
    return true;
  }
}
`;
async function codeFile(page: Page, file: string, text: string) {
  await page.evaluate(
    ({ file, text }) => {
      const w = window as unknown as {
        testSnapshot: { files: Array<{ path: string }> };
      };
      w.testSnapshot.files[0]!.path = file;
      window.go!.main.App.FileContent = async () => ({ text, binary: false });
    },
    { file, text },
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
}
async function openWholeCode(page: Page) {
  await page
    .locator('[data-area="unstaged"] .file-button')
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "View whole file", exact: true })
    .click();
  return page.getByRole("dialog", { name: "View whole file", exact: true });
}
test("CodeMirror TypeScript highlights, folds, searches and goes to a line", async ({
  page,
}) => {
  await codeFile(page, "sample.ts", viewerSample);
  const dialog = await openWholeCode(page);
  await expect(
    dialog.locator(".cm-content .syntax-keyword").first(),
  ).toHaveText("class");
  await expect(
    dialog
      .locator(".cm-foldGutter .cm-gutterElement")
      .filter({ hasText: "⌄" })
      .first(),
  ).toBeVisible();
  await dialog
    .locator(".cm-foldGutter .cm-gutterElement")
    .filter({ hasText: "⌄" })
    .first()
    .click();
  await expect(dialog.locator(".cm-foldPlaceholder")).toHaveText("{ … }");
  await expect(dialog.locator(".cm-foldPlaceholder")).toHaveAttribute(
    "title",
    /3/,
  );
  await expect(dialog.locator(".cm-content")).not.toContainText("hello");
  await dialog.locator(".cm-content").focus();
  await page.keyboard.press("Control+f");
  await expect(dialog.locator('.cm-search input[name="search"]')).toBeVisible();
  await dialog.locator('.cm-search input[name="search"]').fill("Unchanged");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".cm-searchMatch")).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.locator(".cm-content").focus();
  await page.keyboard.press("Control+g");
  await expect(dialog.locator(".cm-panel")).toContainText("Go to line");
});
test("CodeMirror whole changes protect changed folds and keep removed widgets outside copy", async ({
  page,
}) => {
  await codeFile(page, "sample.ts", viewerSample);
  await page.evaluate((text) => {
    window.go!.main.App.FileHistory = async () => [
      {
        commit: {
          hash: "a".repeat(40),
          parents: [],
          subject: "Code sample",
          author: "Test Author",
          authorEmail: "mvp@example.test",
          date: "2026-10-01T12:00:00Z",
          refs: "",
        },
        file: "sample.ts",
        originalPath: "",
      },
    ];
    window.go!.main.App.FileDiff = async () =>
      "@@ -1,10 +1,10 @@\n" +
      text
        .trimEnd()
        .split("\n")
        .map((line, i) => (i === 1 ? "-  value = 0;\n+" + line : " " + line))
        .join("\n") +
      "\n";
  }, viewerSample);
  await openFileHistory(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Whole file with changes" }).click();
  await expect(
    dialog.locator(".cm-content .syntax-keyword").first(),
  ).toBeVisible();
  await expect(dialog.locator(".cm-added-line")).toContainText("42");
  await expect(dialog.locator(".cm-removed-block")).toContainText("value = 0");
  await expect(dialog.locator(".cm-removed-block .removed-number")).toHaveText(
    "2",
  );
  await dialog.getByLabel("Fold unchanged regions", { exact: true }).check();
  await expect(dialog.locator(".cm-foldPlaceholder")).toHaveCount(1);
  await expect(dialog.locator(".cm-content")).toContainText("hello");
  await expect(dialog.locator(".cm-content")).not.toContainText("nested");
  await dialog.getByLabel("Fold unchanged regions", { exact: true }).uncheck();
  await expect(dialog.locator(".cm-foldPlaceholder")).toHaveCount(0);
  await dialog.locator(".cm-content").focus();
  await page.keyboard.press("Control+a");
  const copied = await dialog.locator(".cm-content").evaluate((el) => {
    const clipboard = new DataTransfer();
    el.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
    return clipboard.getData("text/plain");
  });
  expect(copied).toContain("value = 42");
  expect(copied).not.toContain("value = 0");
});
test("CodeMirror virtualizes 20k lines and updates theme colors live", async ({
  page,
}) => {
  await codeFile(
    page,
    "large.ts",
    Array.from({ length: 20000 }, (_, i) => `const value${i + 1} = ${i};`).join(
      "\n",
    ),
  );
  const dialog = await openWholeCode(page);
  await expect(dialog.locator(".syntax-keyword").first()).toBeVisible();
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(100);
  await dialog.locator(".cm-scroller").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(dialog.locator(".cm-content")).toContainText("value20000");
  expect(await dialog.locator(".cm-line").count()).toBeLessThan(100);
  const color = await dialog
    .locator(".syntax-keyword")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  // Open settings through the application keyboard shortcut while retaining the viewer.
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
  await settings.getByLabel("Theme mode").selectOption("dark");
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      dialog
        .locator(".syntax-keyword")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    )
    .not.toBe(color);
  await expect(dialog.locator(".cm-content")).toContainText("value20000");
});
test("CodeMirror large UTF-8 file keeps viewer and explains disabled syntax", async ({
  page,
}) => {
  await codeFile(page, "large.ts", "// " + "я".repeat(1024 * 1024));
  const dialog = await openWholeCode(page);
  await expect(dialog.getByRole("status")).toHaveText(
    "Syntax highlighting disabled for large file",
  );
  await expect(dialog.locator(".cm-content")).toBeVisible();
  await expect(dialog.locator(".syntax-comment")).toHaveCount(0);
});
test("CodeMirror diff Go tokens retain added backgrounds", async ({ page }) => {
  await codeFile(page, "sample.go", "package main\n");
  await page.evaluate(() => {
    window.go!.main.App.Diff = async () =>
      "@@ -1,2 +1,2 @@\n package main\n-var value = 1\n+var value = 42\n";
  });
  await page.locator('[data-area="unstaged"] .file-button').click();
  await expect(page.locator(".diff-line.added .syntax-keyword")).toHaveText(
    "var",
  );
  await expect(page.locator(".diff-line.added .syntax-number")).toHaveText(
    "42",
  );
  expect(
    await page
      .locator(".diff-line.added")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
});
test("CodeMirror whole file screenshots", async ({ page }) => {
  await codeFile(page, "sample.ts", viewerSample);
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark") await darkTheme(page);
    const dialog = await openWholeCode(page);
    await expect(dialog.locator(".syntax-keyword").first()).toBeVisible();
    await expect(dialog).not.toHaveClass(/p-dialog-enter-active/);
    await page.screenshot({
      path: `../docs/screenshots/whole-file-${mode}.png`,
    });
    if (mode === "dark") {
      await dialog
        .locator(".cm-foldGutter .cm-gutterElement")
        .filter({ hasText: "⌄" })
        .first()
        .click();
      await expect(dialog.locator(".cm-foldPlaceholder")).toBeVisible();
      await page.screenshot({
        path: "../docs/screenshots/whole-file-folding-dark.png",
      });
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("branch creation offers checkout by default and can keep the current branch", async ({
  page,
}) => {
  const commit = page.getByRole("button", {
    name: "Initial commit",
    exact: false,
  });
  await commit.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Create new branch here", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const checkout = dialog.getByRole("checkbox", {
    name: "Switch to new branch",
  });
  await expect(checkout).toBeVisible();
  await expect(checkout).toBeChecked();
  await dialog.getByLabel("Branch name", { exact: true }).fill("from-commit");
  await checkout.uncheck();
  await dialog
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".branch-switcher")).toContainText("main");

  await commit.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Create new branch here", exact: true })
    .click();
  await expect(checkout).toBeChecked();
  await dialog.getByLabel("Branch name", { exact: true }).fill("checked-out");
  await dialog
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".branch-switcher")).toContainText("checked-out");
  const calls = await page.evaluate(
    () =>
      (window as unknown as { testCalls: { name: string; args: unknown[] }[] })
        .testCalls,
  );
  const creates = calls
    .filter((c) => c.name === "RefAction")
    .map((c) => c.args[1]);
  expect(creates).toEqual([
    expect.objectContaining({
      action: "create",
      name: "from-commit",
      checkout: false,
      target: "a".repeat(40),
    }),
    expect.objectContaining({
      action: "create",
      name: "checked-out",
      checkout: true,
      target: "a".repeat(40),
    }),
  ]);
});

test("sidebar branch checkout can be disabled and resets on reopening", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const checkout = dialog.getByRole("checkbox", {
    name: "Switch to new branch",
  });
  await checkout.uncheck();
  await dialog.getByLabel("Branch name", { exact: true }).fill("stay-on-main");
  await dialog
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".branch-switcher")).toContainText("main");
  const calls = await page.evaluate(
    () =>
      (window as unknown as { testCalls: { name: string; args: unknown[] }[] })
        .testCalls,
  );
  expect(calls.find((c) => c.name === "CreateBranch")?.args).toEqual([
    "/tmp/ui-repo",
    "stay-on-main",
    "",
    false,
  ]);
  await page
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(checkout).toBeChecked();
});

test("errors stay above modal windows and can be dismissed without closing them", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as unknown as {
      go: { main: { App: { CreateBranch: () => Promise<string> } } };
    };
    w.go.main.App.CreateBranch = async () => {
      throw new Error("Branch already exists");
    };
  });
  await page
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Branch name", { exact: true }).fill("main");
  await dialog
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  const alert = page.locator("#error-notifications").getByRole("alert");
  await expect(alert).toContainText("Branch already exists");
  // elementFromPoint checks stacking and pointer access above the modal mask.
  const close = alert.getByRole("button", { name: "Dismiss error" });
  await expect(close).toBeInViewport();
  expect(
    await close.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
  ).toBe(true);
  await close.click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Branch name", { exact: true })).toHaveValue(
    "main",
  );
  await dialog
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await expect(alert).toContainText("Branch already exists");
});
