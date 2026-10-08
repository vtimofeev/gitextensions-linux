import { test, expect } from "@playwright/test";
import { installBridge } from "./bridge";
import type { FileContent } from "../../src/domain/models";

test.beforeEach(async ({ page }) => {
  await installBridge(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Initial commit", exact: false }),
  ).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as {
      testSnapshot: {
        files: Array<{
          path: string;
          index: string;
          worktree: string;
          untracked: boolean;
          conflict: boolean;
          originalPath: string;
        }>;
      };
      go: {
        main: {
          App: {
            FileContent: (
              path: string,
              file: string,
              area: string,
              revision: string,
            ) => Promise<FileContent>;
            Diff: (...args: unknown[]) => Promise<string>;
            FileDiff: (...args: unknown[]) => Promise<string>;
            FileHistory: (
              ...args: unknown[]
            ) => Promise<Array<{ file: string; commit: { hash: string } }>>;
          };
        };
      };
      resolveImage?: () => void;
      imageCalls: unknown[][];
    };
    w.testSnapshot.files = [
      "large.png",
      "vector.svg",
      "broken.png",
      "slow.png",
    ].map((path) => ({
      path,
      originalPath: "",
      index: " ",
      worktree: "M",
      untracked: false,
      conflict: false,
    }));
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1200;
    const png: FileContent = {
      text: "",
      binary: true,
      imageMime: "image/png",
      imageBase64: canvas.toDataURL().split(",")[1],
    };
    w.imageCalls = [];
    w.go.main.App.FileContent = async (...args) => {
      w.imageCalls.push(args);
      if (args[1] === "slow.png")
        return new Promise((resolve) => {
          w.resolveImage = () => resolve(png);
        });
      if (args[1] === "broken.png")
        return { ...png, imageBase64: btoa("broken") };
      if (args[1] !== "vector.svg") return png;
      const width = args[3].startsWith("b") ? 80 : 120;
      const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="60"><script>window.parent.svgExecuted = true</script><image href="https://svg-resource.invalid/tracker.png"/><rect width="${width}" height="60" fill="red"/></svg>`;
      return {
        text,
        binary: false,
        imageMime: "image/svg+xml",
        imageBase64: btoa(text),
      };
    };
    w.go.main.App.Diff = async () => "Binary file";
    w.go.main.App.FileDiff = async () => "Binary file";
    const history = w.go.main.App.FileHistory;
    w.go.main.App.FileHistory = async (...args) =>
      (await history(...args)).map((entry) => ({
        ...entry,
        file: "vector.svg",
      }));
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
});

test("image preview fits large images, zooms and retains access to diff", async ({
  page,
}) => {
  await page
    .locator('[data-area="unstaged"] .file-button')
    .filter({ hasText: "large.png" })
    .click();
  const preview = page.locator(".diff-panel .file-preview");
  const image = preview.getByRole("img", { name: "large.png" });
  await expect(preview).toContainText("2000 × 1200");
  expect(
    await image.evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThan(2000);
  await preview.getByRole("button", { name: "100%", exact: true }).click();
  await expect(preview.getByLabel("Image zoom")).toHaveText("100%");
  expect(await image.evaluate((el) => el.getBoundingClientRect().width)).toBe(
    2000,
  );
  expect(
    await preview
      .locator(".image-viewport")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await preview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(preview.getByLabel("Image zoom")).toHaveText("125%");
  await preview.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(preview.getByLabel("Image zoom")).toHaveText("100%");
  await image.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(preview.getByLabel("Image zoom")).toHaveText("125%");
  await preview.getByRole("button", { name: "Fit", exact: true }).click();
  expect(
    await image.evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThan(2000);
  await page
    .locator(".diff-panel")
    .getByRole("button", { name: "Diff", exact: true })
    .click();
  await expect(page.locator(".diff-panel .diff-viewer")).toContainText(
    "Binary file",
  );
  await page
    .locator(".diff-panel")
    .getByRole("button", { name: "Image", exact: true })
    .click();
  await expect(image).toBeVisible();
});

test("SVG source, modal and historical versions use isolated image documents", async ({
  page,
}) => {
  const resources: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("svg-resource.invalid"))
      resources.push(request.url());
  });
  await page
    .locator('[data-area="unstaged"] .file-button')
    .filter({ hasText: "vector.svg" })
    .click();
  const panel = page.locator(".diff-panel");
  await expect(panel.locator(".image-actions")).toContainText("120 × 60");
  await panel.getByRole("tab", { name: "Source", exact: true }).click();
  await expect(panel.locator(".cm-content")).toContainText(
    '<svg xmlns="http://www.w3.org/2000/svg"',
  );
  await expect(panel.locator("svg rect")).toHaveCount(0);
  await panel.getByRole("tab", { name: "Image", exact: true }).click();
  await panel
    .getByRole("button", { name: "View whole file", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".image-actions")).toContainText("120 × 60");
  await dialog
    .getByRole("button", { name: "File history", exact: true })
    .click();
  await expect(dialog.locator(".history-content .image-actions")).toContainText(
    "120 × 60",
  );
  await dialog
    .locator(".history-entry")
    .last()
    .locator(".revision-button")
    .click();
  await expect(dialog.locator(".history-content .image-actions")).toContainText(
    "80 × 60",
  );
  await dialog
    .getByRole("tab", { name: "Whole file with changes", exact: true })
    .click();
  await dialog.getByRole("tab", { name: "Source", exact: true }).click();
  await expect(dialog.locator(".cm-content")).toContainText('width="80"');
  expect(resources).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { svgExecuted?: boolean }).svgExecuted,
    ),
  ).toBeUndefined();
  const calls = await page.evaluate(
    () => (window as unknown as { imageCalls: unknown[][] }).imageCalls,
  );
  expect(
    calls.some(
      (call) =>
        call[1] === "vector.svg" &&
        call[2] === "commit" &&
        call[3] === "b".repeat(40),
    ),
  ).toBe(true);
});

test("late image responses cannot replace a new selection; damaged images have a notice", async ({
  page,
}) => {
  await page
    .locator('[data-area="unstaged"] .file-button')
    .filter({ hasText: "slow.png" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { resolveImage?: () => void })
            .resolveImage,
      ),
    )
    .toBe("function");
  await page
    .locator('[data-area="unstaged"] .file-button')
    .filter({ hasText: "vector.svg" })
    .click();
  await expect(page.locator(".diff-panel .image-actions")).toContainText(
    "120 × 60",
  );
  await page.evaluate(() =>
    (window as unknown as { resolveImage: () => void }).resolveImage(),
  );
  await expect(page.locator(".diff-panel .image-actions")).toContainText(
    "120 × 60",
  );
  await expect(page.locator(".diff-panel img[alt='slow.png']")).toHaveCount(0);
  await page
    .locator('[data-area="unstaged"] .file-button')
    .filter({ hasText: "broken.png" })
    .click();
  await expect(page.locator(".diff-panel")).toContainText(
    "Unable to display this image",
  );
  await page
    .locator('[data-area="unstaged"] .file-button')
    .filter({ hasText: "vector.svg" })
    .click();
  await expect(page.locator(".diff-panel .image-actions")).toContainText(
    "120 × 60",
  );
});
