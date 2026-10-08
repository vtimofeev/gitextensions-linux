import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { Repository } from "../src/store/repository";
import { Preferences } from "../src/store/preferences";
import { GitApi } from "../src/api/git-api";
import { sortRecentRepos, type RecentRepo } from "../src/store/recent-repos";

function entry(path: string, age: number, favorite = false): RecentRepo {
  return {
    path,
    favorite,
    lastOpened: new Date(Date.UTC(2026, 8, 30) - age * 1000).toISOString(),
  };
}
function seed(entries: RecentRepo[]) {
  localStorage.setItem("gitextensions.recentRepos", JSON.stringify(entries));
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
describe("recent repositories", () => {
  it("migrates once, keeps order with decreasing ISO timestamps, and leaves the old key untouched", () => {
    const old = JSON.stringify(["/one", "/two", "/three"]);
    localStorage.setItem("gitextensions.recent", old);
    const repo = new Repository(new GitApi());
    expect(repo.recent.map((r) => r.path)).toEqual(["/one", "/two", "/three"]);
    expect(
      repo.recent.every(
        (r) =>
          !r.favorite && new Date(r.lastOpened).toISOString() === r.lastOpened,
      ),
    ).toBe(true);
    expect(Date.parse(repo.recent[0]!.lastOpened)).toBeGreaterThan(
      Date.parse(repo.recent[1]!.lastOpened),
    );
    repo.removeRecent("/two");
    expect(new Repository(new GitApi()).recent.map((r) => r.path)).toEqual([
      "/one",
      "/three",
    ]);
    expect(localStorage.getItem("gitextensions.recent")).toBe(old);
    repo.removeRecent("/one");
    repo.removeRecent("/three");
    expect(new Repository(new GitApi()).recent).toEqual([]);
  });
  it("sorts favorites first, with both sections ordered by last opened", () => {
    const sorted = sortRecentRepos([
      entry("/old", 4),
      entry("/fav-old", 8, true),
      entry("/new", 1),
      entry("/fav-new", 2, true),
    ]);
    expect(sorted.map((r) => r.path)).toEqual([
      "/fav-new",
      "/fav-old",
      "/new",
      "/old",
    ]);
  });
  it("evicts only the oldest non-favorites", () => {
    seed([
      entry("/favorite", 100, true),
      ...Array.from({ length: 7 }, (_, i) => entry("/" + i, i)),
    ]);
    localStorage.setItem("gitextensions.recent.limit", "5");
    const repo = new Repository(new GitApi());
    expect(repo.recent.map((r) => r.path)).toEqual([
      "/favorite",
      "/0",
      "/1",
      "/2",
      "/3",
      "/4",
    ]);
  });
  it("trims immediately on applying a lowered limit and persists it", () => {
    seed(Array.from({ length: 8 }, (_, i) => entry("/" + i, i)));
    const prefs = new Preferences();
    const repo = new Repository(new GitApi(), prefs);
    expect(prefs.recentRepoLimit).toBe(50);
    prefs.recentRepoLimit = 5;
    prefs.save();
    repo.trimRecent();
    expect(repo.recent.map((r) => r.path)).toEqual([
      "/0",
      "/1",
      "/2",
      "/3",
      "/4",
    ]);
    expect(new Preferences().recentRepoLimit).toBe(5);
    expect(new Repository(new GitApi()).recent).toEqual(repo.recent);
  });
  it("keeps a toggled favorite across trims and reloads, and trims after un-starring", () => {
    seed(Array.from({ length: 8 }, (_, i) => entry("/" + i, i)));
    const repo = new Repository(new GitApi());
    repo.toggleFavorite("/7");
    repo.trimRecent(5);
    expect(repo.recent[0]).toEqual(entry("/7", 7, true));
    expect(repo.recent).toHaveLength(6);
    const reloaded = new Repository(new GitApi());
    expect(reloaded.recent[0]?.favorite).toBe(true);
    reloaded.toggleFavorite("/7");
    reloaded.trimRecent(5);
    expect(reloaded.recent.map((r) => r.path)).toEqual([
      "/0",
      "/1",
      "/2",
      "/3",
      "/4",
    ]);
  });
  it("updates opening timestamps and preserves favorite status", async () => {
    seed([entry("/favorite", 100, true), entry("/recent", 1)]);
    const api = new GitApi();
    api.snapshot = vi.fn().mockImplementation(async (path) => ({
      path,
      files: [],
      commits: [],
      branches: [],
      remotes: [],
    }));
    api.identity = vi.fn().mockResolvedValue({
      name: "Test",
      email: "test@example.test",
      scope: "local",
    });
    const repo = new Repository(api);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    await repo.open("/other");
    expect(repo.recent.map((r) => r.path)).toEqual([
      "/favorite",
      "/other",
      "/recent",
    ]);
    await repo.open("/favorite");
    expect(repo.recent[0]).toEqual({
      path: "/favorite",
      favorite: true,
      lastOpened: "2026-10-01T12:00:00.000Z",
    });
  });
  it("handles malformed storage without restarting migration", () => {
    localStorage.setItem("gitextensions.recentRepos", "broken");
    localStorage.setItem("gitextensions.recent", '["/legacy"]');
    expect(new Repository(new GitApi()).recent).toEqual([]);
  });
  it("bounds retention settings and restores a cancelled draft", () => {
    for (const value of ["4", "201", "bad"]) {
      localStorage.setItem("gitextensions.recent.limit", value);
      expect(new Preferences().recentRepoLimit).toBe(50);
    }
    const prefs = new Preferences();
    const saved = prefs.capture();
    prefs.recentRepoLimit = 5;
    prefs.restore(saved);
    expect(prefs.recentRepoLimit).toBe(50);
  });
});
