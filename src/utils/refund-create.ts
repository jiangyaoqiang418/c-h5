import { createRealRefund, fetchBoughtRefunds, fetchOrderDetail, orderRole } from '@/service/api/order';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { normalizeAmount } from './amount';
import { acquireOrderOperation, orderChangeBlocks, readOrderChangeReceipts } from './order-operation-state';
import { fetchRefundContext, readRefundCancelReceipts, reconcileRefundCancels } from './refund-cancel';

export interface RefundCreateReceipt {
  orderId: Api.RealOrder.LongId;
  orderNo?: string;
  orderGroupNo?: string;
  sellerId: Api.RealOrder.LongId;
  amount: string;
  reason: string;
  beforeIds: string[];
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
  refundId?: Api.RealOrder.LongId;
  refundStatus?: Api.RealOrder.RefundStatus;
  observed?: boolean;
}
const memory = new Map<string, RefundCreateReceipt[]>();
const keyFor = (userId: string) => `bw_h5_refund_create_v1:${encodeURIComponent(userId)}`;
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const statuses = ['APPLYING', 'CANCELED', 'REJECTED', 'AGREED'];
const terminal = (status?: string) => !!status && status !== 'APPLYING' && statuses.includes(status);
function refundAmount(value: Api.RealOrder.OrderRefundDTO['amount']) {
  if (value == null) throw new Error('退款记录缺少金额，无法核对原申请');
  return normalizeAmount(value);
}
const origin = (receipt: RefundCreateReceipt) => JSON.stringify([String(receipt.orderId), receipt.orderNo, receipt.orderGroupNo,
  String(receipt.sellerId), receipt.amount, receipt.reason, receipt.beforeIds]);

export function refundCreationBlocks(orderId: Api.RealOrder.LongId, receipts: RefundCreateReceipt[]) {
  return receipts.some(item => String(item.orderId) === String(orderId)
    && !(item.state === 'verified' && ['CANCELED', 'REJECTED'].includes(item.refundStatus!)));
}

function readStored(userId: string): RefundCreateReceipt[] {
  if (!userId) throw new Error('请先登录并读取账户资料');
  const records = uni.getStorageSync(keyFor(userId));
  if (records == null || records === '') return [];
  if (!Array.isArray(records) || records.some(item => !item || !validId(item.orderId) || !validId(item.sellerId)
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state)
    || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 512
    || typeof item.amount !== 'string' || normalizeAmount(item.amount) !== item.amount
    || (item.orderNo != null && (typeof item.orderNo !== 'string' || !item.orderNo.trim()))
    || (item.orderGroupNo != null && (typeof item.orderGroupNo !== 'string' || !item.orderGroupNo.trim()))
    || !Array.isArray(item.beforeIds) || item.beforeIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
    || new Set(item.beforeIds).size !== item.beforeIds.length || (item.refundId != null && !validId(item.refundId))
    || (item.state !== 'unknown' && (!validId(item.refundId) || item.beforeIds.includes(String(item.refundId))))
    || (item.state === 'verified' && !statuses.includes(item.refundStatus)) || (item.observed != null && typeof item.observed !== 'boolean'))
    || new Set(records.map(item => String(item.orderId))).size !== records.length) throw new Error('本机退款申请记录损坏，请先核对，不要重提');
  return records;
}

export function readRefundCreateReceipts(userId: string): RefundCreateReceipt[] {
  const all = new Map(readStored(userId).map(item => [String(item.orderId), item]));
  for (const cached of memory.get(userId) || []) {
    const stored = all.get(String(cached.orderId));
    if (stored && stored.attempt !== cached.attempt && !(cached.state === 'verified' && terminal(cached.refundStatus))) throw new Error('退款申请记录冲突，请先核对');
    if (stored?.attempt === cached.attempt && (origin(stored) !== origin(cached)
      || (stored.refundId != null && cached.refundId != null && String(stored.refundId) !== String(cached.refundId))
      || (terminal(stored.refundStatus) && terminal(cached.refundStatus) && stored.refundStatus !== cached.refundStatus))) throw new Error('原退款申请快照冲突，请先核对');
    if (!stored || (stored.attempt === cached.attempt && (rank[cached.state] > rank[stored.state]
      || (terminal(cached.refundStatus) && !terminal(stored.refundStatus))))) all.set(String(cached.orderId), cached);
  }
  return JSON.parse(JSON.stringify([...all.values()]));
}

function save(userId: string, receipt: RefundCreateReceipt, beforeSend = false) {
  const all = readRefundCreateReceipts(userId);
  const previous = all.find(item => String(item.orderId) === String(receipt.orderId));
  // 旧申请的迟到回读不得覆盖同订单刚刚发出的新申请。
  if (!beforeSend && previous && previous.attempt !== receipt.attempt) return previous;
  if (previous && previous.attempt !== receipt.attempt && !(previous.state === 'verified' && ['CANCELED', 'REJECTED'].includes(previous.refundStatus!))) throw new Error('原退款申请尚未结束，请先核对');
  if (previous?.attempt === receipt.attempt && (rank[previous.state] > rank[receipt.state]
    || (terminal(previous.refundStatus) && previous.refundStatus !== receipt.refundStatus))) return previous;
  const next = [...all.filter(item => String(item.orderId) !== String(receipt.orderId)), receipt];
  if (!beforeSend) memory.set(userId, next);
  try {
    uni.setStorageSync(keyFor(userId), JSON.parse(JSON.stringify(next)));
    const stored = readStored(userId).find(item => String(item.orderId) === String(receipt.orderId));
    if (JSON.stringify(stored) !== JSON.stringify(receipt)) throw new Error();
    memory.set(userId, next);
  } catch { if (beforeSend) throw new Error('无法保存退款申请进度，本次未提交'); }
  return receipt;
}

function retain(userId: string, receipt: RefundCreateReceipt) {
  try { return save(userId, receipt); } catch {
    const all = memory.get(userId) || [], previous = all.find(item => String(item.orderId) === String(receipt.orderId));
    if (previous && previous.attempt !== receipt.attempt) return previous;
    if (previous?.attempt === receipt.attempt && (rank[previous.state] > rank[receipt.state] || terminal(previous.refundStatus))) return previous;
    memory.set(userId, [...all.filter(item => String(item.orderId) !== String(receipt.orderId)), receipt]);
    return receipt;
  }
}

/** 订单变更前核对原售后，不用仍为 SHIPPED 的订单快照解除未知申请保护。 */
export async function assertRefundAllowsOrderChange(orderId: Api.RealOrder.LongId, userId: string, stillActive: () => boolean) {
  const receipt = await reconcileRefundCreation(orderId, userId, stillActive);
  if (!stillActive()) return;
  if (receipt && refundCreationBlocks(orderId, [receipt])) throw new Error('原退款申请尚未结束，请先核对售后，不要确认收货');
  for (const cancel of readRefundCancelReceipts(userId).filter(item => String(item.orderId) === String(orderId) && item.state !== 'verified')) {
    await reconcileRefundCancels(userId, stillActive, cancel.refundId);
    if (!stillActive()) return;
  }
  if (readRefundCancelReceipts(userId).some(item => String(item.orderId) === String(orderId)
    && (item.state !== 'verified' || item.terminalStatus === 'AGREED'))) throw new Error('原退款结果尚未解除，请先核对售后');
}

async function findOrderRefunds(orderId: Api.RealOrder.LongId, orderNo: string | undefined, current: () => boolean) {
  const matches: Api.RealOrder.OrderRefundDTO[] = [], seen = new Set<string>();
  let expectedTotal: number | undefined;
  for (let pageNo = 1; ; pageNo++) {
    if (!current()) throw new Error('退款页面或账号已变化');
    const result = await fetchBoughtRefunds({ pageNo, pageSize: 50, orderNo });
    if (!current()) throw new Error('退款页面或账号已变化');
    const total = Number(result.total);
    if (!['number', 'string'].includes(typeof result.total) || String(result.total).trim() === '' || !Number.isSafeInteger(total)
      || total < 0 || !Array.isArray(result.records) || (expectedTotal != null && expectedTotal !== total)) throw new Error('退款列表范围不完整或已变化，请重新核对');
    expectedTotal = total;
    for (const refund of result.records) {
      if (!validId(refund.refundId) || !validId(refund.orderId) || seen.has(String(refund.refundId))) throw new Error('退款分页存在缺失或重复记录，请重新核对');
      seen.add(String(refund.refundId));
      if (orderNo && (refund.orderNo !== orderNo || String(refund.orderId) !== String(orderId))) throw new Error('退款查询返回了其他订单，已停止操作');
      if (String(refund.orderId) === String(orderId)) {
        if (!statuses.includes(refund.status)) throw new Error('退款状态无法确认');
        matches.push(refund);
      }
    }
    if (seen.size > total) throw new Error('退款分页总数不一致');
    if (seen.size === total) return matches;
    if (!result.records.length) throw new Error('退款分页未完整读取，请重试');
  }
}

export async function reconcileRefundCreation(orderId: Api.RealOrder.LongId, userId: string, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  const receipt = readRefundCreateReceipts(userId).find(item => String(item.orderId) === String(orderId));
  if (!receipt || !current()) return receipt;
  let refundId = receipt.refundId;
  if (refundId == null) {
    const records = await findOrderRefunds(orderId, receipt.orderNo, current);
    const matches = records.filter(item => !receipt.beforeIds.includes(String(item.refundId)) && item.reason === receipt.reason
      && refundAmount(item.amount) === receipt.amount);
    if (matches.length !== 1) return receipt;
    refundId = matches[0].refundId;
  }
  const context = await fetchRefundContext(refundId, userId, current);
  if (!current()) return receipt;
  const refund = context.refund;
  if (context.role !== 'customer' || String(refund.orderId) !== String(orderId) || receipt.beforeIds.includes(String(refund.refundId))
    || (receipt.orderNo && refund.orderNo !== receipt.orderNo) || context.order.orderGroupNo !== receipt.orderGroupNo
    || String(context.order.sellerId) !== String(receipt.sellerId) || refundAmount(refund.amount) !== receipt.amount
    || refund.reason !== receipt.reason || refund.refundType !== 'REFUND_ONLY') throw new Error('退款申请与原订单、金额或原因不符，请核对');
  if (terminal(receipt.refundStatus) && refund.status !== receipt.refundStatus) throw new Error('退款终态与之前核对结果冲突，请稍后重试');
  return retain(userId, { ...receipt, refundId, state: 'verified', refundStatus: refund.status, observed: receipt.observed || receipt.state === 'unknown' });
}

export async function createRefundWithReceipt(expected: Api.RealOrder.OrderView, reason: string, stillActive: () => boolean) {
  expected = { ...expected };
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  reason = reason.trim();
  if (!userId || !current() || !validId(expected.id) || !validId(expected.sellerId) || !reason || reason.length > 512
    || orderRole(expected, userId) !== 'customer' || !['PAID', 'SHIPPED'].includes(expected.rawStatus)) throw new Error('请核对订单资格和退款原因');
  const release = acquireOrderOperation(userId, expected.id, expected.orderGroupNo);
  let marker: RefundCreateReceipt | undefined;
  let sent = false;
  try {
    const previous = await reconcileRefundCreation(expected.id, userId, current);
    if (!current()) return;
    if (previous && !(previous.state === 'verified' && ['CANCELED', 'REJECTED'].includes(previous.refundStatus!))) throw new Error('上次退款申请尚未结束，请先查看原申请');
    for (const cancel of readRefundCancelReceipts(userId).filter(item => String(item.orderId) === String(expected.id) && item.state !== 'verified')) {
      await reconcileRefundCancels(userId, current, cancel.refundId);
    }
    if (!current()) return;
    if (readRefundCancelReceipts(userId).some(item => String(item.orderId) === String(expected.id) && item.state !== 'verified')) throw new Error('原退款撤销结果待核对，请勿重新申请');
    const records = await findOrderRefunds(expected.id, expected.orderNo, current);
    if (records.some(item => item.status === 'APPLYING' || item.status === 'AGREED')) throw new Error('该订单已有待审核或已同意申请，请查看售后列表');
    const latest = await fetchOrderDetail(expected.id);
    if (!current()) return;
    if (String(latest.id) !== String(expected.id) || orderRole(latest, userId) !== 'customer' || latest.rawStatus !== expected.rawStatus
      || latest.orderNo !== expected.orderNo || latest.orderGroupNo !== expected.orderGroupNo || String(latest.sellerId) !== String(expected.sellerId)
      || normalizeAmount(latest.totalAmount) !== normalizeAmount(expected.totalAmount) || orderChangeBlocks(latest, readOrderChangeReceipts(userId))) throw new Error('订单状态、归属或金额已变化，请刷新后重新确认');
    marker = { orderId: expected.id, orderNo: expected.orderNo, orderGroupNo: expected.orderGroupNo, sellerId: expected.sellerId!,
      amount: normalizeAmount(expected.totalAmount), reason, beforeIds: records.map(item => String(item.refundId)),
      attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
    save(userId, marker, true);
    sent = true;
    const refundId = await createRealRefund({ orderId: expected.id, reason });
    if (!validId(refundId) || marker.beforeIds.includes(String(refundId))) throw new Error('退款创建回执缺失或指向旧申请，请先核对');
    return retain(userId, { ...marker, refundId, state: 'confirmed' });
  } catch (error) {
    if (sent && marker && error instanceof RequestError && error.kind === 'config') {
      try {
        const all = readRefundCreateReceipts(userId);
        const next = all.filter(item => item.attempt !== marker!.attempt);
        uni.setStorageSync(keyFor(userId), next);
        if (!readStored(userId).some(item => item.attempt === marker!.attempt)) memory.set(userId, next);
      } catch { /* 存储异常继续保留原未知标记。 */ }
    }
    throw error;
  } finally { release(); }
}

export function refundCreateMessage(receipt: RefundCreateReceipt) {
  if (receipt.state === 'unknown') return '退款申请结果未知，请核对原订单申请，本机已阻止重复提交';
  if (receipt.state === 'confirmed') return '退款申请请求已成功，原申请详情待核对';
  const status = { APPLYING: '待审核', CANCELED: '已撤销', REJECTED: '已驳回', AGREED: '已同意' }[receipt.refundStatus!];
  return `${receipt.observed ? '已找到与原请求一致的新申请' : '已核对原退款申请'}：${status}`;
}
