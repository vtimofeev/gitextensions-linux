import type { GitApi } from "../api/git-api";
import type { Preferences } from "./preferences";
import type { Commit } from "../domain/models";
import {
  composeReviewPrompt,
  reviewToolLabels,
  type ReviewToolName,
} from "../domain/review";

// Run-only details belong to a repository/target, never to persistent settings.
export class Review {
  visible = false;
  path = "";
  commit: Commit | null = null;
  tool: ReviewToolName = "codex";
  instructions = "";
  details = "";
  saveDefault = false;
  busy = false;
  starting = false;
  error = "";
  private remembered = new Map<string, string>();
  constructor(
    private api: GitApi,
    private preferences: Preferences,
  ) {}
  get key() {
    return JSON.stringify([this.path, this.commit?.hash ?? "uncommitted"]);
  }
  get canStart() {
    return this.visible && !!this.path && !this.busy;
  }
  get toolLabel() {
    return reviewToolLabels[this.tool];
  }
  get prompt() {
    return composeReviewPrompt(
      this.path,
      this.instructions,
      this.details,
      this.commit,
    );
  }
  async open(path: string, commit: Commit | null) {
    if (this.starting) return;
    this.close();
    this.path = path;
    this.commit = commit ? { ...commit } : null;
    this.instructions = this.preferences.reviewPrompt;
    this.details = this.remembered.get(this.key) ?? "";
    this.saveDefault = false;
    this.tool = this.preferences.reviewTool;
    this.error = "";
    this.visible = true;
  }
  close() {
    if (this.starting) return;
    if (this.visible) this.remembered.set(this.key, this.details);
    this.visible = false;
    this.busy = false;
  }
  async start(): Promise<string | null> {
    if (!this.canStart) return null;
    this.busy = true;
    this.starting = true;
    this.error = "";
    try {
      const template = this.preferences.reviewTemplates[this.tool];
      const result = await this.api.startReview(this.path, {
        tool: this.tool,
        executable: template.executable,
        template: template.command,
        terminal: this.preferences.reviewTerminal,
        commit: this.commit?.hash ?? "",
        instructions: this.instructions,
        details: this.details,
        prompt: this.prompt,
      });
      this.preferences.setReviewTool(this.tool);
      if (this.saveDefault) this.preferences.setReviewPrompt(this.instructions);
      this.starting = false;
      this.close();
      return result;
    } catch (e) {
      this.error = String(e);
      return null;
    } finally {
      this.starting = false;
      this.busy = false;
    }
  }
}
