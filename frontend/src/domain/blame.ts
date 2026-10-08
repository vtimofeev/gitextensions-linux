import { dateFormatter } from "./date-format";
import type { BlameLine } from "./models";
export const blameDefaults = {
  showAuthor: true,
  showDate: true,
  showTime: true,
  authorFirst: false,
  lineNumbers: false,
  originalFilePath: true,
  avatar: true,
  ignoreWhitespace: true,
  detectCopiesInFile: false,
  detectCopiesInAllFiles: false,
};
export type BlameSettings = typeof blameDefaults;
/** Indexed once per data change; virtual windows still know the real block boundary. */
export function blameBlocks(lines: BlameLine[]) {
  let block = -1;
  return lines.map((line, index) => {
    const first = index === 0 || line.hash !== lines[index - 1]!.hash;
    if (first) block++;
    return { first, alternate: block % 2 === 1 };
  });
}
export function compactDate(
  value: string,
  locale: string,
  showDate = true,
  showTime = true,
) {
  if (!showDate && !showTime) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return dateFormatter(locale, {
    ...(showDate
      ? ({ day: "2-digit", month: "2-digit", year: "2-digit" } as const)
      : {}),
    ...(showTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(date);
}
export function blameGutterText(
  line: BlameLine,
  settings: BlameSettings,
  locale: string,
) {
  // Like Git Extensions, time supplements the date and disappears when date is hidden.
  const date = settings.showDate
    ? compactDate(line.date, locale, true, settings.showTime)
    : "";
  const author = settings.showAuthor ? line.author : "";
  return (settings.authorFirst ? [author, date] : [date, author])
    .filter(Boolean)
    .join(" - ");
}
