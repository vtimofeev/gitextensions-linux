import { test, expect } from "@playwright/test";
import { installBridge } from "./bridge";

test("branch list stays bounded across repository changes, scrolls, filters and navigates from keyboard", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem("gitextensions.font.size", "14");
  });
  await page.goto("/");
  await expect(page.locator(".branch-row").first()).toBeVisible();
  await page.evaluate(() => {
    const w = window as any;
    const snapshot = w.testSnapshot;
    snapshot.files = Array.from({ length: 60 }, (_, i) => ({
      path: `file-${String(i).padStart(2, "0")}.ts`,
      originalPath: "",
      index: " ",
      worktree: "M",
      untracked: false,
      conflict: false,
    }));
    w.go.main.App.Diff = async (...args: string[]) => {
      w.testCalls.push({ name: "Diff", args });
      return "";
    };
    snapshot.branches.push(
      ...Array.from({ length: 4000 }, (_, i) => ({
        name:
          (i < 2000 ? "local-" : "origin/remote-") + String(i).padStart(4, "0"),
        hash: (i + 1).toString(16).padStart(40, "0"),
        remote: i >= 2000,
        current: false,
        upstream: i < 2000 ? "origin/tracked" : "",
        tracking: "",
      })),
    );
  });
  await page.keyboard.press("Control+o");
  await page.getByRole("menuitem", { name: "Open folder…" }).click();
  await expect(page.locator(".repo-switcher")).toContainText("selected-repo");
  const list = page.locator(".branch-list");
  const rendered = list.locator(".branch-row, .remote-ref");
  expect(await rendered.count()).toBeLessThan(50);
  // Scrolling working files must keep both panels bounded without loading a diff.
  const files = page.locator('.sidebar-files[data-area="unstaged"]');
  await files.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    files.getByRole("button", { name: "file-59.ts", exact: true }),
  ).toBeVisible();
  expect(await files.locator(".file-row").count()).toBeLessThan(50);
  expect(await rendered.count()).toBeLessThan(50);
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((c: any) => c.name === "Diff"),
    ),
  ).toEqual([]);
  await list.focus();
  await list.press("End");
  await expect(
    list.getByRole("button", { name: "origin/remote-3999", exact: true }),
  ).toBeFocused();
  expect(await rendered.count()).toBeLessThan(50);
  await list.press("Home");
  await expect(
    list.getByRole("button", { name: /main/ }).first(),
  ).toBeFocused();
  const search = page.getByRole("searchbox", {
    name: "Search branches (contains)",
  });
  await search.fill("remote-3999");
  await expect(
    list.getByRole("button", { name: "origin/remote-3999", exact: true }),
  ).toBeVisible();
  await expect(list.locator(".remote-ref")).toHaveCount(1);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
  await search.fill("missing-branch");
  await expect(list.getByText("No matching branches").first()).toBeVisible();
  await search.press("Escape");
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    list.getByRole("button", { name: "origin/remote-3999", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const snapshot = (window as any).testSnapshot;
    snapshot.branches = snapshot.branches.slice(0, 2);
    (window as any).go.main.App.ChooseRepository = async () => "/tmp/ui-repo";
  });
  await page.keyboard.press("Control+o");
  await page.getByRole("menuitem", { name: "Open folder…" }).click();
  await expect(page.locator(".repo-switcher")).toHaveAttribute(
    "title",
    "/tmp/ui-repo",
  );
  await expect(list.locator(".branch-row")).toHaveCount(2);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
});
