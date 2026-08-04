import { realOrderRequest } from '../request';
import { fetchCategoryTree, type CategoryNode } from './category';

let categoryPathPromise: Promise<Map<string, string>> | undefined;

function toAfterSaleType(value?: string): Api.Product.AftersaleType {
  if (value === 'NONE') return 'none';
  if (value === 'SHOP_WARRANTY') return 'shop-warranty';
  if (value === 'NATIONAL_WARRANTY') return 'national-warranty';
  return '7day-no-reason';
}

function fromAfterSaleType(value: Api.Product.AftersaleType): Api.RealPurchase.AfterSaleType {
  if (value === 'none') return 'NONE';
  if (value === 'shop-warranty') return 'SHOP_WARRANTY';
  if (value === 'national-warranty') return 'NATIONAL_WARRANTY';
  return 'SEVEN_DAY_NO_REASON';
}

function toStatus(value?: string): Api.PurchaseRequest.RequestStatus {
  const status = value?.toUpperCase();
  if (status === 'OPEN') return 'pushing';
  if (status === 'TAKEN' || status === 'CLAIMED') return 'claimed';
  if (status === 'CANCELED' || status === 'CANCELLED' || status === 'VOID') return 'cancelled';
  if (status === 'REJECTED') return 'rejected';
  return 'pending_audit';
}

function toIso(value?: string | number): string {
  if (!value) return '';
  if (typeof value === 'number' || /^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

async function getCategoryPath(id: string | number): Promise<string> {
  const key = String(id);
  if (!categoryPathPromise) {
    categoryPathPromise = fetchCategoryTree({ onlyEnabled: true }).then(nodes => {
      const cache = new Map<string, string>();
      const walk = (items: CategoryNode[], parents: string[] = []) => {
        items.forEach(node => {
          const path = [...parents, node.name];
          cache.set(String(node.id), path.join(' / '));
          if (node.children?.length) walk(node.children, path);
        });
      };
      walk(nodes);
      return cache;
    });
  }
  const categoryPathCache = await categoryPathPromise;
  return categoryPathCache.get(key) || `分类已失效 · ${key}`;
}

async function toPurchaseRequest(
  dto: Api.RealPurchase.PurchaseDemandVO,
  customerId?: string
): Promise<Api.PurchaseRequest.PurchaseRequest> {
  return {
    id: dto.id as unknown as number,
    code: `PUR-${dto.id}`,
    customerId: (customerId || '') as unknown as number,
    customerName: '',
    productTitle: dto.title,
    productDescription: dto.description || '',
    categoryId: dto.categoryId as unknown as number,
    categoryPath: await getCategoryPath(dto.categoryId),
    budgetAmount: String(dto.budget ?? 0),
    expectedDays: dto.expectDeliveryDays || 0,
    overseasCustoms: !!dto.overseasClearance,
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    evidenceUrls: dto.images || [],
    appeal: dto.demandNote || dto.description || '',
    status: toStatus(dto.status),
    pushedToBuyerIds: [],
    claimedBy: dto.takenBy as unknown as number | undefined,
    claimedAt: toIso(dto.takenAt),
    relatedOrderId: dto.orderId as unknown as number | undefined,
    relatedOrderCode: dto.orderId ? String(dto.orderId) : undefined,
    createdAt: toIso(dto.createdAt)
  };
}

async function mapPage(page: Api.RealPurchase.PurchaseDemandPage, customerId?: string) {
  return {
    current: page.current || page.pageNo || 1,
    size: page.size || page.pageSize || 20,
    total: page.total,
    records: await Promise.all(page.records.map(record => toPurchaseRequest(record, customerId)))
  };
}

export async function fetchHall(query: {
  current?: number;
  size?: number;
  categoryId?: string | number;
  keyword?: string;
} = {}) {
  const page = await realOrderRequest<Api.RealPurchase.PurchaseDemandPage, Api.RealPurchase.PurchaseDemandPageQuery>({
    url: '/demands/hall/page',
    method: 'POST',
    data: {
      pageNo: query.current || 1,
      pageSize: query.size || 20,
      categoryId: query.categoryId,
      keyword: query.keyword
    }
  });
  return mapPage(page);
}

export async function fetchMyPurchases(
  customerId: string,
  statuses?: Api.PurchaseRequest.RequestStatus[],
  query: { current?: number; size?: number } = {}
) {
  const page = await realOrderRequest<Api.RealPurchase.PurchaseDemandPage, Api.RealPurchase.PurchaseDemandPageQuery>({
    url: '/demands/my/page',
    method: 'POST',
    data: {
      pageNo: query.current || 1,
      pageSize: query.size || 30
    }
  });
  const mapped = await mapPage(page, customerId);
  if (statuses?.length) mapped.records = mapped.records.filter(record => statuses.includes(record.status));
  return mapped;
}

export async function fetchPurchaseDetail(id: string | number, customerId?: string) {
  const dto = await realOrderRequest<Api.RealPurchase.PurchaseDemandVO>({
    url: '/demands/detail',
    params: { id }
  });
  return {
    request: await toPurchaseRequest(dto, customerId),
    pushLogs: [] as Api.PurchaseRequest.PushLog[]
  };
}

export async function createPurchase(params: {
  productTitle: string;
  productDescription: string;
  categoryId: string | number;
  budgetAmount: string | number;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: Api.Product.AftersaleType;
  appeal: string;
  evidenceUrls?: Api.RealPurchase.ProductImageParam[];
}, customerId?: string) {
  const id = await realOrderRequest<string | number, Api.RealPurchase.PurchaseDemandCreateParams>({
    url: '/demands/create',
    method: 'POST',
    data: {
      title: params.productTitle,
      categoryId: params.categoryId,
      description: params.productDescription,
      budget: Number(params.budgetAmount),
      expectDeliveryDays: params.expectedDays,
      overseasClearance: params.overseasCustoms,
      afterSaleType: fromAfterSaleType(params.aftersaleType),
      demandNote: params.appeal,
      images: params.evidenceUrls
    }
  });
  return (await fetchPurchaseDetail(id, customerId)).request;
}

export async function cancelPurchase(id: string | number) {
  await realOrderRequest<string | number, { id: string | number }>({
    url: '/demands/cancel',
    method: 'POST',
    data: { id }
  });
  return { ok: true };
}

export async function claimRequest(id: string | number) {
  await realOrderRequest<string | number, { id: string | number }>({
    url: '/demands/grab',
    method: 'POST',
    data: { id }
  });
  return { ok: true };
}
