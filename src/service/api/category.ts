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

export function fetchCategoryTree(params: { keyword?: string; onlyEnabled?: boolean; onlyWithProduct?: boolean } = {}): Promise<CategoryNode[]> {
  return realOrderRequest<CategoryNode[]>({ url: '/categories/tree', params });
}

/** 发布和求购允许选择任一启用层级，最多五级。 */
export function enabledCategoryOptions(nodes: CategoryNode[], parents: string[] = [], parentId?: string): { id: string; name: string }[] {
  return nodes.flatMap(node => {
    const level = parents.length + 1;
    if (node.enabled !== true || node.level !== level || level > 5) return [];
    if (!(typeof node.id === 'string' ? !!node.id.trim() : typeof node.id === 'number' && Number.isSafeInteger(node.id))) return [];
    if (parentId !== undefined && node.parentId != null && String(node.parentId) !== parentId) return [];
    const path = [...parents, node.name];
    return [{ id: String(node.id), name: path.join(' / ') }, ...enabledCategoryOptions(node.children || [], path, String(node.id))];
  });
}

/** 兼容已有调用名，语义已升级为一至五级任意启用分类。 */
export const enabledThirdLevelCategories = enabledCategoryOptions;
