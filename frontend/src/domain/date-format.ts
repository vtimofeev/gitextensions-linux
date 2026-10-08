// Intl.DateTimeFormat construction is expensive (it dominated history scrolling),
// so formatters are created once per locale + options and reused.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function dateFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  const key = locale + JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}
