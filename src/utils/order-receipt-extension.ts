import { extendRealOrderReceipt, fetchOrderDetail, orderRole } from '@/service/api/order';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { acquireOrderOperation, validOrderId } from './order-operation-state';
import { assertRefundAllowsOrderChange } from './refund-create';
import { isMissingOperationRecord } from './storage';

interface ExtensionReceipt { count: number; deadline: string; attempt: string }
const keyFor = (userId: string, id: string | number) => `bw_h5_receipt_extension_v1:${encodeURIComponent(userId)}:${encodeURIComponent(String(id))}`;
function read(key: string): ExtensionReceipt | undefined {
  const value = uni.getStorageSync(key);
  if (isMissingOperationRecord(key, value)) return;
  if (!value || !Number.isSafeInteger(value.count) || value.count < 0 || typeof value.deadline !== 'string' || !value.deadline
    || typeof value.attempt !== 'string' || !value.attempt) throw new Error('延长收货记录无法读取，请先核对订单');
  return value;
}
function clear(key: string, receipt: ExtensionReceipt) {
  if (read(key)?.attempt !== receipt.attempt) throw new Error('延长收货记录已变化，请重新核对');
  uni.removeStorageSync(key);
  if (read(key)) throw new Error('延长收货记录清理失败，请重新核对');
}

/** 请求结果未知时只核对原订单，不重复延长；与付款、取消、收货共用锁。 */
export async function extendOrderReceipt(expected: Api.RealOrder.OrderView, stillActive: () => boolean) {
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => stillActive() && !!userId && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!userId || !validOrderId(expected.id) || !current()) throw new Error('订单页面或账号已变化');
  const release = acquireOrderOperation(userId, expected.id, expected.orderGroupNo);
  const key = keyFor(userId, expected.id);
  try {
    const latest = await fetchOrderDetail(expected.id, 'bought', userId);
    if (!current()) return;
    if (String(latest.id) !== String(expected.id) || orderRole(latest, userId) !== 'customer') throw new Error('订单归属已变化');
    const previous = read(key);
    if (previous) {
      if (latest.receiveExtendCount != null && latest.receiveExtendCount > previous.count
        && latest.autoConfirmAt != null && Number(latest.autoConfirmAt) > Number(previous.deadline)) {
        clear(key, previous); return { recovered: true };
      }
      if (latest.rawStatus !== 'SHIPPED') { clear(key, previous); throw new Error('订单状态已变化，请刷新核对'); }
      throw new Error('上次延长结果尚未确认，请刷新订单核对，暂不重复提交');
    }
    if (latest.rawStatus !== 'SHIPPED' || latest.receiveExtendable !== true || latest.autoConfirmAt == null
      || !Number.isSafeInteger(latest.receiveExtendCount) || latest.receiveExtendCount! < 0 || latest.receiveExtendCount! >= 5 || !Number.isSafeInteger(Number(latest.autoConfirmAt))
      || Number(latest.autoConfirmAt) <= Date.now()) throw new Error('当前订单不能延长收货，请刷新核对');
    await assertRefundAllowsOrderChange(latest.id, userId, current);
    if (!current()) return;
    const answer = await uni.showModal({ title: '延长收货？', content: '自动收货时间将顺延5天，每笔订单最多延长5次。', confirmText: '确认延长' });
    if (!answer.confirm || !current()) return;
    const before = await fetchOrderDetail(latest.id, 'bought', userId);
    if (!current()) return;
    if (String(before.id) !== String(latest.id) || orderRole(before, userId) !== 'customer' || before.rawStatus !== 'SHIPPED'
      || before.receiveExtendable !== true || before.receiveExtendCount !== latest.receiveExtendCount
      || String(before.autoConfirmAt) !== String(latest.autoConfirmAt) || Number(before.autoConfirmAt) <= Date.now()) throw new Error('收货条件已变化，请重新确认');
    const marker: ExtensionReceipt = { count: latest.receiveExtendCount!, deadline: String(latest.autoConfirmAt), attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    uni.setStorageSync(key, marker);
    if (JSON.stringify(read(key)) !== JSON.stringify(marker)) throw new Error('延长记录无法保存，已停止提交');
    try {
      const result = await extendRealOrderReceipt(latest.id);
      if (!validOrderId(result) || String(result) !== String(latest.id)) throw new Error('延长收货回执不完整，请刷新订单核对');
      clear(key, marker);
      return { recovered: false };
    } catch (error) {
      if (error instanceof RequestError && error.kind === 'config') clear(key, marker);
      throw error;
    }
  } finally { release(); }
}
