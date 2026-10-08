import { test, expect } from "@playwright/test";
import { installBridge } from "./bridge";

// Hover / press styles must not change toolbar button geometry (e.g. a border
// appearing on hover shifted every control to the left by 1px).
test("toolbar buttons keep their geometry on hover and press", async ({
  page,
}) => {
  await installBridge(page);
  await page.goto("/");
  await page.locator(".commit-row").first().waitFor();
  const geometry = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".app-toolbar button")].map((b) => {
        const r = b.getBoundingClientRect();
        return [r.x, r.width, r.height].map(Math.round).join(",");
      }),
    );
  const away = () => page.mouse.move(700, 600);
  await away();
  const base = await geometry();
  const buttons = page.locator(".app-toolbar button");
  for (let i = 0; i < (await buttons.count()); i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible()) || (await button.isDisabled())) continue;
    await button.hover();
    expect(await geometry(), `hover #${i}`).toEqual(base);
    await page.mouse.down();
    expect(await geometry(), `press #${i}`).toEqual(base);
    await away();
    await page.mouse.up();
  }
});
