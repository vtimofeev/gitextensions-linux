import { blameDefaults, type BlameSettings } from "../domain/blame";
import {
  defaultReviewPrompt,
  defaultReviewTemplates,
  legacyCodexTemplate,
  reviewToolNames,
  type ReviewToolName,
  type ReviewTemplates,
} from "../domain/review";
import { importTheme, isHex } from "../theme/theme-format";
import { ThemeService } from "../theme/theme-service";
import {
  presets,
  type ThemeMode,
  type PresetName,
  type CustomTheme,
} from "../theme/presets";
export function readJSON<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export interface IdentityProfile {
  id: string;
  label: string;
  name: string;
  email: string;
  color: string;
}
export interface IdentityRule {
  pattern: string;
  profileId: string;
}
export const DEFAULT_UI_FONT =
  '"Ubuntu", system-ui, "Segoe UI", "Droid Sans", sans-serif';
export const DEFAULT_CODE_FONT =
  "'JetBrains Mono NL', Menlo, Monaco, 'Courier New', monospace";
export function boundedSize(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}
export type Locale = "en" | "ru";
export class Preferences {
  deferSave = false;
  syntaxEnabled =
    localStorage.getItem("gitextensions.syntax.enabled") !== "false";
  foldingEnabled =
    localStorage.getItem("gitextensions.folding.enabled") !== "false";
  showAuthorAvatarColumn =
    localStorage.getItem("gitextensions.history.showAuthorAvatarColumn") !==
    "false";
  highlightMyCommits =
    localStorage.getItem("gitextensions.history.highlightMyCommits") !==
    "false";
  blame: BlameSettings = Object.fromEntries(
    Object.entries(blameDefaults).map(([key, fallback]) => [
      key,
      readJSON(`gitextensions.blame.${key}`, fallback),
    ]),
  ) as BlameSettings;
  reviewPrompt =
    localStorage.getItem("gitextensions.review.prompt") ?? defaultReviewPrompt;
  reviewTemplates: ReviewTemplates = defaultReviewTemplates();
  reviewTerminal =
    localStorage.getItem("gitextensions.review.terminal") || "auto";
  reviewTool: ReviewToolName = "codex";
  setReviewTool(tool: ReviewToolName) {
    this.reviewTool = tool;
    localStorage.setItem("gitextensions.review.tool", tool);
  }
  setReviewPrompt(prompt: string) {
    this.reviewPrompt = prompt;
    if (!this.deferSave)
      localStorage.setItem("gitextensions.review.prompt", prompt);
  }
  profiles: IdentityProfile[] = readJSON("gitextensions.identity.profiles", []);
  repoProfiles: Record<string, string> = readJSON(
    "gitextensions.identity.repoProfiles",
    {},
  );
  rememberProfile(path: string, profileId?: string) {
    if (!path) return;
    if (profileId) this.repoProfiles[path] = profileId;
    else delete this.repoProfiles[path];
    localStorage.setItem(
      "gitextensions.identity.repoProfiles",
      JSON.stringify(this.repoProfiles),
    );
  }
  repositoriesForProfile(id: string) {
    return Object.keys(this.repoProfiles)
      .filter((path) => this.repoProfiles[path] === id)
      .sort();
  }
  rules: IdentityRule[] = readJSON("gitextensions.identity.rules", []);
  pullMode = localStorage.getItem("gitextensions.sync.pullMode") || "merge";
  fetchPrune = localStorage.getItem("gitextensions.sync.fetchPrune") === "true";
  confirmForcePush =
    localStorage.getItem("gitextensions.sync.confirmForcePush") !== "false";
  setMode(mode: ThemeMode) {
    this.mode = mode;
    if (!this.deferSave) localStorage.setItem("gitextensions.theme", mode);
    this.applyTheme();
  }
  persistSync() {
    if (this.deferSave) return;
    localStorage.setItem("gitextensions.sync.pullMode", this.pullMode);
    localStorage.setItem(
      "gitextensions.sync.fetchPrune",
      String(this.fetchPrune),
    );
  }
  recentRepoLimit = boundedSize(
    localStorage.getItem("gitextensions.recent.limit"),
    5,
    200,
    50,
  );
  historyPageSize = boundedSize(
    localStorage.getItem("gitextensions.history.pageSize"),
    100,
    500,
    200,
  );
  refreshOnFocus =
    localStorage.getItem("gitextensions.refreshOnFocus") !== "false";
  uiFont = localStorage.getItem("gitextensions.font.ui") || DEFAULT_UI_FONT;
  codeFont =
    localStorage.getItem("gitextensions.font.code") || DEFAULT_CODE_FONT;
  fontSize = boundedSize(
    localStorage.getItem("gitextensions.font.size"),
    10,
    20,
    13,
  );
  codeSize = localStorage.getItem("gitextensions.font.codeSize") || "";
  setFontSize(size: number) {
    this.fontSize = Math.max(10, Math.min(20, Math.round(size)));
    this.applyTheme();
    if (!this.deferSave)
      localStorage.setItem("gitextensions.font.size", String(this.fontSize));
  }
  resetFonts() {
    this.uiFont = DEFAULT_UI_FONT;
    this.codeFont = DEFAULT_CODE_FONT;
    this.fontSize = 13;
    this.codeSize = "";
    this.applyTheme();
  }
  capture() {
    return JSON.stringify({
      syntaxEnabled: this.syntaxEnabled,
      foldingEnabled: this.foldingEnabled,
      blame: { ...this.blame },
      showAuthorAvatarColumn: this.showAuthorAvatarColumn,
      highlightMyCommits: this.highlightMyCommits,
      locale: this.locale,
      mode: this.mode,
      preset: this.preset,
      custom: this.custom,
      profiles: this.profiles,
      rules: this.rules,
      pullMode: this.pullMode,
      fetchPrune: this.fetchPrune,
      confirmForcePush: this.confirmForcePush,
      historyPageSize: this.historyPageSize,
      recentRepoLimit: this.recentRepoLimit,
      refreshOnFocus: this.refreshOnFocus,
      uiFont: this.uiFont,
      codeFont: this.codeFont,
      fontSize: this.fontSize,
      codeSize: this.codeSize,
      reviewPrompt: this.reviewPrompt,
      reviewTemplates: this.reviewTemplates,
      reviewTerminal: this.reviewTerminal,
    });
  }
  restore(state: string) {
    Object.assign(this, JSON.parse(state));
    this.applyTheme();
  }
  save() {
    for (const [path, id] of Object.entries(this.repoProfiles))
      if (!this.profiles.some((p) => p.id === id)) this.rememberProfile(path);
    this.fontSize = boundedSize(this.fontSize, 10, 20, 13);
    if (this.codeSize)
      this.codeSize = String(boundedSize(this.codeSize, 10, 24, this.fontSize));
    this.recentRepoLimit = boundedSize(this.recentRepoLimit, 5, 200, 50);
    for (const [key, value] of Object.entries(this.blame))
      localStorage.setItem(`gitextensions.blame.${key}`, String(value));
    const values: Record<string, string> = {
      "syntax.enabled": String(this.syntaxEnabled),
      "folding.enabled": String(this.foldingEnabled),
      "history.showAuthorAvatarColumn": String(this.showAuthorAvatarColumn),
      "history.highlightMyCommits": String(this.highlightMyCommits),
      "review.prompt": this.reviewPrompt,
      "review.templates": JSON.stringify(this.reviewTemplates),
      "review.terminal": this.reviewTerminal,
      locale: this.locale,
      theme: this.mode,
      "theme.preset": this.preset,
      "theme.custom": JSON.stringify(this.custom),
      "identity.profiles": JSON.stringify(this.profiles),
      "identity.rules": JSON.stringify(this.rules),
      "sync.confirmForcePush": String(this.confirmForcePush),
      "history.pageSize": String(this.historyPageSize),
      "recent.limit": String(this.recentRepoLimit),
      refreshOnFocus: String(this.refreshOnFocus),
      "font.ui": this.uiFont,
      "font.code": this.codeFont,
      "font.size": String(this.fontSize),
      "font.codeSize": this.codeSize,
    };
    for (const [key, value] of Object.entries(values))
      localStorage.setItem("gitextensions." + key, value);
    this.persistSync();
    this.applyTheme();
  }
  mergeTool = localStorage.getItem("gitextensions.mergeTool") ?? "";
  setMergeTool(name: string) {
    this.mergeTool = name;
    localStorage.setItem("gitextensions.mergeTool", name);
  }
  locale: Locale =
    localStorage.getItem("gitextensions.locale") === "ru" ? "ru" : "en";
  mode: ThemeMode =
    (localStorage.getItem("gitextensions.theme") as ThemeMode) || "system";
  preset: PresetName | "custom" =
    (localStorage.getItem("gitextensions.theme.preset") as PresetName) ||
    "ocean";
  custom: CustomTheme = readJSON("gitextensions.theme.custom", {
    base: "ocean",
    light: {},
    dark: {},
  });
  constructor() {
    const savedTemplates = readJSON<Partial<ReviewTemplates>>(
      "gitextensions.review.templates",
      {},
    );
    const savedTool = localStorage.getItem("gitextensions.review.tool");
    for (const name of reviewToolNames) {
      const value = savedTemplates?.[name];
      if (
        value &&
        typeof value.command === "string" &&
        typeof value.executable === "string"
      )
        this.reviewTemplates[name] = {
          // The old one-shot codex default becomes the interactive chat default.
          command:
            name === "codex" && value.command === legacyCodexTemplate
              ? this.reviewTemplates.codex.command
              : value.command,
          executable: value.executable,
        };
      if (name === savedTool) this.reviewTool = name;
    }
    if (!["light", "dark", "system"].includes(this.mode)) this.mode = "system";
    if (this.preset !== "custom" && !(this.preset in presets))
      this.preset = "ocean";
    try {
      if (!this.custom || !(this.custom.base in presets)) throw new Error();
      const imported = importTheme({
        version: 1,
        name: this.custom.name || "Stored",
        light: this.custom.light,
        dark: this.custom.dark,
      });
      this.custom = {
        ...this.custom,
        light: imported.light,
        dark: imported.dark,
      };
    } catch {
      this.custom = { base: "ocean", light: {}, dark: {} };
    }
    if (![100, 200, 500].includes(this.historyPageSize))
      this.historyPageSize = 200;
    if (!["merge", "rebase", "ff-only"].includes(this.pullMode))
      this.pullMode = "merge";
    this.profiles = Array.isArray(this.profiles)
      ? this.profiles.filter(
          (p) =>
            p &&
            [p.id, p.label, p.name, p.email].every(
              (v) => typeof v === "string",
            ) &&
            isHex(p.color),
        )
      : [];
    this.repoProfiles =
      this.repoProfiles &&
      typeof this.repoProfiles === "object" &&
      !Array.isArray(this.repoProfiles)
        ? Object.fromEntries(
            Object.entries(this.repoProfiles).filter(
              ([, id]) => typeof id === "string",
            ),
          )
        : {};
    this.rules = Array.isArray(this.rules)
      ? this.rules.filter(
          (r) =>
            r &&
            typeof r.pattern === "string" &&
            typeof r.profileId === "string",
        )
      : [];
  }
  dark = false;
  themeRevision = 0;
  readonly themeService = new ThemeService();

  applyTheme() {
    this.dark = this.themeService.apply(this.mode, this.preset, this.custom);
    const style = document.documentElement.style;
    this.fontSize = boundedSize(this.fontSize, 10, 20, 13);
    style.setProperty("--font-size-base", `${this.fontSize}px`);
    style.setProperty(
      "--history-row-height",
      `${Math.round((this.fontSize * 32) / 13)}px`,
    );
    style.setProperty(
      "--font-size-code",
      `${this.codeSize ? boundedSize(this.codeSize, 10, 24, this.fontSize) : this.fontSize}px`,
    );
    style.setProperty("--font-sans", this.uiFont || DEFAULT_UI_FONT);
    style.setProperty("--font-code", this.codeFont || DEFAULT_CODE_FONT);
    document.documentElement.lang = this.locale;
    this.themeRevision++;
  }
  toggleTheme() {
    this.mode = this.dark ? "light" : "dark";
    if (!this.deferSave) localStorage.setItem("gitextensions.theme", this.mode);
    this.applyTheme();
  }
  toggleLocale() {
    this.locale = this.locale === "en" ? "ru" : "en";
    if (!this.deferSave)
      localStorage.setItem("gitextensions.locale", this.locale);
    this.applyTheme();
  }
}
