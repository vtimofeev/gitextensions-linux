import { expect, it } from "vitest";
import { buildRefMenu } from "../src/domain/ref-menu";
import type { RefTarget, TargetRef } from "../src/domain/models";
const target: RefTarget = {
  name: "Commit",
  hash: "tip",
  kind: "commit",
  current: false,
  parents: 1,
};
const main: TargetRef = { name: "main", kind: "local", current: true };
const feature: TargetRef = { name: "feature", kind: "local", current: false };
const remote: TargetRef = {
  name: "origin/topic",
  kind: "remote",
  current: false,
};
const tag: TargetRef = { name: "v1", kind: "tag", current: false };
it("hides ref actions without candidates and preserves commit action order", () => {
  expect(buildRefMenu(target).map((item) => item.action)).toEqual([
    "reset",
    "create",
    "create-tag",
    "checkout",
    "revert",
    "cherry-pick",
    "review",
  ]);
});
it("runs a single local checkout directly and keeps current checkout/delete disabled", () => {
  const menu = buildRefMenu({ ...target, refs: [feature] });
  expect(menu[0]).toMatchObject({
    name: "feature",
    immediate: true,
    target: { kind: "local" },
  });
  expect(menu[0]?.children).toBeUndefined();
  const current = buildRefMenu({ ...target, refs: [main] });
  expect(current[0]).toMatchObject({ name: "main", disabled: true });
  expect(current.find((item) => item.action === "delete")?.disabled).toBe(true);
  expect(
    current.some((item) => item.action === "merge" || item.action === "rebase"),
  ).toBe(false);
});
it("builds flyouts for multiple refs, filtering actions by kind and current branch", () => {
  const menu = buildRefMenu({ ...target, refs: [main, feature, remote, tag] });
  expect(menu.map((item) => item.action)).toEqual([
    "checkout",
    "merge",
    "rebase",
    "reset",
    "create",
    "create-tag",
    "rename",
    "delete",
    "delete-tag",
    "checkout",
    "revert",
    "cherry-pick",
    "review",
  ]);
  expect(
    menu[0]?.children?.map((item) => [
      item.name,
      item.disabled,
      item.immediate,
    ]),
  ).toEqual([
    ["main", true, true],
    ["feature", false, true],
    ["origin/topic", false, false],
  ]);
  expect(menu[1]?.children?.map((item) => item.target.name)).toEqual([
    "feature",
    "origin/topic",
    "v1",
  ]);
  expect(menu[6]?.children?.map((item) => item.target.name)).toEqual([
    "main",
    "feature",
  ]);
  expect(menu[7]?.children?.map((item) => [item.name, item.disabled])).toEqual([
    ["main", true],
    ["feature", false],
  ]);
});
it("uses the dialog path for a single remote and restricts tag pill actions", () => {
  expect(buildRefMenu({ ...target, refs: [remote] })[0]).toMatchObject({
    immediate: false,
    name: "origin/topic",
    target: { kind: "remote" },
  });
  expect(
    buildRefMenu({ ...target, ...tag }).map((item) => item.action),
  ).toEqual(["checkout", "merge", "rebase", "create", "delete-tag"]);
});
it("disables operations while busy or recovering and rebase while detached", () => {
  expect(
    buildRefMenu({ ...target, refs: [feature, remote] }, true).every(
      (item) =>
        item.disabled && (item.children ?? []).every((child) => child.disabled),
    ),
  ).toBe(true);
  expect(
    buildRefMenu({ ...target, refs: [feature] }, false, true).find(
      (item) => item.action === "rebase",
    )?.disabled,
  ).toBe(true);
});

it("hides tag deletion without tags, confirms one directly, and groups several", () => {
  expect(buildRefMenu(target).some((i) => i.action === "delete-tag")).toBe(
    false,
  );
  const single = buildRefMenu({ ...target, refs: [tag] }).find(
    (i) => i.action === "delete-tag",
  );
  expect(single).toMatchObject({
    name: "v1",
    target: { kind: "tag" },
    immediate: false,
  });
  expect(single?.children).toBeUndefined();
  const multiple = buildRefMenu({
    ...target,
    refs: [tag, { ...tag, name: "v2" }],
  }).find((i) => i.action === "delete-tag");
  expect(multiple?.children?.map((i) => i.target.name)).toEqual(["v1", "v2"]);
});
