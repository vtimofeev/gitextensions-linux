import { test, expect, type Page } from "@playwright/test";
import { installBridge } from "./bridge";

async function dragSeparator(page: Page, name: string, dx: number, dy: number) {
  const handle = page.getByRole("separator", { name, exact: true });
  const rect = await handle.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect!.x + rect!.width / 2 + dx,
    rect!.y + rect!.height / 2 + dy,
    { steps: 8 },
  );
  await page.mouse.up();
}

test("sidebar groups collapse, release space, resize and remember layout", async ({
  page,
}) => {
  await installBridge(page);
  await page.goto("/");
  const staged = page.locator('.sidebar-files[data-area="staged"]');
  const unstaged = page.locator('.sidebar-files[data-area="unstaged"]');
  await expect(unstaged).toBeVisible();
  const before = (await staged.boundingBox())!.height;
  await dragSeparator(page, "Resize staged and unstaged files", 0, 35);
  await expect
    .poll(async () => (await staged.boundingBox())!.height)
    .toBeGreaterThan(before + 20);
  const resized = (await staged.boundingBox())!.height;
  await page
    .getByRole("button", { name: "Collapse Staged", exact: true })
    .click();
  await expect(staged).toBeHidden();
  await expect(unstaged).toBeVisible();
  await page
    .getByRole("button", { name: "Expand Staged", exact: true })
    .click();
  await expect
    .poll(async () => (await staged.boundingBox())!.height)
    .toBeCloseTo(resized, 0);
  const branchHeight = (await page.locator(".branches").boundingBox())!.height;
  await page
    .getByRole("button", { name: "Collapse Local branches", exact: true })
    .click();
  await expect(page.locator(".branch-list")).toBeHidden();
  expect((await page.locator(".branches").boundingBox())!.height).toBeLessThan(
    branchHeight / 2,
  );
  await page
    .getByRole("button", { name: "Collapse Staged", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand Local branches", exact: true }),
  ).toBeVisible();
  await expect(staged).toBeHidden();
  await page
    .getByRole("button", { name: "Expand Local branches", exact: true })
    .click();
  await expect(page.locator(".branch-list")).toBeVisible();
  await page
    .getByRole("button", { name: "Expand Staged", exact: true })
    .click();
  await expect(staged).toBeVisible();
});

test("changed files form a navigable directory tree with a persistent resize separator", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    (window as any).go.main.App.CommitFiles = async () => [
      "frontend/src/App.vue",
      "frontend/tests/app.test.ts",
      "docs/user-guide.md",
      "README.md",
    ];
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click();
  const tree = page.getByRole("tree", { name: "Changed files" });
  const app = tree.locator('button[title="frontend/src/App.vue"]');
  await expect(app).toHaveText("App.vue");
  await tree.locator('button[title="frontend"]').click();
  await expect(app).toBeHidden();
  await tree.locator('button[title="frontend"]').press("ArrowRight");
  await expect(app).toBeVisible();
  await app.click();
  const before = (await tree.boundingBox())!.width;
  await dragSeparator(page, "Resize changed files and preview", 90, 0);
  await expect
    .poll(async () => (await tree.boundingBox())!.width)
    .toBeGreaterThan(before + 65);
  const width = (await tree.boundingBox())!.width;
  const heading = page.locator(".diff-content > .panel-heading");
  const diff = (await heading
    .getByRole("button", { name: "Diff", exact: true })
    .boundingBox())!;
  const whole = (await heading
    .getByRole("button", { name: "View whole file", exact: true })
    .boundingBox())!;
  const filename = (await heading.locator(".filename").boundingBox())!;
  expect(whole.x - (diff.x + diff.width)).toBeLessThan(8);
  expect(filename.x).toBeGreaterThan(whole.x + whole.width);
  await page.reload();
  await page
    .getByRole("button", { name: "Initial commit", exact: false })
    .click();
  await expect
    .poll(async () => (await tree.boundingBox())!.width)
    .toBeCloseTo(width, 0);
});

test("blame can hide time or the full date without reloading Git data", async ({
  page,
}) => {
  await installBridge(page);
  await page.goto("/");
  await page
    .locator(".sidebar-files .file-button")
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Blame", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Blame", exact: true });
  await expect(dialog.locator(".blame-date").first()).toContainText(":");
  await dialog.getByLabel("Show time", { exact: true }).uncheck();
  await expect(dialog.locator(".blame-date").first()).not.toContainText(":");
  await dialog.getByLabel("Show date", { exact: true }).uncheck();
  await expect(dialog.locator(".blame-date")).toHaveCount(0);
  await expect(dialog.locator(".blame-author").first()).toHaveText(
    "Test Author",
  );
  expect(
    await page.evaluate(
      () =>
        (window as any).testCalls.filter((call: any) => call.name === "Blame")
          .length,
    ),
  ).toBe(1);
  await page.reload();
  await page
    .locator(".sidebar-files .file-button")
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Blame", exact: true }).click();
  await expect(
    dialog.getByLabel("Show date", { exact: true }),
  ).not.toBeChecked();
  await expect(dialog.locator(".blame-author").first()).toBeVisible();
  await expect(dialog.locator(".blame-date")).toHaveCount(0);
});

test("startup restores the last successful repository", async ({ page }) => {
  await installBridge(page);
  await page.addInitScript(() => {
    (window as any).go.main.App.InitialRepository = async () => "";
    if (!localStorage.getItem("gitextensions.lastRepository"))
      localStorage.setItem("gitextensions.lastRepository", "/tmp/last-active");
  });
  await page.goto("/");
  await expect(page.locator("footer")).toContainText("/tmp/last-active");
  await expect(
    page.getByRole("button", { name: "Initial commit", exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("footer")).toContainText("/tmp/last-active");
});

test("synchronized refs share a badge and SHA appears before author", async ({
  page,
}) => {
  const branch = "feature/" + "keep-the-complete-name-".repeat(5) + "release";
  await installBridge(page);
  await page.addInitScript((branch) => {
    const w = window as any;
    w.testSnapshot.branch = branch;
    w.testSnapshot.branches[0].name = branch;
    w.testSnapshot.branches[0].upstream = `origin/${branch}`;
    w.testSnapshot.branches.push({
      ...w.testSnapshot.branches[0],
      name: `origin/${branch}`,
      current: false,
      remote: true,
    });
    w.testSnapshot.commits[0].refs = `HEAD -> ${branch}, origin/${branch}`;
  }, branch);
  await page.goto("/");
  const badge = page.locator(".ref-label.current");
  await expect(badge).toHaveText(`${branch} · ☁ origin`);
  expect(
    await badge.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  expect(
    await badge.evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(240);
  expect(
    await badge.evaluate((el) => {
      const subject = el.closest(".subject")!.getBoundingClientRect();
      const label = el.getBoundingClientRect();
      return label.left >= subject.left && label.right <= subject.right;
    }),
  ).toBe(true);
  await expect(page.locator(".ref-label.remote")).toHaveCount(0);
  const hash = (await page.locator(".commit-row .hash").boundingBox())!;
  const subject = (await page.locator(".commit-row .subject").boundingBox())!;
  const author = (await page.locator(".commit-row .author").boundingBox())!;
  expect(hash.x).toBeGreaterThan(subject.x);
  expect(hash.x).toBeLessThan(author.x);
  const header = page
    .locator(".history-header")
    .getByText("SHA", { exact: true });
  const alignment = (await header.boundingBox())!.x - hash.x;
  await page.locator(".history-scroll").evaluate((el) => {
    el.scrollLeft = 100;
  });
  await expect
    .poll(
      async () =>
        (await header.boundingBox())!.x -
        (await page.locator(".commit-row .hash").boundingBox())!.x,
    )
    .toBeCloseTo(alignment, 0);
  await badge.locator(".combined-remote").click({ button: "right" });
  await expect(page.locator(".ref-menu")).toContainText(`origin/${branch}`);
  await expect(
    page.getByRole("menuitem", { name: `Merge into ${branch}`, exact: true }),
  ).toBeVisible();
});

test("large changed-file trees virtualize rows and keep identical basenames separate", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    (window as any).go.main.App.CommitFiles = async () =>
      Array.from(
        { length: 12000 },
        (_, i) => `src/group-${String(i).padStart(5, "0")}/index.ts`,
      );
  });
  await page.goto("/");
  await page.locator(".commit-row .subject").click();
  const tree = page.getByRole("tree", { name: "Changed files" });
  await expect(tree.locator(".tree-row.selected button")).toHaveAttribute(
    "title",
    "src/group-00000/index.ts",
  );
  expect(await tree.getByRole("treeitem").count()).toBeLessThan(40);
  await tree.focus();
  await tree.press("End");
  const last = tree.locator('button[title="src/group-11999/index.ts"]');
  await expect(last).toBeFocused();
  await last.press("Enter");
  await expect(page.locator(".diff-panel .filename")).toHaveText(
    "src/group-11999/index.ts",
  );
  expect(await tree.getByRole("treeitem").count()).toBeLessThan(40);
});

test("diff buttons navigate files, reject late previews and follow tree keyboard selection", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.go.main.App.CommitFiles = async () => [
      "src/first.ts",
      "src/second.ts",
      "src/third.ts",
    ];
    let delayed = false;
    w.go.main.App.Diff = async (_repo: string, file: string) => {
      if (file === "src/second.ts" && !delayed) {
        delayed = true;
        return new Promise((resolve) => {
          w.resolveSecond = () => resolve("@@ -0,0 +1 @@\n+late second");
        });
      }
      return `@@ -0,0 +1 @@\n+${file}`;
    };
  });
  await page.goto("/");
  await page.locator(".commit-row .subject").click();
  const panel = page.locator(".diff-panel");
  const previous = panel.getByRole("button", {
    name: "Previous file",
    exact: true,
  });
  const next = panel.getByRole("button", { name: "Next file", exact: true });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(panel.locator(".filename")).toHaveText("src/second.ts");
  await next.click();
  await expect(panel.locator(".filename")).toHaveText("src/third.ts");
  await expect(panel.locator(".diff-viewer")).toContainText("src/third.ts");
  await expect(next).toBeDisabled();
  await page.evaluate(() => (window as any).resolveSecond());
  await expect(panel.locator(".diff-viewer")).toContainText("src/third.ts");
  await panel.locator(".diff-scroll").focus();
  await page.keyboard.press("Alt+PageUp");
  await expect(panel.locator(".filename")).toHaveText("src/second.ts");
  const tree = panel.getByRole("tree");
  await expect(tree.locator(".tree-row.selected button")).toHaveAttribute(
    "title",
    "src/second.ts",
  );
  await tree.locator('button[title="src/second.ts"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(panel.locator(".filename")).toHaveText("src/third.ts");
  expect(
    await tree
      .locator(".tree-row")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(22);
});

test("diff file navigation preserves staged, unstaged and untracked areas", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.testSnapshot.files = ["a.ts", "b.ts"].map((path) => ({
      path,
      originalPath: "",
      index: "M",
      worktree: "M",
      conflict: false,
      untracked: false,
    }));
    w.testSnapshot.files.push({
      path: "c.ts",
      originalPath: "",
      index: "?",
      worktree: "?",
      conflict: false,
      untracked: true,
    });
    w.go.main.App.Diff = async (...args: string[]) => {
      w.testCalls.push({ name: "Diff", args });
      return `@@ -0,0 +1 @@\n+${args[1]} ${args[2]}`;
    };
  });
  await page.goto("/");
  const panel = page.locator(".diff-panel");
  await page.locator('[data-area="staged"] .file-button').first().click();
  await panel.getByRole("button", { name: "Next file", exact: true }).click();
  await expect(panel.locator(".diff-viewer")).toContainText("b.ts staged");
  await expect(
    panel.getByRole("button", { name: "Next file", exact: true }),
  ).toBeDisabled();
  await page.locator('[data-area="unstaged"] .file-button').first().click();
  await panel.getByRole("button", { name: "Next file", exact: true }).click();
  await expect(panel.locator(".diff-viewer")).toContainText("b.ts unstaged");
  await panel.getByRole("button", { name: "Next file", exact: true }).click();
  await expect(panel.locator(".filename")).toHaveText("c.ts");
  await expect(
    page.locator('[data-area="unstaged"] .file-row.selected .file-button'),
  ).toHaveText("c.ts");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((call: any) => call.name === "Diff")
            .at(-1).args[2],
      ),
    )
    .toBe("untracked");
});

test("diff buttons and F7 navigate separated changes within the same hunk", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    const context = Array.from({ length: 80 }, (_, i) => ` context ${i}`).join(
      "\n",
    );
    (window as any).go.main.App.Diff = async () =>
      `@@ -1,250 +1,250 @@\n${context}\n-old first\n+first\n${context}\n-old second\n+second\n${context}\n-old third\n+third\n`;
  });
  await page.goto("/");
  await page.locator('[data-area="unstaged"] .file-button').first().click();
  const diff = page.locator(".diff-panel .diff-viewer");
  const previous = diff.getByRole("button", {
    name: "Previous change",
    exact: true,
  });
  const next = diff.getByRole("button", { name: "Next change", exact: true });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(diff.locator(".active-change")).toContainText("old first");
  await next.click();
  await expect(diff.locator(".active-change")).toContainText("old second");
  await diff.locator(".diff-scroll").focus();
  await page.keyboard.press("F7");
  await expect(diff.locator(".active-change")).toContainText("old third");
  await expect(next).toBeDisabled();
  await page.keyboard.press("Shift+F7");
  await expect(diff.locator(".active-change")).toContainText("old second");
  await expect(diff.locator(".diff-navigation")).toContainText("2 / 3");
});

test("compact folder chains and one arrow press navigate directly to the next file", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    (window as any).go.main.App.CommitFiles = async () => [
      "root/one/two/alpha/first.ts",
      "root/one/two/alpha/second.ts",
      "root/one/two/beta/deep/nested/third.ts",
      "root/one/two/gamma/deep/fourth.ts",
    ];
  });
  await page.goto("/");
  await page.locator(".commit-row .subject").click();
  const tree = page.getByRole("tree", { name: "Changed files" });
  const root = tree.locator('button[title="root/one/two"]');
  await expect(root.locator(".folder-prefix")).toHaveText("root/one");
  await expect(root.locator(".folder-leaf")).toHaveText("two");
  await expect(
    tree.locator('button[title="root/one/two/beta/deep/nested"] .folder-leaf'),
  ).toHaveText("nested");
  await expect(tree.locator('button[title="root/one"]')).toHaveCount(0);
  const filename = page.locator(".diff-panel .filename");
  const first = tree.locator('button[title="root/one/two/alpha/first.ts"]');
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(filename).toHaveText("root/one/two/alpha/second.ts");
  await page.keyboard.press("ArrowDown");
  await expect(filename).toHaveText("root/one/two/beta/deep/nested/third.ts");
  await page.keyboard.press("ArrowDown");
  await expect(filename).toHaveText("root/one/two/gamma/deep/fourth.ts");
  await page.keyboard.press("ArrowUp");
  await expect(filename).toHaveText("root/one/two/beta/deep/nested/third.ts");
  // Folder controls still operate on the compacted path and its visible parent.
  const beta = tree.locator('button[title="root/one/two/beta/deep/nested"]');
  await beta.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    tree.locator('button[title="root/one/two/beta/deep/nested/third.ts"]'),
  ).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(root).toBeFocused();
  // A file step automatically opens a collapsed directory in its path.
  await tree.locator('button[title="root/one/two/alpha/second.ts"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(filename).toHaveText("root/one/two/beta/deep/nested/third.ts");
  await expect(
    tree.locator('button[title="root/one/two/beta/deep/nested/third.ts"]'),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(filename).toHaveText("root/one/two/alpha/first.ts");
  await page.keyboard.press("ArrowUp");
  await expect(first).toBeFocused();
  await page.keyboard.press("End");
  await expect(filename).toHaveText("root/one/two/gamma/deep/fourth.ts");
});

test("staged heading refresh updates both file lists without reloading history or the commit draft", async ({
  page,
}) => {
  await installBridge(page);
  await page.goto("/");
  await page.locator(".commit-row .subject").click();
  const message = page.getByRole("textbox", {
    name: "Commit message",
    exact: true,
  });
  await message.fill("Keep my draft");
  const historyReads = await page.evaluate(
    () =>
      (window as any).testCalls.filter((call: any) =>
        ["Snapshot", "HistorySnapshot"].includes(call.name),
      ).length,
  );
  await page.evaluate(() => {
    const w = window as any;
    w.testSnapshot.files = [
      {
        path: "staged.ts",
        originalPath: "",
        index: "M",
        worktree: " ",
        untracked: false,
        conflict: false,
      },
      {
        path: "unstaged.ts",
        originalPath: "",
        index: " ",
        worktree: "M",
        untracked: false,
        conflict: false,
      },
    ];
  });
  const staged = page.locator(".change-area").first();
  await staged
    .getByRole("button", { name: "Refresh file status", exact: true })
    .click();
  await expect(page.locator('[data-area="staged"] .file-button')).toHaveText(
    "staged.ts",
  );
  await expect(page.locator('[data-area="unstaged"] .file-button')).toHaveText(
    "unstaged.ts",
  );
  await expect(message).toHaveValue("Keep my draft");
  await expect(page.locator(".commit-row.selected")).toContainText(
    "Initial commit",
  );
  expect(
    await page.evaluate(
      () =>
        (window as any).testCalls.filter((call: any) =>
          ["Snapshot", "HistorySnapshot"].includes(call.name),
        ).length,
    ),
  ).toBe(historyReads);
});
