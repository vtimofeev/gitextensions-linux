import { writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { installBridge } from "../e2e/bridge";

test("file navigation with large highlighted diffs", async ({ page }) => {
  test.setTimeout(180_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", {
    rate: Number(process.env.PERF_CPU_THROTTLE || 1),
  });
  await installBridge(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.testSnapshot.files = Array.from({ length: 35000 }, (_, i) => ({
      path: `file-${i}.ts`,
      originalPath: "",
      index: "M",
      worktree: "M",
      untracked: false,
      conflict: false,
    }));
    const lines = Array.from(
      { length: 10000 },
      (_, i) => `+export const value${i} = { name: "value", count: ${i} };`,
    ).join("\n");
    w.go.main.App.Diff = async (_path: string, file: string) =>
      `@@ -0,0 +1,10001 @@\n+// ${file}\n${lines}\n`;
    w.navigationTasks = [];
    new PerformanceObserver((list) =>
      w.navigationTasks.push(...list.getEntries().map((e) => e.duration)),
    ).observe({ type: "longtask" });
  });
  await page.goto("/");
  const button = page
    .locator('.sidebar-files[data-area="unstaged"] .file-button')
    .first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(
    page.locator(".diff-viewer .syntax-keyword").first(),
  ).toBeVisible({ timeout: 60_000 });
  const result = await profile(page, "navigation", () =>
    page.evaluate(async () => {
      const w = window as any;
      w.navigationTasks = [];
      const frames: number[] = [];
      for (const area of ["staged", "unstaged"]) {
        for (let i = 1; i <= 5; i++) {
          const started = performance.now();
          (
            document.querySelector(
              `.sidebar-files[data-area="${area}"] [data-index="${i}"] .file-button`,
            ) as HTMLButtonElement
          ).click();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          frames.push(performance.now() - started);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      frames.sort((a, b) => a - b);
      return {
        p50: frames[5],
        max: frames.at(-1),
        longTasks: w.navigationTasks.length,
        longestTaskMs: Math.max(0, ...w.navigationTasks),
      };
    }),
  );
  console.log("PERF navigation " + JSON.stringify(result));
  // Also measure completed previews so debounce cannot hide parsing costs.
  await expect(
    page.locator(".diff-viewer .syntax-keyword").first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    (window as any).navigationTasks = [];
  });
  for (const area of ["staged", "unstaged"]) {
    await page
      .locator(
        `.sidebar-files[data-area="${area}"] [data-index="6"] .file-button`,
      )
      .click();
    await expect(page.locator(".diff-panel .filename")).toHaveText("file-6.ts");
    await expect(
      page.locator(".diff-viewer .syntax-keyword").first(),
    ).toBeVisible({ timeout: 60_000 });
  }
  const completed = await page.evaluate(() => ({
    longTasks: (window as any).navigationTasks.length,
    longestTaskMs: Math.max(0, ...(window as any).navigationTasks),
  }));
  console.log("PERF completed previews " + JSON.stringify(completed));
  await page.locator(".diff-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const lastLine = page
    .locator(".diff-viewer .added")
    .filter({ hasText: "value9999" });
  await expect(lastLine).toBeVisible();
  await expect(lastLine.locator(".syntax-keyword").first()).toHaveText(
    "export",
  );
  expect(await page.locator(".diff-viewer .diff-line").count()).toBeLessThan(
    100,
  );
});

async function profile<T>(page: Page, name: string, action: () => Promise<T>) {
  if (!process.env.PERF_PROFILE) return action();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  const result = await action();
  const { profile } = await cdp.send("Profiler.stop");
  writeFileSync(
    `${process.env.PERF_PROFILE}/working-${name}.cpuprofile`,
    JSON.stringify(profile),
  );
  return result;
}
test("working tree performance (35000 files)", async ({ page }) => {
  test.setTimeout(600_000);
  const throttle = Number(process.env.PERF_CPU_THROTTLE || 1);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await installBridge(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.testSnapshot.files = Array.from({ length: 35000 }, (_, i) => ({
      path: `generated/file-${String(i).padStart(5, "0")}.txt`,
      originalPath: "",
      index: i < 30000 ? " " : "M",
      worktree: i < 30000 ? "M" : " ",
      untracked: false,
      conflict: false,
    }));
    w.longTasks = [];
    new PerformanceObserver((list) =>
      w.longTasks.push(...list.getEntries().map((e) => e.duration)),
    ).observe({ type: "longtask", buffered: true });
  });
  const firstRowMs = await profile(page, "load", async () => {
    const started = Date.now();
    await page.goto("/");
    await expect(
      page.locator('.sidebar-files[data-area="unstaged"] .file-row').first(),
    ).toBeVisible({ timeout: 480_000 });
    return Date.now() - started;
  });
  console.log("PERF load " + JSON.stringify({ firstRowMs }));
  const scroll = await profile(page, "scroll", () =>
    page.evaluate(async () => {
      const el = document.querySelector(
        '.sidebar-files[data-area="unstaged"]',
      ) as HTMLElement;
      const frames: number[] = [];
      let last = performance.now();
      await new Promise<void>((done) => {
        const tick = (now: number) => {
          frames.push(now - last);
          last = now;
          el.scrollTop += 145;
          if (frames.length === 180) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      frames.shift();
      frames.sort((a, b) => a - b);
      return {
        p50: frames[89],
        p95: frames[169],
        max: frames.at(-1),
        over33ms: frames.filter((f) => f > 33).length,
      };
    }),
  );
  console.log("PERF scroll " + JSON.stringify(scroll));
  const list = page.locator('.sidebar-files[data-area="unstaged"]');
  await list.focus();
  const startSelect = Date.now();
  await list.press("Control+a");
  await expect(
    page.getByRole("button", { name: "Stage 30000", exact: true }),
  ).toBeVisible({ timeout: 180_000 });
  const selectAllMs = Date.now() - startSelect;
  console.log("PERF select " + JSON.stringify({ selectAllMs }));
  const refresh = await profile(page, "refresh", () =>
    page.evaluate(async () => {
      const w = window as any;
      const before = w.longTasks.length;
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 1500));
      const tasks = w.longTasks.slice(before);
      return { longTasks: tasks.length, longestTaskMs: Math.max(0, ...tasks) };
    }),
  );
  const startStage = Date.now();
  await page.getByRole("button", { name: "Stage all", exact: true }).click();
  await expect(list.locator(".file-row")).toHaveCount(0, { timeout: 180_000 });
  const stageAllMs = Date.now() - startStage;
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");
  console.log(
    "PERF " +
      JSON.stringify({
        cpuThrottle: throttle,
        firstRowMs,
        scroll,
        selectAllMs,
        stageAllMs,
        refresh,
        heapMB: Math.round(heap.usedSize / 1048576),
      }),
  );
});
