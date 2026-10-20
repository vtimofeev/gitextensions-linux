import type { Branch, Commit, Snapshot } from "../domain/models";
export interface RefLabel {
  name: string;
  kind: "local" | "remote" | "tag" | "head" | "other";
  current: boolean;
  remotes?: string[];
}

// Ref colors follow Git Extensions' GetHeadColor; current means the checked-out branch.
export class RefLabels {
  private readonly branches = new Map<string, Branch[]>();
  constructor(private readonly snapshot: Snapshot | null) {
    for (const branch of snapshot?.branches ?? []) {
      const group = this.branches.get(branch.hash) ?? [];
      group.push(branch);
      this.branches.set(branch.hash, group);
    }
  }
  forCommit(commit: Commit): RefLabel[] {
    const branches = this.branches.get(commit.hash) ?? [];
    const labels: RefLabel[] = branches.map((branch) => ({
      name: branch.name,
      kind: branch.remote ? "remote" : "local",
      current: !this.snapshot?.detached && !branch.remote && branch.current,
    }));
    // Consume known names before splitting decorations: Git branch names can contain commas.
    const known = branches
      .flatMap((branch) => [
        branch.name,
        `${branch.remote ? "refs/remotes/" : "refs/heads/"}${branch.name}`,
        `HEAD -> ${branch.name}`,
      ])
      .sort((a, b) => b.length - a.length);
    let remaining = commit.refs;
    while (remaining) {
      const match = known.find(
        (name) => remaining === name || remaining.startsWith(name + ", "),
      );
      if (match) {
        remaining = remaining.slice(match.length).replace(/^, /, "");
        continue;
      }
      const boundary = remaining.indexOf(", ");
      const name = boundary < 0 ? remaining : remaining.slice(0, boundary);
      remaining = boundary < 0 ? "" : remaining.slice(boundary + 2);
      if (name.startsWith("HEAD -> ")) {
        const branch = name.slice(8);
        labels.push({
          name: branch,
          kind: "local",
          current: !this.snapshot?.detached && branch === this.snapshot?.branch,
        });
      } else if (name.startsWith("tag: "))
        labels.push({ name: name.slice(5), kind: "tag", current: false });
      else if (name === "HEAD")
        labels.push({ name, kind: "head", current: false });
      else if (name) labels.push({ name, kind: "other", current: false });
    }
    // A tracking ref shares a badge only while both tips point at this commit.
    const combined = new Map<RefLabel, string[]>();
    const consumed = new Set<RefLabel>();
    const locals = new Map(
      branches
        .filter((branch) => !branch.remote)
        .map((branch) => [branch.name, branch]),
    );
    const remotes = new Map(
      labels
        .filter((label) => label.kind === "remote")
        .map((label) => [label.name, label]),
    );
    for (const local of labels.filter((label) => label.kind === "local")) {
      const upstream =
        locals.get(local.name)?.upstream || `origin/${local.name}`;
      const remote = remotes.get(upstream);
      if (remote && !consumed.has(remote)) {
        combined.set(local, [remote.name]);
        consumed.add(remote);
      }
    }
    return labels
      .filter((label) => !consumed.has(label))
      .map((label) =>
        combined.has(label)
          ? { ...label, remotes: combined.get(label)! }
          : label,
      )
      .sort((a, b) => Number(b.current) - Number(a.current));
  }
}
