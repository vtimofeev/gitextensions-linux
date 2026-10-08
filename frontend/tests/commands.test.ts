import { describe, it, expect, vi } from "vitest";
import { CommandRegistry, fuzzyMatch } from "../src/commands/registry";
describe("command registry", () => {
  it("searches substrings and initials in English and Russian", () => {
    expect(fuzzyMatch("Switch identity profile", "sip")).toBe(true);
    expect(fuzzyMatch("Switch repository…", "repository")).toBe(true);
    expect(fuzzyMatch("Выбрать профиль автора", "впа")).toBe(true);
    expect(fuzzyMatch("Fetch all", "push")).toBe(false);
  });
  it("hides disabled commands and never runs them from hotkeys", () => {
    const run = vi.fn();
    const registry = new CommandRegistry([
      {
        id: "branch",
        label: "Switch branch",
        shortcut: "Ctrl+B",
        enabled: false,
        run,
      },
    ]);
    expect(registry.search("")).toEqual([]);
    registry.handle(
      new KeyboardEvent("keydown", {
        ctrlKey: true,
        key: "b",
        cancelable: true,
      }),
    );
    registry.run("branch");
    expect(run).not.toHaveBeenCalled();
  });
  it("dispatches modifiers and prevents duplicate handled textarea shortcuts", () => {
    const run = vi.fn();
    const registry = new CommandRegistry([
      {
        id: "commit",
        label: "Commit & push",
        shortcut: "Ctrl+Shift+Enter",
        run,
      },
    ]);
    const event = new KeyboardEvent("keydown", {
      ctrlKey: true,
      shiftKey: true,
      key: "Enter",
      cancelable: true,
    });
    registry.handle(event);
    registry.handle(event);
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
  it("accepts plus/equal across keyboards for font increase", () => {
    const run = vi.fn();
    const registry = new CommandRegistry([
      { id: "font-increase", label: "Increase", shortcut: "Ctrl+=", run },
    ]);
    registry.handle(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "+", shiftKey: true }),
    );
    expect(run).toHaveBeenCalledOnce();
  });
});
