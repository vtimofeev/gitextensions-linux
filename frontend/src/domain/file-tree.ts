export interface FileTreeNode {
  path: string;
  name: string;
  directory: boolean;
  children: FileTreeNode[];
}
export interface FileTreeRow extends FileTreeNode {
  depth: number;
}

// Git paths use '/' even when a filename contains a literal backslash.
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root = new Map<string, FileTreeNode>();
  const directories = new Map<FileTreeNode, Map<string, FileTreeNode>>();
  for (const path of paths) {
    const parts = path.split("/");
    let siblings = root;
    for (let i = 0; i < parts.length; i++) {
      const directory = i < parts.length - 1;
      const key = `${directory ? "dir" : "file"}:${parts[i]}`;
      let node = siblings.get(key);
      if (!node) {
        node = {
          path: parts.slice(0, i + 1).join("/"),
          name: parts[i]!,
          directory,
          children: [],
        };
        siblings.set(key, node);
        if (directory) directories.set(node, new Map());
      }
      if (directory) siblings = directories.get(node)!;
    }
  }
  const sort = (siblings: Map<string, FileTreeNode>): FileTreeNode[] =>
    [...siblings.values()]
      .sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          a.name.localeCompare(b.name),
      )
      .map((node) => {
        if (!node.directory) return node;
        const children = sort(directories.get(node)!);
        const child = children.length === 1 ? children[0] : undefined;
        // A chain of folders occupies one row; files keep their own basenames.
        return child?.directory
          ? { ...child, name: `${node.name}/${child.name}` }
          : { ...node, children };
      });
  return sort(root);
}

export function fileTreeRows(
  nodes: FileTreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  const visit = (children: FileTreeNode[], level: number) => {
    for (const node of children) {
      rows.push({ ...node, depth: level });
      if (node.directory && !collapsed.has(node.path))
        visit(node.children, level + 1);
    }
  };
  visit(nodes, depth);
  return rows;
}
