import { test, expect } from "@playwright/test";
import { installBridge } from "./bridge";

test("large lists virtualize, navigate, select ranges and stage all", async ({
  page,
}) => {
  await installBridge(page);
  await page.addInitScript(() => {
    (window as any).testSnapshot.files = Array.from(
      { length: 35000 },
      (_, i) => ({
        path: `file-${String(i).padStart(5, "0")}.txt`,
        originalPath: "",
        index: i < 30000 ? " " : "M",
        worktree: i < 30000 ? "M" : " ",
        conflict: false,
        untracked: false,
      }),
    );
  });
  await page.goto("/");
  const list = page.locator('.sidebar-files[data-area="unstaged"]');
  const staged = page.locator('.sidebar-files[data-area="staged"]');
  await expect(list.locator(".file-row").first()).toBeVisible();
  expect(await list.locator(".file-row").count()).toBeLessThan(100);
  expect(await staged.locator(".file-row").count()).toBeLessThan(100);
  await list
    .getByRole("button", { name: "file-00000.txt", exact: true })
    .click();
  // Move just beyond the viewport, including overscan: keyboard must reveal and focus.
  const lastVisible = await list.evaluate((el) => {
    const rows = [...el.querySelectorAll<HTMLElement>(".file-row")];
    const bottom = el.getBoundingClientRect().bottom;
    return Number(
      rows.filter((r) => r.getBoundingClientRect().bottom <= bottom).at(-1)!
        .dataset.index,
    );
  });
  await list.locator(`[data-index="${lastVisible}"] .file-button`).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    list.locator(`[data-index="${lastVisible + 1}"] .file-button`),
  ).toBeFocused();
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await list.evaluate((el) => {
    el.scrollTop = 0;
  });
  await list
    .getByRole("button", { name: "file-00002.txt", exact: true })
    .click();
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const last = list.getByRole("button", {
    name: "file-29999.txt",
    exact: true,
  });
  await expect(last).toBeVisible();
  expect(await list.locator(".file-row").count()).toBeLessThan(100);
  await last.click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Stage 29998", exact: true }).click();
  const paths = await page.evaluate(
    () =>
      (window as any).testCalls.find((c: any) => c.name === "Stage").args[1],
  );
  expect(paths).toEqual(
    Array.from(
      { length: 29998 },
      (_, i) => `file-${String(i + 2).padStart(5, "0")}.txt`,
    ),
  );
  await expect(list.locator(".file-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Stage all", exact: true }).click();
  await expect(list.locator(".file-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Unstage all", exact: true }).click();
  await expect(list.locator(".file-row").first()).toBeVisible();
  await list.focus();
  await list.press("Control+a");
  await expect(
    page.getByRole("button", { name: "Stage 35000", exact: true }),
  ).toBeVisible();
  await list.press("Escape");
  await expect(list.locator(".file-row.selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Stage all", exact: true }).click();
  await expect(list.locator(".file-row")).toHaveCount(0);
});
