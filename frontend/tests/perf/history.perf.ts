import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { installBridge } from "../e2e/bridge";

// UI performance probe. Not part of the e2e suite: run with
//   PERF_FIXTURE=/path/snapshot.json npx playwright test -c playwright.perf.config.ts
// The fixture is a Snapshot JSON (for example a dump of a large real repository).
const fixture = process.env.PERF_FIXTURE;
test.skip(!fixture, "PERF_FIXTURE is not set");

async function open(page: Page, limit?: number) {
  const data = JSON.parse(readFileSync(fixture!, "utf8"));
  if (limit) data.commits = data.commits.slice(0, limit);
  const throttle = Number(process.env.PERF_CPU_THROTTLE || 1);
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await installBridge(page);
  await page.addInitScript((snap) => {
    const w = window as unknown as {
      testSnapshot: Record<string, unknown>;
      perfMarks: Record<string, number>;
      longTasks: number[];
    };
    Object.assign(w.testSnapshot, snap, { path: "/tmp/ui-repo", files: [] });
    w.perfMarks = {};
    w.longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.longTasks.push(e.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // WebKit has no longtask entries; frame timings still apply.
    }
  }, data);
  const started = Date.now();
  await page.goto("/");
  await expect(page.locator(".commit-row").first()).toBeVisible({
    timeout: 60_000,
  });
  const firstRow = Date.now() - started;
  await expect(page.locator(".graph-loading")).toHaveCount(0, {
    timeout: 60_000,
  });
  const graphReady = Date.now() - started;
  return { commits: data.commits.length, firstRow, graphReady };
}

// Scrolls the history in animation frames and reports frame-time percentiles.
async function scrollFrames(page: Page, rows: number) {
  return page.evaluate(async (rows) => {
    const el = document.querySelector(".history-scroll") as HTMLElement;
    const target = Math.min(el.scrollHeight - el.clientHeight, rows * 32);
    // Same distance per frame for every history size (about 5 rows per frame).
    const frames: number[] = [];
    let last = performance.now();
    const step = target / 180;
    await new Promise<void>((done) => {
      const tick = (now: number) => {
        frames.push(now - last);
        last = now;
        el.scrollTop = Math.min(target, el.scrollTop + step);
        if (el.scrollTop >= target - 1 || frames.length > 400) done();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    frames.shift();
    frames.sort((a, b) => a - b);
    const q = (p: number) => frames[Math.floor((frames.length - 1) * p)]!;
    return {
      frames: frames.length,
      p50: +q(0.5).toFixed(1),
      p95: +q(0.95).toFixed(1),
      max: +q(1).toFixed(1),
      over33ms: frames.filter((f) => f > 33).length,
    };
  }, rows);
}

async function clickLatency(page: Page, index: number) {
  const row = page.locator(".commit-row .subject").nth(index);
  const started = Date.now();
  await row.click();
  await expect(page.locator(".commit-row.selected")).toHaveCount(1);
  return Date.now() - started;
}

async function refreshCost(page: Page) {
  return page.evaluate(async () => {
    const before = (window as unknown as { longTasks: number[] }).longTasks
      .length;
    const t = performance.now();
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 1500));
    const tasks = (
      window as unknown as { longTasks: number[] }
    ).longTasks.slice(before);
    return {
      ms: +(performance.now() - t).toFixed(0),
      longTasks: tasks.length,
      longestTask: +Math.max(0, ...tasks).toFixed(0),
    };
  });
}

// Optional CPU profiles (PERF_PROFILE=dir) for load, scroll and refresh phases.
async function profiled<T>(
  page: Page,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  const dir = process.env.PERF_PROFILE;
  if (!dir) return action();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  const result = await action();
  const { profile } = await cdp.send("Profiler.stop");
  writeFileSync(`${dir}/${name}.cpuprofile`, JSON.stringify(profile));
  return result;
}

for (const limit of [1000, 0]) {
  test(`history performance (${limit || "all"} commits)`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    const tag = limit || "all";
    const load = await profiled(page, `load-${tag}`, () =>
      open(page, limit || undefined),
    );
    const scroll = await profiled(page, `scroll-${tag}`, () =>
      scrollFrames(page, 900),
    );
    const click = await clickLatency(page, 3);
    const refresh = await profiled(page, `refresh-${tag}`, () =>
      refreshCost(page),
    );
    const memory = await page.evaluate(() => {
      const m = (
        performance as unknown as { memory?: { usedJSHeapSize: number } }
      ).memory;
      return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
    });
    const longTasks = await page.evaluate(
      () => (window as unknown as { longTasks: number[] }).longTasks,
    );
    const result = {
      browser: browserName,
      cpuThrottle: Number(process.env.PERF_CPU_THROTTLE || 1),
      ...load,
      scroll,
      clickMs: click,
      refresh,
      heapMB: memory,
      longTasksTotal: longTasks.length,
      longestTaskMs: +Math.max(0, ...longTasks).toFixed(0),
    };
    console.log("PERF " + JSON.stringify(result));
  });
}

// Search filter on a large history: apply time and graph width (lanes).
test("filtered history (PERF_SEARCH)", async ({ page }) => {
  test.skip(!process.env.PERF_SEARCH, "PERF_SEARCH is not set");
  test.setTimeout(180_000);
  await open(page);
  const search = page.getByRole("textbox", {
    name: "Search recent commits",
    exact: true,
  });
  await search.fill(process.env.PERF_SEARCH!);
  const started = Date.now();
  await search.press("Enter");
  await expect(page.locator(".graph-loading")).toHaveCount(0);
  await expect(page.locator(".commit-row").first()).toBeVisible();
  const applyMs = Date.now() - started;
  const canvasWidth = await page
    .locator(".commit-canvas")
    .evaluate((el) => parseFloat((el as HTMLElement).style.width));
  if (process.env.PERF_PROFILE)
    await page.screenshot({
      path: `${process.env.PERF_PROFILE}/filtered.png`,
    });
  console.log(
    "PERF " + JSON.stringify({ filtered: true, applyMs, canvasWidth }),
  );
});
