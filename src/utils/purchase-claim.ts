import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { claimRequest, fetchPurchaseDetail } from '@/service/api/purchase';
import { fetchOrderDetail, orderRole } from '@/service/api/order';
import { normalizeAmount } from './amount';

export interface ClaimReceipt {
  demandId: string | number;
  attempt: string;
  state: 'unknown' | 'confirmed';
  orderId?: string | number;
}

const running = new Set<string>();
const keyFor = (userId: string) => `bw_h5_claim_receipts_v1:${encodeURIComponent(userId)}`;
const validId = (id: unknown) => (typeof id === 'string' && !!id.trim()) || (typeof id === 'number' && Number.isFinite(id));

export function readClaimReceipts(userId: string): ClaimReceipt[] {
  if (!userId) throw new Error('请先登录并加载账户资料');
  const stored = uni.getStorageSync(keyFor(userId));
  if (!stored) return [];
  if (!Array.isArray(stored) || stored.some(item => !item || !validId(item.demandId)
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed'].includes(item.state)
    || (item.state === 'confirmed' && !validId(item.orderId)))) throw new Error('本机接单回执读取失败，请先核对记录；未创建新请求');
  return stored;
}

function saveReceipt(userId: string, receipt: ClaimReceipt, remove = false) {
  const all = readClaimReceipts(userId);
  const prior = all.find(item => String(item.demandId) === String(receipt.demandId));
  if (prior && prior.attempt !== receipt.attempt) throw new Error('已有其他接单回执，请刷新核对');
  if (prior?.state === 'confirmed' && (remove || receipt.state === 'unknown')) return;
  const next = all.filter(item => String(item.demandId) !== String(receipt.demandId));
  if (!remove) next.push(receipt);
  uni.setStorageSync(keyFor(userId), next);
  const saved = readClaimReceipts(userId).find(item => String(item.demandId) === String(receipt.demandId));
  if (remove ? !!saved : saved?.attempt !== receipt.attempt || saved?.state !== receipt.state
    || (receipt.state === 'confirmed' && String(saved?.orderId) !== String(receipt.orderId))) throw new Error('无法保存接单回执，请先核对记录');
}

function terms(request: Api.PurchaseRequest.PurchaseRequest) {
  return JSON.stringify([request.productTitle, request.productDescription, String(request.categoryId), normalizeAmount(request.budgetAmount),
    request.expectedDays, request.overseasCustoms, request.aftersaleType, request.appeal, request.evidenceUrls]);
}

/** 大厅和详情共用；未知结果只核对，不自动再次抢单。 */
export async function claimPurchase(expected: Api.PurchaseRequest.PurchaseRequest, stillActive: () => boolean) {
  const user = useUserStore();
  const userId = user.realUserId;
  const demandId = expected.id;
  const expectedTerms = terms(expected);
  const token = getAccessToken();
  const current = () => stillActive() && !!userId && userId === user.realUserId && token === getAccessToken();
  const eligible = () => user.currentUser?.isBuyer && user.currentUser.kycStatus === 'approved' && user.isBuyerActive;
  if (!userId || !current()) throw new Error('操作已失效，请重新进入');
  const lock = `${keyFor(userId)}:${encodeURIComponent(String(demandId))}`;
  if (running.has(lock)) throw new Error('该求购正在接单，请勿重复操作');
  if (expected.status !== 'pushing' || readClaimReceipts(userId).some(item => String(item.demandId) === String(demandId))) throw new Error('该求购状态已变化或已有接单回执，请先核对记录');
  running.add(lock);
  let marker: ClaimReceipt | undefined;
  let sent = false;
  try {
    await user.refreshProfile();
    if (!current()) throw new Error('操作已失效，请重新确认');
    if (!eligible()) throw new Error('当前账号不具备接单资格，请刷新身份');
    const latest = (await fetchPurchaseDetail(demandId)).request;
    if (!current()) throw new Error('操作已失效，请重新确认');
    if (!eligible()) throw new Error('当前账号身份已变化，请重新确认');
    if (String(latest.id) !== String(demandId) || latest.status !== 'pushing' || String(latest.customerId) === userId) throw new Error('求购状态或归属已变化，请刷新核对');
    if (terms(latest) !== expectedTerms) throw new Error('求购预算或要求已变化，请刷新后重新接单');
    marker = { demandId, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
    saveReceipt(userId, marker);
    sent = true;
    const result = await claimRequest(demandId);
    if (!validId(result.orderId)) throw new Error('接单回执缺失，请核对求购和订单记录');
    const receipt: ClaimReceipt = { ...marker, state: 'confirmed', orderId: result.orderId };
    try { saveReceipt(userId, receipt); } catch { /* 本次返回成功仍有效；原未知记录保留防重。 */ }
    return receipt;
  } catch (error) {
    if (sent && marker && error instanceof RequestError && (error.kind === 'business' || error.kind === 'config')) {
      try { saveReceipt(userId, marker, true); } catch { /* 保留记录，禁止不确定的重复操作。 */ }
    }
    throw error;
  } finally { running.delete(lock); }
}

export async function reconcileClaimReceipts(userId: string, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && token === getAccessToken();
  for (const receipt of readClaimReceipts(userId)) {
    if (!current()) return;
    if (receipt.state === 'confirmed') continue;
    try {
      const request = (await fetchPurchaseDetail(receipt.demandId)).request;
      if (!current()) return;
      if (String(request.id) !== String(receipt.demandId) || request.status !== 'claimed' || request.relatedOrderId == null) continue;
      const order = await fetchOrderDetail(request.relatedOrderId);
      if (!current()) return;
      if (String(order.id) !== String(request.relatedOrderId) || orderRole(order, userId) !== 'seller') continue;
      saveReceipt(userId, { ...receipt, state: 'confirmed', orderId: order.id });
    } catch { /* 无权读取、仍待接单或详情失败均不能确认本账号接单成功。 */ }
  }
}
