export function navigateMenu(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const controls = Array.from(
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
      "button:not(:disabled), input, select",
    ),
  );
  if (!controls.length) return;
  event.preventDefault();
  const index = controls.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? controls.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) %
          controls.length;
  controls[next]?.focus();
}
