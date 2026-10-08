import { describe, it, expect, afterEach } from "vitest";
import { authorColor, authorInitials } from "../src/domain/author-color";
import {
  blameBlocks,
  blameDefaults,
  blameGutterText,
  compactDate,
} from "../src/domain/blame";
import { presets } from "../src/theme/presets";
import { contrast } from "../src/theme/theme-format";
import { Preferences } from "../src/store/preferences";
import type { BlameLine } from "../src/domain/models";
const line: BlameLine = {
  hash: "a".repeat(40),
  author: "Ada Lovelace",
  email: "ada@example.test",
  date: "2026-10-01T16:55:00+03:00",
  summary: "Change",
  originalPath: "old.txt",
  originalLine: 1,
  line: 1,
  text: "one",
};
afterEach(() => localStorage.clear());
describe("authors and blame", () => {
  it("keeps identity colours stable and spreads similar emails", () => {
    const emails = Array.from(
      { length: 20 },
      (_, i) => `author${i}@example.test`,
    );
    expect(new Set(emails.map(authorColor)).size).toBeGreaterThanOrEqual(8);
    expect(authorColor("ADA@example.test")).toBe(
      authorColor("ada@example.test"),
    );
    expect(authorInitials("  Ada   Lovelace ")).toBe("AL");
    expect(authorInitials("Иван Петров")).toBe("ИП");
    expect(authorInitials("Ada")).toBe("Ad");
    expect(authorInitials("AdaLovelace")).toBe("AL");
    expect(authorInitials("ada.lovelace")).toBe("AL");
    expect(authorInitials("")).toBe("?");
  });
  it("provides twelve readable hues in every preset and mode", () => {
    for (const preset of Object.values(presets))
      for (const mode of ["light", "dark"] as const) {
        const colors: Record<string, string> = preset[mode];
        const palette = Array.from(
          { length: 12 },
          (_, i) => colors[`author-${i + 1}`]!,
        );
        expect(new Set(palette).size).toBe(12);
        for (const color of palette) {
          expect(
            contrast(color, colors["color-level-200"]!),
          ).toBeGreaterThanOrEqual(3);
          expect(
            Math.max(
              contrast(color, colors["author-ink-light"]!),
              contrast(color, colors["author-ink-dark"]!),
            ),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
  });
  it("groups consecutive commits, including repeated commits and 10k lines", () => {
    expect(blameBlocks([line, line, { ...line, hash: "b" }, line])).toEqual([
      { first: true, alternate: false },
      { first: false, alternate: false },
      { first: true, alternate: true },
      { first: true, alternate: false },
    ]);
    const blocks = blameBlocks(Array.from({ length: 10001 }, () => line));
    expect(blocks[9000]).toEqual({ first: false, alternate: false });
  });
  it("formats graph dates and all gutter ordering combinations", () => {
    const localDate = new Date(2026, 9, 1, 16, 55).toISOString();
    expect(compactDate(localDate, "ru")).toBe("01.10.26, 16:55");
    expect(compactDate(localDate, "ru", true, false)).toBe("01.10.26");
    expect(compactDate(localDate, "ru", false, true)).toBe("16:55");
    const value = compactDate(line.date, "ru");
    const expected = new Intl.DateTimeFormat("ru", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(line.date));
    expect(value).toBe(expected);
    expect(compactDate("invalid", "ru")).toBe("");
    expect(blameGutterText(line, blameDefaults, "ru")).toBe(
      `${value} - Ada Lovelace`,
    );
    expect(
      blameGutterText(line, { ...blameDefaults, authorFirst: true }, "ru"),
    ).toBe(`Ada Lovelace - ${value}`);
    expect(
      blameGutterText(line, { ...blameDefaults, showAuthor: false }, "ru"),
    ).toBe(value);
    expect(
      blameGutterText(line, { ...blameDefaults, showDate: false }, "ru"),
    ).toBe("Ada Lovelace");
    expect(
      blameGutterText(
        line,
        { ...blameDefaults, showDate: false, showAuthor: false },
        "ru",
      ),
    ).toBe("");
    expect(
      blameGutterText(line, { ...blameDefaults, showTime: false }, "ru"),
    ).toBe(`${compactDate(line.date, "ru", true, false)} - Ada Lovelace`);
  });
  it("persists settings and restores cancelled changes", () => {
    const p = new Preferences();
    expect(p.blame).toEqual(blameDefaults);
    const initial = p.capture();
    p.blame.authorFirst = true;
    p.showAuthorAvatarColumn = false;
    p.highlightMyCommits = false;
    p.save();
    const saved = new Preferences();
    expect(saved.blame.authorFirst).toBe(true);
    expect(saved.showAuthorAvatarColumn).toBe(false);
    expect(saved.highlightMyCommits).toBe(false);
    p.restore(initial);
    expect(p.blame.authorFirst).toBe(false);
    expect(p.showAuthorAvatarColumn).toBe(true);
  });
});
