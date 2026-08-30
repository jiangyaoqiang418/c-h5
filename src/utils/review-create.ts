import { createReview, fetchMyReviews, fetchReviewableOrders, fetchReviewDetail } from '@/service/api/review';
import { fetchOrderDetail, orderRole } from '@/service/api/order';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';

export interface ReviewCreateReceipt {
  attempt: string;
  request: Api.RealReview.ReviewSubmitParams;
  sellerId: Api.RealReview.Id;
  productId?: Api.RealReview.Id;
  state: 'unknown' | 'confirmed' | 'verified';
  reviewId?: Api.RealReview.Id;
  observed?: boolean;
}
export interface ReviewScan<T> { nextPage: number; total?: number; ids: string[]; done: boolean; matches: T[]; matchPage?: number; }
export const newReviewScan = <T>(): ReviewScan<T> => ({ nextPage: 1, total: undefined, ids: [], done: false, matches: [], matchPage: undefined });
const validId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const keyFor = (userId: string) => `bw_h5_review_create_v1:${encodeURIComponent(userId)}`;
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const memory = new Map<string, ReviewCreateReceipt[]>();
const running = new Set<string>();
const operationKey = (userId: string, orderId: Api.RealReview.Id) => `${userId}:${orderId}`;
const origin = (r: ReviewCreateReceipt) => JSON.stringify([r.request, String(r.sellerId), r.productId == null ? null : String(r.productId)]);

function validateRequest(request: Api.RealReview.ReviewSubmitParams) {
  if (!request || !validId(request.orderId) || ![1, 2, 3, 4, 5].includes(request.productScore)
    || ![1, 2, 3, 4, 5].includes(request.sellerScore) || typeof request.content !== 'string' || request.content.length > 1000
    || typeof request.anonymous !== 'boolean' || !Array.isArray(request.images) || request.images.length > 9
    || request.images.some(url => typeof url !== 'string' || !/^https?:\/\/[^/?#]+\/[^?#]+$/i.test(url))) throw new Error('请核对评分、1000 字以内内容及最多 9 张公开图片');
}

function readStored(userId: string): ReviewCreateReceipt[] {
  if (!userId) throw new Error('请先登录并加载账户资料');
  const all = uni.getStorageSync(keyFor(userId));
  if (all == null || all === '') return [];
  if (!Array.isArray(all) || all.some(r => !r || !r.attempt || typeof r.attempt !== 'string' || !validId(r.sellerId)
    || (r.productId != null && !validId(r.productId)) || !['unknown', 'confirmed', 'verified'].includes(r.state)
    || (r.reviewId != null && !validId(r.reviewId)) || (r.state !== 'unknown' && !validId(r.reviewId))
    || (r.observed != null && typeof r.observed !== 'boolean'))) throw new Error('本机评价提交记录损坏，请先核对');
  all.forEach(r => validateRequest(r.request));
  if (new Set(all.map(r => String(r.request.orderId))).size !== all.length) throw new Error('本机评价提交记录重复，请先核对');
  return all;
}

export function readReviewCreateReceipts(userId: string): ReviewCreateReceipt[] {
  const all = new Map(readStored(userId).map(r => [String(r.request.orderId), r]));
  for (const cached of memory.get(userId) || []) {
    const stored = all.get(String(cached.request.orderId));
    if (stored && (stored.attempt !== cached.attempt || origin(stored) !== origin(cached)
      || (stored.reviewId != null && cached.reviewId != null && String(stored.reviewId) !== String(cached.reviewId)))) throw new Error('原评价提交记录冲突，请先核对');
    if (!stored || rank[cached.state] > rank[stored.state]) all.set(String(cached.request.orderId), cached);
  }
  return clone([...all.values()]);
}

function save(userId: string, receipt: ReviewCreateReceipt, beforeSend = false) {
  // 已返回的服务端回执先留在原账号内存中；磁盘损坏不能抹掉已知结果。
  if (!beforeSend && receipt.state !== 'unknown') {
    const cached = memory.get(userId) || [];
    const previous = cached.find(r => String(r.request.orderId) === String(receipt.request.orderId));
    if (!previous || (previous.attempt === receipt.attempt && origin(previous) === origin(receipt)
      && (previous.reviewId == null || String(previous.reviewId) === String(receipt.reviewId)) && rank[previous.state] <= rank[receipt.state])) {
      memory.set(userId, [...cached.filter(r => String(r.request.orderId) !== String(receipt.request.orderId)), clone(receipt)]);
    }
  }
  const all = readReviewCreateReceipts(userId), previous = all.find(r => String(r.request.orderId) === String(receipt.request.orderId));
  if (previous && (previous.attempt !== receipt.attempt || origin(previous) !== origin(receipt)
    || (previous.reviewId != null && receipt.reviewId != null && String(previous.reviewId) !== String(receipt.reviewId)))) throw new Error('已有原评价提交，请先核对');
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  const next = [...all.filter(r => String(r.request.orderId) !== String(receipt.request.orderId)), clone(receipt)];
  if (!beforeSend) memory.set(userId, next);
  try {
    uni.setStorageSync(keyFor(userId), clone(next));
    if (JSON.stringify(readStored(userId)) !== JSON.stringify(next)) throw new Error();
    memory.set(userId, next);
  } catch { if (beforeSend) throw new Error('无法保存原评价内容，本次未提交'); }
  return receipt;
}

/** 每轮最多五页；只有成功读取的页推进，普通失败可从原页继续。 */
async function scanPages<T>(scan: ReviewScan<T>, fetchPage: (page: number) => Promise<Api.RealReview.Page<T>>,
  key: (item: T) => Api.RealReview.Id, matches: (item: T) => boolean, current: () => boolean, stopAtMatch: boolean) {
  for (let count = 0; count < 5 && !scan.done; count++) {
    if (!current()) return;
    const page = await fetchPage(scan.nextPage);
    if (!current()) return;
    const total = Number(page.total);
    if (!['number', 'string'].includes(typeof page.total) || !String(page.total).trim() || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(page.records)) throw new Error('评价分页响应不完整，请重试');
    if (scan.total != null && scan.total !== total) {
      Object.assign(scan, newReviewScan<T>());
      throw new Error('评价列表已变化，请重新查询');
    }
    const ids = page.records.map(item => { const id = key(item); if (!validId(id)) throw new Error('评价记录 ID 或归属缺失'); return String(id); });
    const seen = [...scan.ids, ...ids];
    if (new Set(seen).size !== seen.length || seen.length > total || (!ids.length && seen.length < total)) throw new Error('评价分页重复或缺失，请重新查询');
    const found = page.records.filter(matches);
    scan.matches.push(...found);
    if (found.length) scan.matchPage = scan.nextPage;
    scan.total = total; scan.ids = seen; scan.nextPage++;
    scan.done = seen.length === total || (stopAtMatch && !!found.length);
  }
}

export function scanReviewableOrder(orderId: Api.RealReview.Id, scan: ReviewScan<Api.RealReview.ReviewableOrderVO>, current: () => boolean) {
  return scanPages(scan, pageNo => fetchReviewableOrders({ pageNo, pageSize: 50 }), item => item.orderId,
    item => String(item.orderId) === String(orderId), current, true);
}

function matchesReview(record: Api.RealReview.ReviewDTO, receipt: ReviewCreateReceipt, userId: string) {
  const p = receipt.request;
  return validId(record.reviewId) && String(record.orderId) === String(p.orderId) && String(record.userId) === userId
    && String(record.sellerId) === String(receipt.sellerId) && String(record.productId ?? '') === String(receipt.productId ?? '')
    && ['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN'].includes(record.status)
    && record.productScore === p.productScore && record.sellerScore === p.sellerScore
    && (record.content ?? '') === p.content && record.anonymous === p.anonymous
    && JSON.stringify(record.images ?? []) === JSON.stringify(p.images);
}

export async function reconcileReviewCreation(orderId: Api.RealReview.Id, scan: ReviewScan<Api.RealReview.ReviewDTO>, stillActive: () => boolean) {
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => !!userId && !!token && token === getAccessToken() && userId === useUserStore().realUserId && stillActive();
  if (!userId || !current()) return;
  const receipt = readReviewCreateReceipts(userId).find(r => String(r.request.orderId) === String(orderId));
  if (!receipt || receipt.state === 'verified') return receipt;
  let reviewId = receipt.reviewId;
  if (reviewId == null) {
    // 上轮完整扫描仍无结果时，后续核对必须重新读取，不能永久复用空结果。
    if (scan.done) Object.assign(scan, newReviewScan<Api.RealReview.ReviewDTO>());
    await scanPages(scan, pageNo => fetchMyReviews({ pageNo, pageSize: 50 }), item => {
      if (String(item.userId) !== userId) throw new Error('评价列表归属不符');
      return item.reviewId;
    }, item => String(item.orderId) === String(orderId), current, false);
    if (!current() || !scan.done || scan.matches.length !== 1) return receipt;
    reviewId = scan.matches[0].reviewId;
  }
  const record = await fetchReviewDetail(reviewId);
  if (!current()) return receipt;
  if (String(record.reviewId) !== String(reviewId) || !matchesReview(record, receipt, userId)) throw new Error('原评价与本次评分、内容、图片或归属不一致，请查看评价记录核对');
  return save(userId, { ...receipt, reviewId, state: 'verified', observed: receipt.observed || receipt.state === 'unknown' });
}

/** 新提交先重读原资格页；结果未知时只能按服务端订单幂等语义重试原请求。 */
export async function submitReviewWithReceipt(params: Api.RealReview.ReviewSubmitParams, expected: Api.RealReview.ReviewableOrderVO | undefined,
  qualificationPage: number | undefined, stillActive: () => boolean, retryAttempt?: string) {
  const request = clone({ ...params, content: params.content || '', images: params.images || [], anonymous: params.anonymous ?? false });
  validateRequest(request);
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => !!token && token === getAccessToken() && userId === useUserStore().realUserId && stillActive();
  if (!userId || !current()) throw new Error('评价页面或账号已变化');
  const lock = operationKey(userId, request.orderId);
  if (running.has(lock)) throw new Error('原评价正在处理');
  const previous = readReviewCreateReceipts(userId).find(r => String(r.request.orderId) === String(request.orderId));
  if (retryAttempt ? !previous || previous.attempt !== retryAttempt || previous.state !== 'unknown' || JSON.stringify(previous.request) !== JSON.stringify(request) : !!previous) throw new Error('请核对原评价，不要修改内容后重复提交');
  expected = expected ? clone(expected) : undefined;
  running.add(lock);
  let marker: ReviewCreateReceipt | undefined, sent = false;
  try {
    if (retryAttempt) {
      const result = await uni.showModal({ title: '按原内容重试评价？', content: '仅重试原订单、评分、文字和图片；已受理时后台返回原评价，不会新建第二条。' });
      if (!result.confirm || !current()) return;
    }
    const order = await fetchOrderDetail(request.orderId, 'bought', userId);
    if (!current()) return;
    if (String(order.id) !== String(request.orderId) || orderRole(order, userId) !== 'customer' || order.rawStatus !== 'COMPLETED' || !validId(order.sellerId)) throw new Error('订单状态或归属变化，暂不能提交评价');
    if (previous) {
      if (String(order.sellerId) !== String(previous.sellerId) || String(order.productId ?? '') !== String(previous.productId ?? '')) throw new Error('原评价订单关联信息不一致');
      marker = previous;
    } else {
      if (!expected || String(expected.orderId) !== String(request.orderId) || !Number.isSafeInteger(qualificationPage) || qualificationPage! < 1) throw new Error('请先查询原订单的评价资格');
      const page = await fetchReviewableOrders({ pageNo: qualificationPage, pageSize: 50 });
      if (!current()) return;
      if (!Array.isArray(page.records) || !['number', 'string'].includes(typeof page.total) || !String(page.total).trim()
        || !Number.isSafeInteger(Number(page.total)) || Number(page.total) < page.records.length) throw new Error('评价资格响应不完整，请重新查询');
      const found = page.records.filter(item => String(item.orderId) === String(request.orderId));
      if (found.length !== 1 || String(found[0].sellerId) !== String(order.sellerId) || String(expected.sellerId) !== String(order.sellerId)
        || String(found[0].productId ?? '') !== String(order.productId ?? '') || String(expected.productId ?? '') !== String(order.productId ?? '')) throw new Error('评价资格或对象已变化，请重新查询后提交');
      marker = { attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, request, sellerId: order.sellerId!, productId: order.productId, state: 'unknown' };
    }
    // 每次发送前都验证持久快照；不会用当前表单覆盖原内容。
    const saved = save(userId, marker, true);
    if (saved.state !== 'unknown') return saved;
    sent = true;
    const reviewId = await createReview(marker.request);
    if (!validId(reviewId)) throw new Error('评价回执缺失，请核对原结果');
    return save(userId, { ...marker, reviewId, state: 'confirmed' });
  } catch (error) {
    if (!retryAttempt && sent && marker && error instanceof RequestError && error.kind === 'config') {
      try {
        const all = readReviewCreateReceipts(userId), saved = all.find(r => r.attempt === marker!.attempt);
        if (saved?.state === 'unknown') {
          const next = all.filter(r => r.attempt !== marker!.attempt);
          uni.setStorageSync(keyFor(userId), clone(next));
          if (JSON.stringify(readStored(userId)) !== JSON.stringify(next)) throw new Error();
          memory.set(userId, next);
        }
      } catch { /* 无法确认清理时保留原记录。 */ }
    }
    throw error;
  } finally { running.delete(lock); }
}

export function reviewCreateMessage(receipt: ReviewCreateReceipt) {
  if (receipt.state === 'unknown') return '评价提交结果未知，请核对原评价，或仅按原内容重试';
  if (receipt.state === 'confirmed') return '已收到原评价 ID，正在等待内容与归属核对';
  return receipt.observed ? '已找到与原提交一致的评价，请查看记录' : '已核对原评价，审核或展示状态以评价记录为准';
}
