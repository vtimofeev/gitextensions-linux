import { afterEach, expect, it, vi } from "vitest";
import { Preferences } from "../src/store/preferences";
import { Review } from "../src/store/review";
import {
  composeReviewPrompt,
  defaultReviewPrompt,
  type ReviewOptions,
  reviewToolNames,
} from "../src/domain/review";
import type { GitApi } from "../src/api/git-api";
import type { Commit } from "../src/domain/models";
const commit: Commit = {
  hash: "a".repeat(40),
  subject: "Fix a bug",
  authorEmail: "author@example.test",
  author: "Author",
  date: "2026-10-01",
  parents: [],
  refs: "",
};
function setup() {
  const startReview = vi.fn(
    async (_path: string, _opts: ReviewOptions) => "codex",
  );
  const api = { startReview } as unknown as GitApi;
  const preferences = new Preferences();
  return {
    review: new Review(api, preferences),
    preferences,
    startReview,
  };
}
afterEach(() => localStorage.clear());
it("composes the exact commit and uncommitted prompts without diff data", () => {
  expect(composeReviewPrompt("/repo", "Instructions", "Ticket", commit)).toBe(
    `Instructions\n\n## Target\nRepository: /repo\nCommit: ${commit.hash} — Fix a bug   (Author, 2026-10-01)\nInspect it with: git show --stat --patch ${commit.hash}\n\n## Task details\nTicket`,
  );
  expect(composeReviewPrompt("/repo", "Instructions", "", null)).toBe(
    "Instructions\n\n## Target\nRepository: /repo\nUncommitted changes\nInspect it with: git diff HEAD; git status\n\n## Task details\nNone provided",
  );
});
it("prefills from settings, remembers the last tool and saves defaults only when checked", async () => {
  localStorage.setItem("gitextensions.review.tool", "claude");
  localStorage.setItem("gitextensions.review.prompt", "Saved prompt");
  const { review, preferences, startReview } = setup();
  await review.open("/repo", commit);
  expect(review.tool).toBe("claude");
  expect(review.instructions).toBe("Saved prompt");
  expect(review.details).toBe("");
  review.instructions = "Run only";
  review.details = "ticket";
  await review.start();
  expect(preferences.reviewPrompt).toBe("Saved prompt");
  expect(startReview).toHaveBeenCalledWith(
    "/repo",
    expect.objectContaining({
      tool: "claude",
      prompt: expect.stringContaining(commit.hash),
      details: "ticket",
      instructions: "Run only",
    }),
  );
  await review.open("/repo", commit);
  expect(review.instructions).toBe("Saved prompt");
  expect(review.details).toBe("ticket");
  review.tool = "codex";
  review.instructions = "New default";
  review.saveDefault = true;
  await review.start();
  expect(new Preferences().reviewPrompt).toBe("New default");
  expect(new Preferences().reviewTool).toBe("codex");
});
it("keeps details only per repository and target during this session", async () => {
  const { review, preferences } = setup();
  await review.open("/repo", commit);
  review.details = "first";
  review.close();
  await review.open("/other", commit);
  expect(review.details).toBe("");
  review.details = "other";
  review.close();
  await review.open("/repo", null);
  expect(review.details).toBe("");
  review.details = "working";
  review.close();
  await review.open("/repo", commit);
  expect(review.details).toBe("first");
  review.close();
  await review.open("/repo", null);
  expect(review.details).toBe("working");
  expect(new Preferences().reviewPrompt).toBe(defaultReviewPrompt);
  const next = new Review({} as GitApi, preferences);
  await next.open("/repo", null);
  expect(next.details).toBe("");
});
it.each(reviewToolNames)(
  "starts %s without an availability check and forwards custom commands",
  async (tool) => {
    const { review, preferences, startReview } = setup();
    preferences.reviewTool = tool;
    preferences.reviewTemplates[tool].executable = `/custom/${tool}`;
    await review.open("/repo", null);
    expect(review.tool).toBe(tool);
    expect(review.canStart).toBe(true);
    await review.start();
    expect(startReview).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({ tool, executable: `/custom/${tool}` }),
    );
  },
);
it("keeps the selected tool and launch errors available for retry", async () => {
  const { review, preferences, startReview } = setup();
  preferences.reviewTool = "qwen";
  await review.open("/repo", null);
  startReview.mockRejectedValueOnce(new Error("no terminal"));
  await review.start();
  expect(review.tool).toBe("qwen");
  expect(review.visible).toBe(true);
  expect(review.error).toContain("no terminal");
  expect(review.busy).toBe(false);
  expect(review.canStart).toBe(true);
});
it("round trips settings and restores cancelled edits", () => {
  const preferences = new Preferences();
  const original = preferences.capture();
  preferences.deferSave = true;
  preferences.reviewPrompt = "edited";
  preferences.reviewTemplates.codex.executable = "/custom/codex";
  preferences.reviewTerminal = "kitty {command}";
  preferences.restore(original);
  expect(preferences.reviewPrompt).toBe(defaultReviewPrompt);
  expect(preferences.reviewTemplates.codex.executable).toBe("");
  expect(preferences.reviewTerminal).toBe("auto");
  preferences.deferSave = false;
  preferences.reviewPrompt = "saved";
  preferences.reviewTemplates.codex.command = 'codex review "{prompt}"';
  preferences.reviewTerminal = "kitty {command}";
  preferences.save();
  const next = new Preferences();
  expect(next.reviewPrompt).toBe("saved");
  expect(next.reviewTemplates).toEqual(preferences.reviewTemplates);
  expect(next.reviewTerminal).toBe("kitty {command}");
});
it("migrates the former one-shot codex default to the chat template", () => {
  localStorage.setItem(
    "gitextensions.review.templates",
    JSON.stringify({
      codex: {
        command: 'codex review -- "{prompt}"',
        executable: "/opt/codex",
      },
      claude: { command: 'claude "{prompt}"', executable: "" },
    }),
  );
  const preferences = new Preferences();
  expect(preferences.reviewTemplates.codex).toEqual({
    command: 'codex -- "{prompt}"',
    executable: "/opt/codex",
  });
  expect(preferences.reviewTemplates.claude.command).toBe('claude "{prompt}"');
  localStorage.removeItem("gitextensions.review.templates");
});
it("blocks duplicate starts and closing while the terminal launch is pending", async () => {
  const { review, startReview } = setup();
  let resolve!: (result: string) => void;
  startReview.mockImplementationOnce(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  await review.open("/repo", commit);
  const first = review.start();
  expect(review.canStart).toBe(false);
  expect(await review.start()).toBeNull();
  await review.open("/other", null);
  review.close();
  expect(review.path).toBe("/repo");
  expect(review.visible).toBe(true);
  resolve("codex");
  await first;
  expect(startReview).toHaveBeenCalledTimes(1);
  expect(review.visible).toBe(false);
  expect(review.busy).toBe(false);
});
