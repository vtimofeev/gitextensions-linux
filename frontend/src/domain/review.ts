import type { Commit } from "./models";
export const reviewToolNames = ["codex", "claude", "qwen", "opencode"] as const;
export type ReviewToolName = (typeof reviewToolNames)[number];
export const reviewToolLabels: Record<ReviewToolName, string> = {
  codex: "Codex",
  claude: "Claude",
  qwen: "Qwen",
  opencode: "OpenCode",
};
export interface ReviewTemplate {
  command: string;
  executable: string;
}
export type ReviewTemplates = Record<ReviewToolName, ReviewTemplate>;
export interface ReviewOptions {
  tool: ReviewToolName;
  executable: string;
  template: string;
  terminal: string;
  commit: string;
  instructions: string;
  details: string;
  prompt: string;
}
export const defaultReviewPrompt =
  "You are a senior reviewer. Review the target change for correctness bugs, security issues, data loss risks, concurrency problems, and missing tests. Then note readability and simplification opportunities. Reference files and line numbers. Rank findings by severity and keep the summary short. Do not modify files unless asked.";
// Former default (one-shot `codex review`); stored copies migrate to the chat default.
export const legacyCodexTemplate = 'codex review -- "{prompt}"';
export function defaultReviewTemplates(): ReviewTemplates {
  return {
    codex: { command: 'codex -- "{prompt}"', executable: "" },
    claude: {
      command: 'claude "--append-system-prompt={instructions}" -- "{prompt}"',
      executable: "",
    },
    qwen: { command: 'qwen -i "{prompt}"', executable: "" },
    opencode: { command: 'opencode --prompt "{prompt}"', executable: "" },
  };
}
export function composeReviewPrompt(
  path: string,
  instructions: string,
  details: string,
  commit: Commit | null,
): string {
  const target = commit
    ? `Commit: ${commit.hash} — ${commit.subject}   (${commit.author}, ${commit.date})\nInspect it with: git show --stat --patch ${commit.hash}`
    : "Uncommitted changes\nInspect it with: git diff HEAD; git status";
  return `${instructions}\n\n## Target\nRepository: ${path}\n${target}\n\n## Task details\n${details.trim() ? details : "None provided"}`;
}
