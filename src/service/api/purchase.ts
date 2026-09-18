import { realOrderRequest, realOrderUpload } from '../request';
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
  if (status === 'PENDING_REVIEW') return 'pending_audit';
  if (status === 'OPEN') return 'pushing';
  if (status === 'TAKEN' || status === 'CLAIMED') return 'claimed';
  if (status === 'CANCELED' || status === 'CANCELLED' || status === 'VOID') return 'cancelled';
  if (status === 'REJECTED') return 'rejected';
  throw new Error('求购状态缺失或无法识别，请刷新核对');
}

function toIso(value?: string | number): string {
  if (!value) return '';
  if (typeof value === 'number' || /^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

async function getCategoryPath(id: string | number): Promise<string> {
  const key = String(id);
  if (!categoryPathPromise) {
    categoryPathPromise = fetchCategoryTree({ onlyEnabled: true, onlyWithProduct: false }).then(nodes => {
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
    }).catch(error => { categoryPathPromise = undefined; throw error; });
  }
  const categoryPathCache = await categoryPathPromise;
  return categoryPathCache.get(key) || '分类暂不可用';
}

async function toPurchaseRequest(
  dto: Api.RealPurchase.PurchaseDemandVO,
  customerId?: string
): Promise<Api.PurchaseRequest.PurchaseRequest> {
  return {
    id: dto.id,
    code: `PUR-${dto.id}`,
    customerId: dto.buyerId ?? customerId ?? '',
    customerName: '',
    productTitle: dto.title,
    productDescription: dto.description || '',
    categoryId: dto.categoryId,
    categoryPath: await getCategoryPath(dto.categoryId),
    budgetAmount: String(dto.budget ?? 0),
    expectedDays: dto.expectDeliveryDays || 0,
    overseasCustoms: !!dto.overseasClearance,
    aftersaleType: toAfterSaleType(dto.afterSaleType),
    evidenceUrls: dto.images || [],
    appeal: dto.demandNote || dto.description || '',
    status: toStatus(dto.status),
    auditNote: dto.reviewComment,
    auditedAt: toIso(dto.reviewedAt),
    pushedToBuyerIds: [],
    claimedBy: dto.takenBy,
    claimedAt: toIso(dto.takenAt),
    relatedOrderId: dto.orderId,
    relatedOrderCode: dto.orderId ? String(dto.orderId) : undefined,
    cancelledReason: dto.cancelReason,
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
  minBudget?: number;
  maxBudget?: number;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
} = {}) {
  const page = await realOrderRequest<Api.RealPurchase.PurchaseDemandPage, Api.RealPurchase.PurchaseDemandPageQuery>({
    url: '/demands/hall/page',
    method: 'POST',
    data: {
      pageNo: query.current || 1,
      pageSize: query.size || 20,
      categoryId: query.categoryId,
      keyword: query.keyword,
      minBudget: query.minBudget, maxBudget: query.maxBudget,
      minDeliveryDays: query.minDeliveryDays, maxDeliveryDays: query.maxDeliveryDays
    }
  });
  return mapPage(page);
}

export async function fetchMyPurchases(
  customerId: string,
  statuses?: Api.PurchaseRequest.RequestStatus[],
  query: { current?: number; size?: number } & Pick<Api.RealPurchase.PurchaseDemandPageQuery, 'minBudget' | 'maxBudget' | 'minDeliveryDays' | 'maxDeliveryDays'> = {}
) {
  const statusMap: Record<Api.PurchaseRequest.RequestStatus, string[]> = {
    pending_audit: ['PENDING_REVIEW'], pushing: ['OPEN'], claimed: ['TAKEN'],
    cancelled: ['CANCELED', 'VOID'], rejected: ['REJECTED']
  };
  const page = await fetchMyPurchaseRecords({ pageNo: query.current || 1, pageSize: query.size || 30,
    statuses: statuses?.length ? statuses.flatMap(status => statusMap[status]) : undefined,
    minBudget: query.minBudget, maxBudget: query.maxBudget,
    minDeliveryDays: query.minDeliveryDays, maxDeliveryDays: query.maxDeliveryDays });
  return mapPage(page, customerId);
}

/** 原请求恢复使用完整记录，不用展示 adapter 的默认值推断原地址或归属。 */
export function fetchMyPurchaseRecords(query: Api.RealPurchase.PurchaseDemandPageQuery = {}) {
  return realOrderRequest<Api.RealPurchase.PurchaseDemandPage, Api.RealPurchase.PurchaseDemandPageQuery>({
    url: '/demands/my/page',
    method: 'POST',
    data: {
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 30,
      categoryId: query.categoryId,
      keyword: query.keyword,
      statuses: query.statuses,
      minBudget: query.minBudget, maxBudget: query.maxBudget,
      minDeliveryDays: query.minDeliveryDays, maxDeliveryDays: query.maxDeliveryDays
    }
  });
}

export function fetchPurchaseRecord(id: string | number) {
  return realOrderRequest<Api.RealPurchase.PurchaseDemandVO>({
    url: '/demands/detail',
    params: { id }
  });
}

export async function fetchPurchaseDetail(id: string | number, _viewerId?: string) {
  const dto = await fetchPurchaseRecord(id);
  return {
    request: await toPurchaseRequest(dto),
    rawStatus: dto.status
  };
}

function progressTimestamp(value: unknown): number {
  // int64 时间戳可能以十进制字符串返回；仅转换时间，不转换业务 ID。
  const timestamp = typeof value === 'number' ? value
    : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(timestamp) || Number.isNaN(new Date(timestamp).getTime())) throw new Error('求购进度时间格式无效');
  return timestamp;
}

export async function fetchPurchaseProgress(id: string | number) {
  const result = await realOrderRequest<Api.RealPurchase.DemandProgress>({ url: '/demands/my/progress', params: { id } });
  if (!result || String(result.demandId) !== String(id) || !Array.isArray(result.timeline)
    || !Number.isSafeInteger(result.pushBatchCount) || !Number.isSafeInteger(result.reachedBuyerCount)) throw new Error('求购进度响应不完整');
  return {
    ...result,
    reviewedAt: result.reviewedAt == null ? undefined : progressTimestamp(result.reviewedAt),
    lastPushedAt: result.lastPushedAt == null ? undefined : progressTimestamp(result.lastPushedAt),
    expireAt: result.expireAt == null ? undefined : progressTimestamp(result.expireAt),
    takenAt: result.takenAt == null ? undefined : progressTimestamp(result.takenAt),
    timeline: result.timeline.map(node => ({ ...node, occurredAt: progressTimestamp(node.occurredAt) }))
  };
}

export interface PurchaseCreateParams {
  productTitle: string;
  productDescription: string;
  categoryId: string | number;
  budgetAmount: string | number;
  expectedDays: number;
  overseasCustoms: boolean;
  aftersaleType: Api.Product.AftersaleType;
  appeal: string;
  addressId: string | number;
  evidenceUrls?: Api.RealPurchase.ProductImageParam[];
}

export async function createPurchase(params: PurchaseCreateParams) {
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
      addressId: params.addressId,
      images: params.evidenceUrls
    }
  });
  // 创建回执已确认，详情回读由目标页独立处理，避免读取失败导致重复创建。
  return { id };
}

export function uploadPurchaseImage(filePath: string) {
  return realOrderUpload<Api.RealProduct.FileUploadResult>({
    url: '/files/upload',
    filePath,
    name: 'file',
    params: { scene: 'DEMAND' }
  });
}

export function cancelPurchase(id: string | number, reason?: string) {
  return realOrderRequest<string | number, { id: string | number; reason?: string }>({
    url: '/demands/cancel',
    method: 'POST',
    data: { id, reason }
  });
}

export async function claimRequest(id: string | number) {
  const orderId = await realOrderRequest<string | number, { id: string | number }>({
    url: '/demands/grab',
    method: 'POST',
    data: { id }
  });
  if (orderId == null || orderId === '') throw new Error('接单回执缺失，请核对求购和订单记录');
  return { ok: true, message: '', orderId };
}
