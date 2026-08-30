import { cancelRealOrder, confirmRealOrder, fetchOrderDetail, orderRole } from '@/service/api/order';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { readPaymentReceipts } from './order-payment';
import { assertRefundAllowsOrderChange } from './refund-create';
import { acquireOrderOperation, orderChangeBefore, orderChangeBlocks, orderChangeTarget, readOrderChangeReceipts, removeRejectedOrderChange, retainOrderChangeReceipt, saveOrderChangeReceipt, validOrderId, type OrderChangeReceipt } from './order-operation-state';

export { readOrderChangeReceipts, orderChangeBlocks, type OrderChangeReceipt } from './order-operation-state';

/** 沿用顾客侧现有入口，不因取消契约同时允许卖家而扩展 UI。 */
export async function changeOrderWithReceipt(expected: Api.RealOrder.OrderView, action: OrderChangeReceipt['action'], stillActive: () => boolean) {
  expected = { ...expected };
  const user = useUserStore(), userId = user.realUserId, token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === user.realUserId;
  if (!userId || !current() || !validOrderId(expected.id) || expected.rawStatus !== orderChangeBefore(action)
    || orderRole(expected, userId) !== 'customer') throw new Error('订单状态或归属已变化');
  const assertAvailable = () => {
    const receipts = readOrderChangeReceipts(userId);
    if (orderChangeBlocks(expected, receipts) || receipts.some(item => String(item.orderId) === String(expected.id) && item.action === action)) {
      throw new Error('已有订单操作回执，请先核对状态');
    }
    if (action === 'cancel' && readPaymentReceipts(userId).some(item => item.orderGroupNo === expected.orderGroupNo)) {
      throw new Error('该订单组已有付款结果，请先核对，不要取消');
    }
  };
  assertAvailable();
  const release = acquireOrderOperation(userId, expected.id, expected.orderGroupNo);
  let marker: OrderChangeReceipt | undefined, sent = false;
  try {
    await assertRefundAllowsOrderChange(expected.id, userId, current);
    if (!current()) return;
    const result = await uni.showModal({ title: action === 'cancel' ? '取消订单？' : '确认收货？' });
    if (!result.confirm || !current()) return;
    await assertRefundAllowsOrderChange(expected.id, userId, current);
    if (!current()) return;
    const latest = await fetchOrderDetail(expected.id, 'bought', userId);
    if (!current()) return;
    if (String(latest.id) !== String(expected.id) || latest.rawStatus !== orderChangeBefore(action)
      || latest.orderGroupNo !== expected.orderGroupNo || orderRole(latest, userId) !== 'customer') throw new Error('订单状态或归属已变化，请刷新核对');
    assertAvailable();
    marker = { orderId: expected.id, orderGroupNo: expected.orderGroupNo || undefined, action, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
    saveOrderChangeReceipt(userId, marker, true);
    sent = true;
    const receiptId = action === 'cancel' ? await cancelRealOrder({ id: expected.id, reason: '顾客取消' }) : await confirmRealOrder(expected.id);
    if (!validOrderId(receiptId) || String(receiptId) !== String(expected.id)) throw new Error('订单操作回执缺失或不匹配，请核对原订单');
    return retainOrderChangeReceipt(userId, { ...marker, state: 'confirmed' });
  } catch (error) {
    // 收货包含结算，取消包含库存回补；契约未声明这些步骤原子化。
    // 请求层配置错误可证明尚未发送，服务端业务错误仍须回读，不能据此重发。
    if (sent && marker && error instanceof RequestError && error.kind === 'config') {
      try { removeRejectedOrderChange(userId, marker); } catch { /* 无法清理时保守保留未知保护。 */ }
    }
    throw error;
  } finally { release(); }
}

export async function reconcileOrderChange(userId: string, receipt: OrderChangeReceipt, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!current()) return;
  const saved = readOrderChangeReceipts(userId).find(item => String(item.orderId) === String(receipt.orderId) && item.action === receipt.action);
  if (!saved || saved.attempt !== receipt.attempt || saved.state === 'verified') return saved;
  try {
    const order = await fetchOrderDetail(saved.orderId, 'bought', userId);
    if (!current() || String(order.id) !== String(saved.orderId) || (order.orderGroupNo || undefined) !== saved.orderGroupNo
      || orderRole(order, userId) !== 'customer') return saved;
    const target = orderChangeTarget(saved.action);
    if (saved.state === 'confirmed' && order.rawStatus !== target) return saved;
    const finalStates = saved.action === 'cancel' ? ['PAID', 'SHIPPED', 'REFUND_REVIEW', 'REFUNDED', 'COMPLETED', 'CANCELED'] : ['COMPLETED', 'REFUNDED', 'CANCELED'];
    if (!finalStates.includes(order.rawStatus)) return saved;
    return retainOrderChangeReceipt(userId, { ...saved, state: 'verified', observedStatus: order.rawStatus });
  } catch { return saved; }
}

export function orderChangeMessage(receipt: OrderChangeReceipt) {
  const label = receipt.action === 'cancel' ? '取消订单' : '确认收货';
  if (receipt.state === 'unknown') return `${label}结果尚未确认，请核对原订单，不要重复操作`;
  if (receipt.state === 'confirmed') return `${label}请求已成功，订单最新状态待核对`;
  if (receipt.observedStatus === orderChangeTarget(receipt.action)) return receipt.action === 'cancel' ? '已核对：订单已取消' : '已核对：订单已完成';
  return `已核对：订单状态已变化，不代表本次${label}成功`;
}
