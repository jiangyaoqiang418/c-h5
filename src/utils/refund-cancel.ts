import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { cancelRealRefund, fetchOrderDetail, fetchRealRefundDetail, orderRole } from '@/service/api/order';

export interface RefundCancelReceipt {
  refundId: Api.RealOrder.LongId;
  orderId: Api.RealOrder.LongId;
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
  terminalStatus?: Exclude<Api.RealOrder.RefundStatus, 'APPLYING'>;
}
const running = new Set<string>();
const keyFor = (userId: string) => `bw_h5_refund_cancel_v1:${encodeURIComponent(userId)}`;
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const terminals = ['CANCELED', 'AGREED', 'REJECTED'];

export function readRefundCancelReceipts(userId: string): RefundCancelReceipt[] {
  if (!userId) throw new Error('请先登录并加载账户资料');
  const stored = uni.getStorageSync(keyFor(userId));
  if (stored == null || stored === '') return [];
  if (!Array.isArray(stored) || stored.some(item => !item || !validId(item.refundId) || !validId(item.orderId)
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state)
    || (item.state === 'verified' && !terminals.includes(item.terminalStatus)))
    || new Set(stored.map(item => String(item.refundId))).size !== stored.length) throw new Error('本机撤销回执读取失败，请先核对记录');
  return stored;
}

function saveReceipt(userId: string, receipt: RefundCancelReceipt, remove = false) {
  const all = readRefundCancelReceipts(userId);
  const previous = all.find(item => String(item.refundId) === String(receipt.refundId));
  if (previous && previous.attempt !== receipt.attempt) throw new Error('已有其他撤销记录，请刷新核对');
  if (previous?.state === 'verified' || (previous?.state === 'confirmed' && (remove || receipt.state === 'unknown'))) return;
  const next = all.filter(item => String(item.refundId) !== String(receipt.refundId));
  if (!remove) next.push(receipt);
  uni.setStorageSync(keyFor(userId), next);
  const saved = readRefundCancelReceipts(userId).find(item => String(item.refundId) === String(receipt.refundId));
  if (remove ? !!saved : saved?.attempt !== receipt.attempt || saved?.state !== receipt.state
    || String(saved?.orderId) !== String(receipt.orderId) || saved?.terminalStatus !== receipt.terminalStatus) throw new Error('无法保存撤销回执，请先核对记录');
}

/** 先校验退款单，再校验关联订单；调用方只在整组成功后更新页面。 */
export async function fetchRefundContext(id: Api.RealOrder.LongId, userId: string, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!current() || !userId || !validId(id)) throw new Error('操作已失效，请重新进入');
  const refund = await fetchRealRefundDetail(id);
  if (!current()) throw new Error('操作已失效，请重新进入');
  if (!refund || String(refund.refundId) !== String(id) || !validId(refund.orderId)
    || !['APPLYING', ...terminals].includes(refund.status)) throw new Error('退款记录与请求不匹配，请刷新核对');
  const order = await fetchOrderDetail(refund.orderId);
  if (!current()) throw new Error('操作已失效，请重新进入');
  const role = orderRole(order, userId);
  if (String(order.id) !== String(refund.orderId) || !role
    || (refund.buyerId != null && String(refund.buyerId) !== String(order.customerId))
    || (refund.sellerId != null && String(refund.sellerId) !== String(order.sellerId))) throw new Error('退款关联订单或归属不匹配，请刷新核对');
  return { refund, order, role };
}

/** 两个入口共用同一把锁和持久回执；未知结果只能核对，不能自动重发。 */
export async function cancelRefundWithReceipt(expected: Api.RealOrder.OrderRefundDTO, stillActive: () => boolean) {
  const user = useUserStore();
  const userId = user.realUserId;
  const token = getAccessToken();
  const refundId = expected.refundId;
  const orderId = expected.orderId;
  const current = () => stillActive() && !!userId && userId === user.realUserId && token === getAccessToken();
  if (!userId || !current() || expected.status !== 'APPLYING' || !validId(refundId) || !validId(orderId)) throw new Error('退款状态或账号已变化');
  const lock = `${keyFor(userId)}:${String(refundId)}`;
  if (running.has(lock) || readRefundCancelReceipts(userId).some(item => String(item.refundId) === String(refundId))) throw new Error('已有撤销操作，请先刷新核对');
  running.add(lock);
  let marker: RefundCancelReceipt | undefined;
  let sent = false;
  try {
    const result = await uni.showModal({ title: '撤销仅退款申请？', content: '撤销后订单将恢复为申请前的状态。' });
    if (!result.confirm || !current()) return;
    const context = await fetchRefundContext(refundId, userId, current);
    if (!current()) return;
    if (String(context.refund.orderId) !== String(orderId) || context.refund.status !== 'APPLYING' || context.role !== 'customer') throw new Error('退款状态或归属已变化，请刷新核对');
    marker = { refundId, orderId, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
    saveReceipt(userId, marker);
    sent = true;
    const receiptId = await cancelRealRefund(refundId);
    if (!validId(receiptId) || String(receiptId) !== String(refundId)) throw new Error('撤销回执不匹配，请刷新核对');
    const receipt: RefundCancelReceipt = { ...marker, state: 'confirmed' };
    try { saveReceipt(userId, receipt); } catch { /* 已成功；保留原未知标记与本次回执，不允许重发。 */ }
    return receipt;
  } catch (error) {
    if (sent && marker && error instanceof RequestError && (error.kind === 'business' || error.kind === 'config')) {
      try { saveReceipt(userId, marker, true); } catch { /* 清理失败保守保留待核对状态。 */ }
    }
    throw error;
  } finally { running.delete(lock); }
}

export async function reconcileRefundCancels(userId: string, stillActive: () => boolean, onlyId?: Api.RealOrder.LongId) {
  for (const receipt of readRefundCancelReceipts(userId)) {
    if (!stillActive()) return;
    if (receipt.state === 'verified' || (onlyId != null && String(receipt.refundId) !== String(onlyId))) continue;
    try {
      const context = await fetchRefundContext(receipt.refundId, userId, stillActive);
      if (!stillActive()) return;
      if (context.role !== 'customer' || String(context.refund.orderId) !== String(receipt.orderId)
        || context.refund.status === 'APPLYING') continue;
      // 成功撤销却回读其他终态是冲突，不能把它当作正常撤销完成。
      if (receipt.state === 'confirmed' && context.refund.status !== 'CANCELED') continue;
      saveReceipt(userId, { ...receipt, state: 'verified', terminalStatus: context.refund.status });
    } catch { /* 详情失败、无权读取、ID 不符等均保留原记录，不根据列表缺席推断成功。 */ }
  }
}

export function refundCancelMessage(receipt?: RefundCancelReceipt) {
  if (!receipt) return '';
  if (receipt.state === 'unknown') return '撤销结果尚未确认，请刷新核对，不要重复提交';
  if (receipt.state === 'confirmed') return '撤销请求已成功，请刷新核对最新状态';
  return receipt.terminalStatus === 'CANCELED' ? '已核对：退款申请已撤销'
    : '已核对：申请已进入审核终态，不代表本次撤销成功';
}
