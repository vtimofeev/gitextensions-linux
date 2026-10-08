import {
  GraphRenderer,
  GraphPointers,
  GRAPH_EXTRA_WIDTH,
  LANE_WIDTH,
} from "../src/graph/renderer";
import { describe, it, expect, afterEach, vi } from "vitest";
import { presets } from "../src/theme/presets";
import { ThemeService } from "../src/theme/theme-service";
import { contrast, importTheme } from "../src/theme/theme-format";
import {
  Preferences,
  DEFAULT_UI_FONT,
  DEFAULT_CODE_FONT,
} from "../src/store/preferences";
import { pathMatches } from "../src/store/profile-rules";
import { historyRowHeight, graphLaneWidth } from "../src/graph/metrics";
import { Repository } from "../src/store/repository";
import { GitApi } from "../src/api/git-api";
afterEach(() => localStorage.clear());
describe("theme settings", () => {
  it("retains each preset and round-trips complete colour maps", () => {
    const service = new ThemeService();
    for (const base of ["ocean", "classic", "neutral"] as const) {
      const light = service.colors(base, { base, light: {}, dark: {} }, false),
        dark = service.colors(base, { base, light: {}, dark: {} }, true);
      const imported = importTheme(
        JSON.parse(JSON.stringify({ version: 1, name: base, light, dark })),
      );
      expect(imported.light).toEqual(light);
      expect(imported.dark).toEqual(dark);
      expect(Object.keys(light)).toEqual(Object.keys(presets.ocean.light));
    }
  });
  it("rejects malformed schemas and colours; reports unknown tokens", () => {
    for (const input of [
      null,
      {},
      { version: 2, name: "Bad", light: {}, dark: {} },
      { version: 1, name: "Bad", light: [], dark: {} },
      { version: 1, name: "Bad", light: { "color-accent": "red" }, dark: {} },
    ])
      expect(() => importTheme(input)).toThrow();
    expect(
      importTheme({
        version: 1,
        name: "Good",
        light: { extra: "#123456", "color-accent": "#ABCDEF" },
        dark: {},
      }),
    ).toMatchObject({
      light: { "color-accent": "#abcdef" },
      unknown: ["light.extra"],
    });
  });
  it("computes reference WCAG contrast values", () => {
    expect(contrast("#000000", "#ffffff")).toBe(21);
    expect(contrast("#abcdef", "#abcdef")).toBe(1);
    expect(contrast("#ffffff", "#000000")).toBe(21);
  });
  it("saves custom light/dark overrides and restores dialog changes", () => {
    const p = new Preferences();
    const initial = p.capture();
    p.preset = "custom";
    p.custom = {
      base: "neutral",
      light: { "color-accent": "#112233" },
      dark: { "color-text": "#ffffff" },
    };
    p.fontSize = 18;
    p.save();
    const restored = new Preferences();
    expect(restored.custom).toEqual(p.custom);
    expect(restored.fontSize).toBe(18);
    p.restore(initial);
    expect(p.preset).toBe("ocean");
    expect(p.fontSize).toBe(13);
  });
  it("uses Ubuntu and JetBrains stacks and scales bounded geometry", () => {
    const p = new Preferences();
    expect(p.uiFont).toBe(DEFAULT_UI_FONT);
    expect(p.codeFont).toBe(DEFAULT_CODE_FONT);
    expect(p.uiFont.startsWith('"Ubuntu"')).toBe(true);
    expect(historyRowHeight(13)).toBe(32);
    expect(historyRowHeight(20)).toBe(49);
    expect(historyRowHeight(10)).toBe(25);
    expect(graphLaneWidth(20)).toBeCloseTo(27.6923);
    p.setFontSize(25);
    expect(p.fontSize).toBe(20);
    expect(
      document.documentElement.style.getPropertyValue("--history-row-height"),
    ).toBe("49px");
  });
});
describe("profile path rules", () => {
  it("expands home and respects directory boundaries and escaped regex characters", () => {
    expect(
      pathMatches("~/work/**", "/home/test/work/a/repo", "/home/test"),
    ).toBe(true);
    expect(
      pathMatches("~/work/*", "/home/test/work/a/repo", "/home/test"),
    ).toBe(false);
    expect(pathMatches("/repos/a.b/**", "/repos/axb/repo", "/home/test")).toBe(
      false,
    );
    expect(pathMatches("/repos/a?", "/repos/ab", "/home/test")).toBe(true);
  });
  it("applies only the first matching rule and preserves partial local identity", async () => {
    const api = new GitApi();
    api.snapshot = vi.fn().mockResolvedValue({
      path: "/home/me/work/repo",
      homePath: "/home/me",
      commits: [],
      branches: [],
      files: [],
      remotes: [],
    });
    api.identity = vi.fn().mockResolvedValue({
      name: "Global",
      email: "global@test",
      scope: "global",
      localName: false,
      localEmail: false,
    });
    api.setIdentity = vi.fn().mockResolvedValue("");
    const profiles = [
      {
        id: "work",
        label: "Work",
        name: "Worker",
        email: "work@test",
        color: "#123456",
      },
    ];
    const repo = new Repository(api, {
      profiles,
      rules: [{ pattern: "~/work/**", profileId: "work" }],
      historyPageSize: 200,
      repoProfiles: {},
      rememberProfile: vi.fn(),
    });
    await repo.open("/home/me/work/repo");
    expect(api.setIdentity).toHaveBeenCalledWith(
      "/home/me/work/repo",
      "Worker",
      "work@test",
    );
    vi.mocked(api.setIdentity).mockClear();
    vi.mocked(api.identity).mockResolvedValue({
      name: "Local",
      email: "global@test",
      scope: "local",
      localName: true,
      localEmail: false,
    });
    await repo.open("/home/me/work/repo");
    expect(api.setIdentity).not.toHaveBeenCalled();
    // Explicitly empty local values are eligible, even if show-scope says local.
    vi.mocked(api.identity).mockResolvedValue({
      name: "",
      email: "",
      scope: "local",
      localName: false,
      localEmail: false,
    });
    await repo.open("/home/me/work/repo");
    expect(api.setIdentity).toHaveBeenCalledWith(
      "/home/me/work/repo",
      "Worker",
      "work@test",
    );
  });
});

describe("runtime settings integrity", () => {
  it("recovers malformed persisted settings", () => {
    localStorage.setItem("gitextensions.theme.preset", "missing");
    localStorage.setItem(
      "gitextensions.theme.custom",
      JSON.stringify({ base: "missing" }),
    );
    localStorage.setItem("gitextensions.identity.profiles", "{}");
    localStorage.setItem("gitextensions.identity.rules", "42");
    const p = new Preferences();
    expect(p.preset).toBe("ocean");
    expect(p.profiles).toEqual([]);
    expect(p.rules).toEqual([]);
    expect(() => p.applyTheme()).not.toThrow();
  });
  it("does not persist global hotkey changes while Settings is open", () => {
    const p = new Preferences();
    p.save();
    const before = p.capture();
    p.deferSave = true;
    p.setFontSize(19);
    p.setMode("dark");
    p.toggleLocale();
    p.deferSave = false;
    p.restore(before);
    const reloaded = new Preferences();
    expect(reloaded.fontSize).toBe(13);
    expect(reloaded.mode).toBe("system");
    expect(reloaded.locale).toBe("en");
  });
  it("draws nodes at the same scaled row centres as the virtualized DOM", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    // Happy DOM caches inherited custom properties; sample the runtime root
    // tokens directly while verifying the renderer's actual drawing geometry.
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (key: string) =>
        document.documentElement.style.getPropertyValue(key),
    } as CSSStyleDeclaration);
    const ctx = {
      scale: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const rows = [
      { hash: "first", lane: 0, color: 0, lines: [] },
      { hash: "second", lane: 0, color: 1, lines: [] },
    ];
    const renderer = new GraphRenderer();
    const prefs = new Preferences();
    for (const size of [13, 20]) {
      prefs.fontSize = size;
      prefs.applyTheme();
      ctx.arc.mockClear();
      ctx.scale.mockClear();
      renderer.draw(
        canvas,
        { rows, lanes: 1 },
        0,
        200,
        new GraphPointers(null),
        new Map(),
      );
      const ratio = size / 13;
      expect(ctx.scale.mock.calls[0]![0]).toBeCloseTo(
        (window.devicePixelRatio || 1) * ratio,
      );
      expect(ctx.arc.mock.calls[1]![1] * ratio).toBeCloseTo(
        historyRowHeight(size) * 1.5,
      );
      expect(parseFloat(canvas.style.width)).toBeCloseTo(
        (LANE_WIDTH + GRAPH_EXTRA_WIDTH) * ratio,
        5,
      );
    }
    canvas.remove();
    vi.restoreAllMocks();
  });
});
