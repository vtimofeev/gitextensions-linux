import type { RefAction, RefTarget } from "./models";
import type { MessageKey } from "../i18n/en";

export const refActionLabels: Record<RefAction, MessageKey> = {
  checkout: "checkout",
  merge: "merge",
  rebase: "rebase",
  "cherry-pick": "cherryPick",
  revert: "revertCommit",
  create: "create",
  "create-tag": "createTagHere",
  "delete-tag": "deleteTag",
  rename: "renameBranch",
  delete: "delete",
  continue: "continueOperation",
  skip: "skipOperation",
  abort: "abortOperation",
};
export interface RefMenuItem {
  action: RefAction | "reset" | "review";
  label: MessageKey;
  name?: string;
  target: RefTarget;
  disabled: boolean;
  immediate: boolean;
  separator?: boolean;
  children?: RefMenuItem[];
}

export function buildRefMenu(
  target: RefTarget,
  blocked = false,
  detached = false,
): RefMenuItem[] {
  const item = (
    action: RefMenuItem["action"],
    ref = target,
    label: MessageKey = action === "review"
      ? "reviewCommit"
      : action === "reset"
        ? "resetBranch"
        : refActionLabels[action],
  ): RefMenuItem => ({
    action,
    label,
    target: ref,
    disabled:
      blocked ||
      (ref.current &&
        ["checkout", "merge", "rebase", "delete"].includes(action)) ||
      (detached && action === "rebase"),
    immediate: action === "checkout" && ref.kind === "local",
  });
  if (target.kind !== "commit") {
    const actions: RefMenuItem["action"][] =
      target.kind === "tag"
        ? ["checkout", "merge", "rebase", "create", "delete-tag"]
        : ["checkout", "merge", "rebase", "cherry-pick", "revert", "create"];
    if (target.kind === "local") actions.push("rename", "delete");
    if (target.kind !== "tag") actions.push("reset");
    return actions.map((action) => item(action));
  }
  const refs: RefTarget[] = (target.refs ?? []).map((ref) => ({
    ...ref,
    hash: target.hash,
    parents: target.parents,
  }));
  const group = (
    action: RefAction,
    label: MessageKey,
    candidates: RefTarget[],
  ): RefMenuItem[] => {
    if (!candidates.length) return [];
    const children = candidates.map((ref) => ({
      ...item(action, ref, label),
      name: ref.name,
    }));
    if (children.length === 1) return children;
    return [{ ...item(action, target, label), children }];
  };
  const locals = refs.filter((ref) => ref.kind === "local");
  const applicable = refs.filter((ref) => !ref.current);
  const create = item("create", target, "createBranchHere");
  create.separator = true;
  const checkout = item("checkout", target, "checkoutCommit");
  checkout.separator = true;
  return [
    ...group(
      "checkout",
      "checkoutBranch",
      refs.filter((ref) => ref.kind !== "tag"),
    ),
    ...group("merge", "mergeIntoCurrent", applicable),
    ...group("rebase", "rebaseCurrentOn", applicable),
    item("reset", target, "resetBranchHere"),
    create,
    item("create-tag"),
    ...group("rename", "renameBranch", locals),
    ...group("delete", "delete", locals),
    ...group(
      "delete-tag",
      "deleteTag",
      refs.filter((ref) => ref.kind === "tag"),
    ),
    checkout,
    item("revert"),
    item("cherry-pick"),
    { ...item("review"), separator: true },
  ];
}
