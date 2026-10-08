export type AppColorPalette = {
  level100: string;
  level200: string;
  level300: string;
  surfaceSubtle: string;
  accent: string;
  border: string;
  borderSubtle: string;
  input: string;
  inputBorder: string;
  positive: string;
  warning: string;
  negative: string;
  still: string;
  primaryText: string;
  secondaryText: string;
};

import { ocean } from "./presets";
function adapt(c: Record<string, string>): AppColorPalette {
  return {
    level100: c["color-level-100"]!,
    level200: c["color-level-200"]!,
    level300: c["color-level-300"]!,
    surfaceSubtle: c["color-surface-subtle"]!,
    accent: c["color-accent"]!,
    border: c["color-border"]!,
    borderSubtle: c["color-border-subtle"]!,
    input: c["color-input"]!,
    inputBorder: c["color-input-border"]!,
    positive: c["color-positive"]!,
    warning: c["color-warning"]!,
    negative: c["color-negative"]!,
    still: c["color-still"]!,
    primaryText: c["color-text"]!,
    secondaryText: c["color-text-secondary"]!,
  };
}
export const appColors = { light: adapt(ocean.light), dark: adapt(ocean.dark) };
