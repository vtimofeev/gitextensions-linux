import { expect, it } from "vitest";
import { RefLabels } from "../src/graph/ref-labels";
import type { Snapshot, Commit } from "../src/domain/models";
const commit: Commit = {
  hash: "tip",
  parents: [],
  authorEmail: "author@example.test",
  author: "",
  date: "",
  subject: "Commit",
  refs: "HEAD -> main, feature, origin/main, tag: v1",
};
const snapshot: Snapshot = {
  path: "/repo",
  branch: "main",
  detached: false,
  operation: "",
  files: [],
  remotes: [],
  commits: [commit],
  branches: [
    {
      name: "main",
      hash: "tip",
      current: true,
      remote: false,
      upstream: "",
      tracking: "",
    },
    {
      name: "feature",
      hash: "tip",
      current: false,
      remote: false,
      upstream: "",
      tracking: "",
    },
    {
      name: "origin/main",
      hash: "tip",
      current: false,
      remote: true,
      upstream: "",
      tracking: "",
    },
  ],
};
it("classifies refs independently and emphasizes only the checked-out local branch", () => {
  expect(new RefLabels(snapshot).forCommit(commit)).toEqual([
    { name: "main", kind: "local", current: true, remotes: ["origin/main"] },
    { name: "feature", kind: "local", current: false },
    { name: "v1", kind: "tag", current: false },
  ]);
  const detached = new RefLabels({ ...snapshot, detached: true }).forCommit({
    ...commit,
    refs: "HEAD, main, feature, origin/main, tag: v1",
  });
  expect(detached.every((label) => !label.current)).toBe(true);
  expect(detached).toContainEqual({
    name: "HEAD",
    kind: "head",
    current: false,
  });
});
it("preserves branch names containing comma delimiters", () => {
  const branch = { ...snapshot.branches[0]!, name: "feature, next" };
  const labels = new RefLabels({
    ...snapshot,
    branch: branch.name,
    branches: [branch],
  }).forCommit({ ...commit, refs: "HEAD -> feature, next, tag: v1" });
  expect(labels).toEqual([
    { name: "feature, next", kind: "local", current: true },
    { name: "v1", kind: "tag", current: false },
  ]);
});

it("keeps diverged tips and unrelated refs separate", () => {
  const diverged = {
    ...snapshot,
    branches: snapshot.branches.map((branch) =>
      branch.remote ? { ...branch, hash: "different" } : branch,
    ),
  };
  const labels = new RefLabels(diverged);
  expect(labels.forCommit({ ...commit, refs: "HEAD -> main" })).toContainEqual({
    name: "main",
    kind: "local",
    current: true,
  });
  expect(
    labels.forCommit({ ...commit, hash: "different", refs: "origin/main" }),
  ).toEqual([{ name: "origin/main", kind: "remote", current: false }]);
  const unrelated = {
    ...snapshot,
    branches: snapshot.branches.map((branch) =>
      branch.remote ? { ...branch, name: "origin/other" } : branch,
    ),
  };
  expect(
    new RefLabels(unrelated)
      .forCommit({ ...commit, refs: "HEAD -> main, origin/other" })
      .filter((label) => label.kind === "remote"),
  ).toHaveLength(1);
});
it("groups the configured upstream even when branch names differ", () => {
  const state = {
    ...snapshot,
    branches: snapshot.branches.map((branch) =>
      branch.name === "main"
        ? { ...branch, upstream: "upstream/release" }
        : branch.remote
          ? { ...branch, name: "upstream/release" }
          : branch,
    ),
  };
  expect(
    new RefLabels(state).forCommit({
      ...commit,
      refs: "HEAD -> main, upstream/release",
    })[0],
  ).toEqual({
    name: "main",
    kind: "local",
    current: true,
    remotes: ["upstream/release"],
  });
});
