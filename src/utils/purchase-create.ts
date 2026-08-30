import { createPurchase, fetchMyPurchaseRecords, fetchPurchaseRecord, type PurchaseCreateParams } from '@/service/api/purchase';
import { fetchAddressDetail, fetchMyAddresses, type AddressRecord } from '@/service/api/address';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { normalizeAmount } from './amount';

export interface PurchaseCreateReceipt {
  attempt: string;
  request: PurchaseCreateParams;
  imagePaths: string[];
  beforeIds: string[];
  state: 'unknown' | 'confirmed' | 'verified';
  demandId?: string | number;
  observed?: boolean;
}
const memory = new Map<string, PurchaseCreateReceipt>();
const running = new Set<string>();
const keyFor = (userId: string) => `bw_h5_purchase_create_v1:${encodeURIComponent(userId)}`;
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const statuses = ['PENDING_REVIEW', 'REJECTED', 'OPEN', 'TAKEN', 'VOID', 'CANCELED'];
const afterSaleTypes: Record<Api.Product.AftersaleType, Api.RealPurchase.AfterSaleType> = {
  '7day-no-reason': 'SEVEN_DAY_NO_REASON', none: 'NONE', 'shop-warranty': 'SHOP_WARRANTY', 'national-warranty': 'NATIONAL_WARRANTY'
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const origin = (receipt: PurchaseCreateReceipt) => JSON.stringify([receipt.request, receipt.imagePaths, receipt.beforeIds]);

/** 只允许启用的三级节点，祖先被禁用时不开放其后代。 */
export function purchaseCategoryOptions(nodes: CategoryNode[], parents: string[] = []): { id: string; name: string }[] {
  return nodes.flatMap(node => {
    if (node.enabled === false) return [];
    const path = [...parents, node.name];
    return node.level === 3 ? [{ id: String(node.id), name: path.join(' / ') }]
      : purchaseCategoryOptions(node.children || [], path);
  });
}

function imagePath(url: string) {
  const match = typeof url === 'string' && /^https?:\/\/[^/?#]+(\/[^?#]+)/i.exec(url);
  if (!match) throw new Error('参考图片地址无法核对');
  try { return decodeURIComponent(match[1]); } catch { throw new Error('参考图片路径无效'); }
}

function validateRequest(request: PurchaseCreateParams) {
  if (!request || typeof request.productTitle !== 'string' || !request.productTitle.trim()
    || typeof request.productDescription !== 'string' || !validId(request.categoryId) || !validId(request.addressId)
    || !Object.prototype.hasOwnProperty.call(afterSaleTypes, request.aftersaleType) || typeof request.overseasCustoms !== 'boolean'
    || typeof request.appeal !== 'string' || request.appeal.trim().length < 10 || request.appeal.length > 500
    || !Number.isSafeInteger(request.expectedDays) || request.expectedDays < 1 || request.expectedDays > 2147483647
    || !['number', 'string'].includes(typeof request.budgetAmount) || !Number.isFinite(Number(request.budgetAmount)) || Number(request.budgetAmount) <= 0
    || normalizeAmount(request.budgetAmount) !== normalizeAmount(Number(request.budgetAmount))
    || !Array.isArray(request.evidenceUrls) || request.evidenceUrls.length > 4
    || request.evidenceUrls.some(image => !image || typeof image.bucket !== 'string' || !image.bucket.trim()
      || typeof image.filePath !== 'string' || !image.filePath.trim())) throw new Error('请核对求购金额精度、整数天数、说明和最多 4 张参考图');
}

function readStored(userId: string): PurchaseCreateReceipt | undefined {
  if (!userId) throw new Error('请先登录并加载账户资料');
  const receipt = uni.getStorageSync(keyFor(userId));
  if (receipt == null || receipt === '') return;
  if (!receipt || typeof receipt.attempt !== 'string' || !receipt.attempt || !['unknown', 'confirmed', 'verified'].includes(receipt.state)
    || !Array.isArray(receipt.beforeIds) || receipt.beforeIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
    || new Set(receipt.beforeIds).size !== receipt.beforeIds.length
    || !Array.isArray(receipt.imagePaths) || receipt.imagePaths.length !== receipt.request?.evidenceUrls?.length
    || receipt.imagePaths.some((path: unknown) => typeof path !== 'string' || !path.startsWith('/'))
    || (receipt.demandId != null && (!validId(receipt.demandId) || receipt.beforeIds.includes(String(receipt.demandId))))
    || (receipt.state !== 'unknown' && !validId(receipt.demandId))
    || (receipt.observed != null && typeof receipt.observed !== 'boolean')) throw new Error('本机求购创建记录损坏，请先核对，不要重提');
  validateRequest(receipt.request);
  return receipt;
}

export function readPurchaseCreateReceipt(userId: string) {
  const stored = readStored(userId), cached = memory.get(userId);
  if (stored && cached && (stored.attempt !== cached.attempt || origin(stored) !== origin(cached)
    || (stored.demandId != null && cached.demandId != null && String(stored.demandId) !== String(cached.demandId)))) throw new Error('求购创建记录冲突，请先核对');
  const receipt = !stored || (cached && rank[cached.state] > rank[stored.state]) ? cached : stored;
  return receipt ? clone(receipt) : undefined;
}

function save(userId: string, receipt: PurchaseCreateReceipt, beforeSend = false) {
  const previous = readPurchaseCreateReceipt(userId);
  if (beforeSend && previous) throw new Error('已有求购创建记录，请先核对');
  if (!beforeSend && (!previous || previous.attempt !== receipt.attempt)) return previous;
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  if (!beforeSend) memory.set(userId, clone(receipt));
  try {
    uni.setStorageSync(keyFor(userId), clone(receipt));
    if (JSON.stringify(readStored(userId)) !== JSON.stringify(receipt)) throw new Error();
    memory.set(userId, clone(receipt));
  } catch { if (beforeSend) throw new Error('无法保存求购创建进度，本次未提交'); }
  return receipt;
}

function retain(userId: string, receipt: PurchaseCreateReceipt) {
  try { return save(userId, receipt); } catch {
    const previous = memory.get(userId);
    if (previous && (previous.attempt !== receipt.attempt || rank[previous.state] > rank[receipt.state])) return clone(previous);
    memory.set(userId, clone(receipt));
    return receipt;
  }
}

async function readAllPurchases(userId: string, current: () => boolean) {
  const records: Api.RealPurchase.PurchaseDemandVO[] = [], seen = new Set<string>();
  let total: number | undefined;
  for (let pageNo = 1; ; pageNo++) {
    if (!current()) throw new Error('求购页面或账号已变化');
    const page = await fetchMyPurchaseRecords({ pageNo, pageSize: 50 });
    if (!current()) throw new Error('求购页面或账号已变化');
    const count = Number(page.total);
    if (!['number', 'string'].includes(typeof page.total) || !String(page.total).trim() || !Number.isSafeInteger(count) || count < 0
      || !Array.isArray(page.records) || (total != null && count !== total)) throw new Error('求购分页总数缺失或变化，请重试');
    total = count;
    for (const record of page.records) {
      if (!validId(record.id) || String(record.buyerId) !== userId || seen.has(String(record.id))) throw new Error('求购列表归属、ID 或分页不一致');
      seen.add(String(record.id)); records.push(record);
    }
    if (seen.size > total) throw new Error('求购分页总数不一致');
    if (seen.size === total) return records;
    if (!page.records.length) throw new Error('求购列表尚未完整读取');
  }
}

function matches(record: Api.RealPurchase.PurchaseDemandVO, receipt: PurchaseCreateReceipt, userId: string) {
  const request = receipt.request;
  try {
    return validId(record.id) && !receipt.beforeIds.includes(String(record.id)) && String(record.buyerId) === userId
      && statuses.includes(record.status) && record.title === request.productTitle && record.description === request.productDescription
      && String(record.categoryId) === String(request.categoryId) && String(record.addressId) === String(request.addressId)
      && normalizeAmount(record.budget) === normalizeAmount(request.budgetAmount) && record.expectDeliveryDays === request.expectedDays
      && record.overseasClearance === request.overseasCustoms && record.afterSaleType === afterSaleTypes[request.aftersaleType]
      && record.demandNote === request.appeal && Array.isArray(record.images ?? [])
      && JSON.stringify((record.images || []).map(imagePath)) === JSON.stringify(receipt.imagePaths);
  } catch { return false; }
}

export async function reconcilePurchaseCreation(userId: string, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  const receipt = readPurchaseCreateReceipt(userId);
  if (!current() || !receipt || receipt.state === 'verified') return receipt;
  let demandId = receipt.demandId;
  if (demandId == null) {
    const records = await readAllPurchases(userId, current);
    const candidates = records.filter(record => matches(record, receipt, userId));
    if (candidates.length !== 1) return receipt;
    demandId = candidates[0].id;
  }
  const record = await fetchPurchaseRecord(demandId);
  if (!current()) return receipt;
  if (String(record.id) !== String(demandId) || !matches(record, receipt, userId)) throw new Error('求购详情与原内容、地址或归属不符，请先核对');
  return retain(userId, { ...receipt, demandId, state: 'verified', observed: receipt.state === 'unknown' });
}

const addressSignature = (address: AddressRecord) => JSON.stringify([String(address.id), address.receiverName, address.receiverPhone,
  address.country, address.province, address.city, address.district, address.detail, address.postalCode, address.idCardNo]);

export async function createPurchaseWithReceipt(params: PurchaseCreateParams, images: Api.RealProduct.FileUploadResult[], address: AddressRecord, stillActive: () => boolean) {
  const request = clone({ ...params, evidenceUrls: params.evidenceUrls || [] }), uploads = clone(images), originalAddress = clone(address);
  validateRequest(request);
  if (!originalAddress || String(originalAddress.id) !== String(request.addressId)) throw new Error('请重新选择收货地址');
  if (uploads.length !== request.evidenceUrls.length || uploads.some((image, index) => !validId(image.id) || image.privateAccess === true
    || (image.scene != null && image.scene !== 'DEMAND') || image.bucket !== request.evidenceUrls[index].bucket
    || image.filePath !== request.evidenceUrls[index].filePath)) throw new Error('请使用本次上传的求购公开图片');
  const imagePaths = uploads.map(image => imagePath(image.url));
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!userId || !current() || running.has(userId)) throw new Error('已有求购提交或账号已变化');
  if (readPurchaseCreateReceipt(userId)) throw new Error('请先核对上次求购创建结果');
  running.add(userId);
  let marker: PurchaseCreateReceipt | undefined, sent = false;
  try {
    const result = await uni.showModal({ title: '确认发起求购？', content: `预算 U ${request.budgetAmount} · 期望 ${request.expectedDays} 天内\n收货地址：${originalAddress.detail}` });
    if (!result.confirm || !current()) return;
    const records = await readAllPurchases(userId, current);
    const [tree, addresses, latestAddress] = await Promise.all([fetchCategoryTree({ onlyEnabled: true }), fetchMyAddresses(), fetchAddressDetail(request.addressId)]);
    if (!current()) return;
    if (!purchaseCategoryOptions(tree).some(item => item.id === String(request.categoryId))) throw new Error('三级分类已失效，请重新选择');
    if (!addresses.some(item => String(item.id) === String(request.addressId)) || addressSignature(latestAddress) !== addressSignature(originalAddress)) throw new Error('收货地址已变化，请刷新后重新确认');
    marker = { attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, request, imagePaths, beforeIds: records.map(item => String(item.id)), state: 'unknown' };
    save(userId, marker, true);
    sent = true;
    const resultId = await createPurchase(request);
    const demandId = resultId.id;
    if (!validId(demandId) || marker.beforeIds.includes(String(demandId))) throw new Error('求购创建回执缺失或指向旧记录，请先核对');
    return retain(userId, { ...marker, demandId, state: 'confirmed' });
  } catch (error) {
    if (sent && marker && error instanceof RequestError && error.kind === 'config') {
      try {
        const saved = readPurchaseCreateReceipt(userId);
        if (saved?.attempt === marker.attempt && saved.state === 'unknown') {
          uni.removeStorageSync(keyFor(userId));
          if (readStored(userId)) throw new Error();
          memory.delete(userId);
        }
      } catch { /* 清理无法核对时保留原请求。 */ }
    }
    throw error;
  } finally { running.delete(userId); }
}

export function beginNextPurchase(userId: string, attempt: string) {
  const receipt = readPurchaseCreateReceipt(userId);
  if (running.has(userId) || !receipt || receipt.attempt !== attempt || receipt.state !== 'verified') throw new Error('请先完成原求购核对');
  uni.removeStorageSync(keyFor(userId));
  if (readStored(userId)) throw new Error('本机求购记录未清理，请重试');
  memory.delete(userId);
}

export function purchaseCreateMessage(receipt: PurchaseCreateReceipt) {
  if (receipt.state === 'unknown') return '求购创建结果未知，请核对原求购，不要重复提交';
  if (receipt.state === 'confirmed') return '求购创建请求已成功，原详情待核对';
  return receipt.observed ? '已找到与原请求一致的新求购，请查看最新状态' : '已核对原求购，请查看审核或接单状态';
}
