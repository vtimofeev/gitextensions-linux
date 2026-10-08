export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  enabled?: boolean;
  /** Hotkey-only commands are not listed in the palette. */
  hidden?: boolean;
  run: () => void | Promise<unknown>;
}
export function fuzzyMatch(label: string, query: string) {
  const text = label.toLocaleLowerCase(),
    search = query.trim().toLocaleLowerCase();
  if (!search || text.includes(search)) return true;
  const initials = text
    .split(/[\s…:/&→-]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
  return initials.includes(search.replace(/\s/g, ""));
}
export class CommandRegistry {
  constructor(readonly commands: Command[]) {}
  search(query: string) {
    return this.commands.filter(
      (command) =>
        command.enabled !== false &&
        !command.hidden &&
        fuzzyMatch(command.label, query),
    );
  }
  run(id: string) {
    const command = this.commands.find((command) => command.id === id);
    if (command && command.enabled !== false) return command.run();
  }
  handle(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey
    )
      return;
    const key = event.key.toLowerCase();
    const chord = `Ctrl+${event.shiftKey ? "Shift+" : ""}${key === "enter" ? "Enter" : key.length === 1 && /[a-z]/.test(key) ? key.toUpperCase() : key}`;
    const command = this.commands.find(
      (command) =>
        command.shortcut === chord ||
        (command.id === "font-increase" && ["=", "+"].includes(key)),
    );
    if (command && command.enabled !== false) {
      event.preventDefault();
      void command.run();
    }
  }
}
