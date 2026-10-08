import { ocean, type Colors } from "./presets";
export const isHex = (value: unknown): value is string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
export function importTheme(value: unknown): {
  name: string;
  light: Colors;
  dark: Colors;
  unknown: string[];
} {
  if (!value || typeof value !== "object") throw new Error("invalidTheme");
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.name !== "string" || !data.name.trim())
    throw new Error("invalidTheme");
  const unknown = Object.keys(data).filter(
    (key) => !["version", "name", "light", "dark"].includes(key),
  );
  const read = (mode: "light" | "dark") => {
    const map = data[mode];
    if (!map || typeof map !== "object" || Array.isArray(map))
      throw new Error("invalidTheme");
    const colors: Colors = {};
    for (const [key, value] of Object.entries(map)) {
      if (!(key in ocean.light)) {
        unknown.push(`${mode}.${key}`);
        continue;
      }
      if (!isHex(value)) throw new Error("invalidTheme");
      colors[key] = value.toLowerCase();
    }
    return colors;
  };
  return { name: data.name, light: read("light"), dark: read("dark"), unknown };
}
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
