import { createProduct, fetchBuyerProductDetail, fetchMyProducts } from '@/service/api/product';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { normalizeAmount } from './amount';

export interface ProductCreateReceipt {
  attempt: string;
  request: Api.RealProduct.ProductCreateParams;
  imagePaths: string[];
  beforeIds: string[];
  state: 'unknown' | 'confirmed' | 'verified';
  productId?: string | number;
  observed?: boolean;
}
const memory = new Map<string, ProductCreateReceipt>();
const running = new Set<string>();
const keyFor = (userId: string) => `bw_h5_product_create_v1:${encodeURIComponent(userId)}`;
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const statuses = ['REVIEWING', 'REJECTED', 'ON_SALE', 'OFF_SHELF', 'FROZEN'];
const afterSaleTypes = ['SEVEN_DAY_NO_REASON', 'NONE', 'SHOP_WARRANTY', 'NATIONAL_WARRANTY'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const origin = (receipt: ProductCreateReceipt) => JSON.stringify([receipt.request, receipt.imagePaths, receipt.beforeIds]);

/** 仅比较公开图片路径；不保存 URL 查询参数、签名或宿主地址。 */
function imagePath(url: string) {
  if (typeof url !== 'string') throw new Error('商品图片地址缺失');
  const match = /^https?:\/\/[^/?#]+(\/[^?#]+)/i.exec(url);
  if (!match) throw new Error('商品图片地址无法核对');
  try { return decodeURIComponent(match[1]); } catch { throw new Error('商品图片路径无效'); }
}

function validateRequest(request: Api.RealProduct.ProductCreateParams) {
  if (!request || typeof request.title !== 'string' || !request.title.trim() || request.title.length > 128
    || !validId(request.categoryId) || !afterSaleTypes.includes(request.afterSaleType)
    || typeof request.price !== 'number' || !Number.isFinite(request.price) || request.price <= 0
    || ![request.shippingFee, request.taxFee].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    || !Number.isSafeInteger(request.stock) || request.stock < 0 || request.stock > 2147483647
    || typeof request.overseasClearance !== 'boolean' || typeof request.brief !== 'string' || request.brief.length > 30
    || typeof request.description !== 'string' || request.description.length > 500
    || !Array.isArray(request.images) || request.images.length < 1 || request.images.length > 6
    || request.images.some(item => !item || typeof item.bucket !== 'string' || !item.bucket.trim()
      || typeof item.filePath !== 'string' || !item.filePath.trim())) throw new Error('请核对商品字段、金额、整数库存及 1–6 张图片');
}

function readStored(userId: string): ProductCreateReceipt | undefined {
  if (!userId) throw new Error('请先登录并加载账号资料');
  const receipt = uni.getStorageSync(keyFor(userId));
  if (receipt == null || receipt === '') return;
  if (!receipt || typeof receipt.attempt !== 'string' || !receipt.attempt || !['unknown', 'confirmed', 'verified'].includes(receipt.state)
    || !Array.isArray(receipt.beforeIds) || receipt.beforeIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
    || new Set(receipt.beforeIds).size !== receipt.beforeIds.length
    || !Array.isArray(receipt.imagePaths) || receipt.imagePaths.length !== receipt.request?.images?.length
    || receipt.imagePaths.some((path: unknown) => typeof path !== 'string' || !path.startsWith('/'))
    || (receipt.productId != null && (!validId(receipt.productId) || receipt.beforeIds.includes(String(receipt.productId))))
    || (receipt.state !== 'unknown' && !validId(receipt.productId))
    || (receipt.observed != null && typeof receipt.observed !== 'boolean')) throw new Error('本机商品发布记录损坏，请先核对，不要重复发布');
  validateRequest(receipt.request);
  return receipt;
}

export function readProductCreateReceipt(userId: string) {
  const stored = readStored(userId), cached = memory.get(userId);
  if (stored && cached && (stored.attempt !== cached.attempt || origin(stored) !== origin(cached)
    || (stored.productId != null && cached.productId != null && String(stored.productId) !== String(cached.productId)))) throw new Error('商品发布记录冲突，请先核对');
  const receipt = !stored || (cached && rank[cached.state] > rank[stored.state]) ? cached : stored;
  return receipt ? clone(receipt) : undefined;
}

function save(userId: string, receipt: ProductCreateReceipt, beforeSend = false) {
  const previous = readProductCreateReceipt(userId);
  if (beforeSend && previous) throw new Error('已有发布记录，请先核对原商品');
  if (!beforeSend && (!previous || previous.attempt !== receipt.attempt)) return previous;
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  if (!beforeSend) memory.set(userId, clone(receipt));
  try {
    uni.setStorageSync(keyFor(userId), clone(receipt));
    if (JSON.stringify(readStored(userId)) !== JSON.stringify(receipt)) throw new Error();
    memory.set(userId, clone(receipt));
  } catch { if (beforeSend) throw new Error('无法保存商品发布进度，本次未提交'); }
  return receipt;
}

function retain(userId: string, receipt: ProductCreateReceipt) {
  try { return save(userId, receipt); } catch {
    const previous = memory.get(userId);
    if (previous && (previous.attempt !== receipt.attempt || rank[previous.state] > rank[receipt.state])) return clone(previous);
    memory.set(userId, clone(receipt));
    return receipt;
  }
}

async function readAllProducts(userId: string, current: () => boolean) {
  const records: Api.RealProduct.ProductDTO[] = [], seen = new Set<string>();
  let total: number | undefined;
  for (let pageNo = 1; ; pageNo++) {
    if (!current()) throw new Error('发布页面或账号已变化');
    // 不按状态或标题筛选，以免旧商品改名/审核流转后被误认为本次新增。
    const page = await fetchMyProducts({ pageNo, pageSize: 50 });
    if (!current()) throw new Error('发布页面或账号已变化');
    const count = Number(page.total);
    if (!['number', 'string'].includes(typeof page.total) || !String(page.total).trim() || !Number.isSafeInteger(count) || count < 0
      || !Array.isArray(page.records) || (total != null && count !== total)) throw new Error('商品列表总数缺失或变化，请重新核对');
    total = count;
    for (const product of page.records) {
      if (!validId(product.id) || String(product.sellerId) !== userId || seen.has(String(product.id))) throw new Error('商品列表归属、ID 或分页不一致');
      seen.add(String(product.id)); records.push(product);
    }
    if (seen.size > total) throw new Error('商品列表总数不一致');
    if (seen.size === total) return records;
    if (!page.records.length) throw new Error('商品列表尚未完整读取，请重试');
  }
}

function matches(product: Api.RealProduct.ProductDTO, receipt: ProductCreateReceipt, userId: string) {
  const request = receipt.request;
  try {
    return validId(product.id) && !receipt.beforeIds.includes(String(product.id)) && String(product.sellerId) === userId
      && statuses.includes(product.status) && product.title === request.title && String(product.categoryId) === String(request.categoryId)
      && product.brief === request.brief && product.description === request.description && product.stock === request.stock
      && product.afterSaleType === request.afterSaleType && product.overseasClearance === request.overseasClearance
      && normalizeAmount(product.price) === normalizeAmount(request.price)
      && product.shippingFee != null && normalizeAmount(product.shippingFee) === normalizeAmount(request.shippingFee!)
      && product.taxFee != null && normalizeAmount(product.taxFee) === normalizeAmount(request.taxFee!)
      && Array.isArray(product.images) && JSON.stringify(product.images.map(imagePath)) === JSON.stringify(receipt.imagePaths);
  } catch { return false; }
}

export async function reconcileProductCreation(userId: string, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  const receipt = readProductCreateReceipt(userId);
  if (!current() || !receipt || receipt.state === 'verified') return receipt;
  let productId = receipt.productId;
  if (productId == null) {
    const products = await readAllProducts(userId, current);
    const candidates = products.filter(product => matches(product, receipt, userId));
    if (candidates.length !== 1) return receipt;
    productId = candidates[0].id;
  }
  const product = await fetchBuyerProductDetail(productId);
  if (!current()) return receipt;
  if (String(product.id) !== String(productId) || !matches(product, receipt, userId)) throw new Error('商品详情与原发布内容或归属不符，请核对原商品');
  return retain(userId, { ...receipt, productId, state: 'verified', observed: receipt.state === 'unknown' });
}

export async function createProductWithReceipt(params: Api.RealProduct.ProductCreateParams, images: Api.RealProduct.FileUploadResult[], stillActive: () => boolean) {
  const request = clone(params), uploads = clone(images);
  validateRequest(request);
  if (uploads.length !== request.images.length || uploads.some((image, index) => !validId(image.id) || image.privateAccess === true
    || (image.scene != null && image.scene !== 'PRODUCT') || image.bucket !== request.images[index].bucket
    || image.filePath !== request.images[index].filePath)) throw new Error('请使用本次上传的商品公开图片');
  const imagePaths = uploads.map(image => imagePath(image.url));
  const user = useUserStore(), userId = user.realUserId, token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === user.realUserId;
  if (!userId || !current() || !user.canSwitchToBuyer || running.has(userId)) throw new Error('发布资格已变化或已有发布操作');
  if (readProductCreateReceipt(userId)) throw new Error('上次发布尚未处理，请先核对原商品');
  running.add(userId);
  let marker: ProductCreateReceipt | undefined;
  let sent = false;
  try {
    const products = await readAllProducts(userId, current);
    await user.refreshProfile();
    if (!current()) return;
    if (!user.canSwitchToBuyer) throw new Error('商品发布资格已变化，请重新确认');
    marker = { attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, request, imagePaths, beforeIds: products.map(item => String(item.id)), state: 'unknown' };
    save(userId, marker, true);
    sent = true;
    const productId = await createProduct(request);
    if (!validId(productId) || marker.beforeIds.includes(String(productId))) throw new Error('商品创建回执缺失或指向旧商品，请核对');
    return retain(userId, { ...marker, productId, state: 'confirmed' });
  } catch (error) {
    if (sent && marker && error instanceof RequestError && error.kind === 'config') {
      try {
        const saved = readProductCreateReceipt(userId);
        if (saved?.attempt === marker.attempt && saved.state === 'unknown') {
          uni.removeStorageSync(keyFor(userId));
          if (readStored(userId)) throw new Error();
          memory.delete(userId);
        }
      } catch { /* 无法确认本机清理结果时保留原请求。 */ }
    }
    throw error;
  } finally { running.delete(userId); }
}

/** 只有核对成功后，用户主动开始另一件商品才解除本机保护；不删除服务端商品。 */
export function beginNextProduct(userId: string, attempt: string) {
  const receipt = readProductCreateReceipt(userId);
  if (running.has(userId) || !receipt || receipt.attempt !== attempt || receipt.state !== 'verified') throw new Error('请先完成原商品核对');
  uni.removeStorageSync(keyFor(userId));
  if (readStored(userId)) throw new Error('本机发布记录未清理，请重试');
  memory.delete(userId);
}

export function productCreateMessage(receipt: ProductCreateReceipt) {
  if (receipt.state === 'unknown') return '商品发布结果未知，请先核对原商品，不要重复提交';
  if (receipt.state === 'confirmed') return '商品创建请求已成功，原商品详情待核对';
  return receipt.observed ? '已找到与原发布内容一致的新商品，请查看审核状态' : '已核对原商品，当前审核状态请查看详情';
}
