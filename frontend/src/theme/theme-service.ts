import { palette, updatePrimaryPalette, updatePreset } from "@primevue/themes";
import {
  presets,
  type Colors,
  type CustomTheme,
  type PresetName,
  type ThemeMode,
} from "./presets";
export class ThemeService {
  // Bumped on every apply so derived per-theme caches can invalidate cheaply.
  version = 0;
  colors(
    preset: PresetName | "custom",
    custom: CustomTheme,
    dark: boolean,
  ): Colors {
    const mode = dark ? "dark" : "light";
    return {
      ...presets[preset === "custom" ? custom.base : preset][mode],
      ...(preset === "custom" ? custom[mode] : {}),
    };
  }
  apply(mode: ThemeMode, preset: PresetName | "custom", custom: CustomTheme) {
    this.version++;
    const dark =
      mode === "dark" ||
      (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const root = document.documentElement;
    // Suppress component color transitions so a theme switch repaints at once.
    root.classList.add("theme-switching");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove("theme-switching")),
    );
    root.classList.toggle("app-theme-dark", dark);
    const colors = this.colors(preset, custom, dark);
    for (const [key, value] of Object.entries(colors))
      document.documentElement.style.setProperty(`--${key}`, value);
    updatePrimaryPalette(palette(colors["color-accent"]!));
    const scheme = (dark: boolean) => {
      const c = this.colors(preset, custom, dark);
      const surface = dark
        ? {
            0: c["color-text"],
            50: c["color-text-secondary"],
            100: c["color-text-secondary"],
            200: c["color-still"],
            300: c["color-still"],
            400: c["color-still"],
            500: c["color-input-border"],
            600: c["color-border"],
            700: c["color-level-300"],
            800: c["color-level-200"],
            900: c["color-level-100"],
            950: c["color-level-100"],
          }
        : {
            0: c["color-level-200"],
            50: c["color-level-100"],
            100: c["color-level-100"],
            200: c["color-border"],
            300: c["color-input-border"],
            400: c["color-input-border"],
            500: c["color-still"],
            600: c["color-text-secondary"],
            700: c["color-text-secondary"],
            800: c["color-text"],
            900: c["color-text"],
            950: c["color-text"],
          };
      return {
        surface,
        primary: {
          color: c["color-accent"],
          contrastColor: c[dark ? "color-level-100" : "color-level-200"],
        },
        content: {
          background: c["color-level-200"],
          borderColor: c["color-border"],
          color: c["color-text"],
        },
        formField: {
          background: c["color-input"],
          borderColor: c["color-input-border"],
          color: c["color-text"],
          placeholderColor: c["color-text-secondary"],
        },
      };
    };
    updatePreset({
      semantic: { colorScheme: { light: scheme(false), dark: scheme(true) } },
    });
    return dark;
  }
}
