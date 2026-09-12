import { realOrderRequest } from '../request';

export interface CategoryNode {
  id: string;
  parentId?: string | null;
  level: number;
  name: string;
  sortOrder?: number;
  enabled?: boolean;
  source?: string;
  childCount?: number;
  children?: CategoryNode[];
}

export function fetchCategoryTree(params: { keyword?: string; onlyEnabled?: boolean } = {}): Promise<CategoryNode[]> {
  return realOrderRequest<CategoryNode[]>({ url: '/categories/tree', params });
}

/** 发布只接受完整、逐级启用的三级路径；一级或二级叶子不可提交。 */
export function enabledThirdLevelCategories(nodes: CategoryNode[], parents: string[] = [], parentId?: string): { id: string; name: string }[] {
  return nodes.flatMap(node => {
    const level = parents.length + 1;
    if (node.enabled !== true || node.level !== level || level > 3) return [];
    if (!(typeof node.id === 'string' ? !!node.id.trim() : typeof node.id === 'number' && Number.isSafeInteger(node.id))) return [];
    if (parentId !== undefined && node.parentId != null && String(node.parentId) !== parentId) return [];
    const path = [...parents, node.name];
    return level === 3 ? [{ id: String(node.id), name: path.join(' / ') }]
      : enabledThirdLevelCategories(node.children || [], path, String(node.id));
  });
}
