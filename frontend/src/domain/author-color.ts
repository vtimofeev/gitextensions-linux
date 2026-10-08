/** FNV-1a with an avalanche step, so similar email addresses spread across hues. */
export function authorSlot(identity: string): number {
  let hash = 2166136261;
  for (const char of identity.trim().toLowerCase()) {
    hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return ((hash >>> 0) % 12) + 1;
}
export function authorColor(identity: string): string {
  return `var(--author-${authorSlot(identity)})`;
}
/** Match Git Extensions' initials provider, including single names and camel case. */
export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const valid = parts.filter((part) => /^[\p{L}\p{N}]/u.test(part));
  const first = Array.from((valid[0] || parts[0])!);
  if (!valid.length)
    return first[0]! + (parts.length > 1 ? Array.from(parts[1]!)[0]! : "");
  if (valid.length > 1)
    return (
      first[0]! + Array.from(valid[valid.length - 1]!)[0]!
    ).toLocaleUpperCase();
  if (first.length === 1) return first[0]!.toLocaleUpperCase();
  if (/^\p{Lu}$/u.test(first[1]!))
    return first[0]!.toLocaleUpperCase() + first[1];
  const separated = valid[0]!.split(/[._-]/);
  if (separated.length > 1) return authorInitials(separated.join(" "));
  const capitals = first.filter((char) => /^\p{Lu}$/u.test(char));
  if (capitals.length > 1) return capitals[0]! + capitals[capitals.length - 1]!;
  return first[0]!.toLocaleUpperCase() + first[1];
}
