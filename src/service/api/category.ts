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
