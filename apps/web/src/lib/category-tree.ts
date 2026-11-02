import { localized } from './format';

interface TreeNode {
  id: string;
  parentId: string | null;
  name: unknown;
}

// Sắp danh mục theo cây (cha rồi tới con), kèm độ sâu để thụt lề khi hiển thị.
// Input đã được sắp theo sortOrder -> thứ tự anh em được giữ nguyên.
export function flattenTree<T extends TreeNode>(items: T[]) {
  const ids = new Set(items.map((i) => i.id));
  const children = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    children.set(key, [...(children.get(key) ?? []), item]);
  }

  const out: { item: T; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of children.get(parentId) ?? []) {
      out.push({ item, depth });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function descendantIds<T extends TreeNode>(items: T[], rootId: string) {
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const item of items) {
      if (item.parentId === current && !result.has(item.id)) {
        result.add(item.id);
        stack.push(item.id);
      }
    }
  }
  return result;
}

export function treeOptions<T extends TreeNode>(items: T[], exclude: Set<string> = new Set()) {
  return flattenTree(items)
    .filter(({ item }) => !exclude.has(item.id))
    .map(({ item, depth }) => ({ id: item.id, label: `${'— '.repeat(depth)}${localized(item.name)}` }));
}
