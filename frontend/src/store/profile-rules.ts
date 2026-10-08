// Deliberately small path-glob grammar: ** crosses directories, * and ? do not.
export function pathMatches(pattern: string, path: string, home: string) {
  if (pattern === "~" || pattern.startsWith("~/"))
    pattern = home + pattern.slice(1);
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*" && pattern[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(path);
}
