import { fetchOrderDetail, fetchOrderGroupPayResult, fetchPendingOrderGroup, orderRole, payRealOrderGroup } from '@/service/api/order';
import { RequestError } from '@/service/request';
import { getAccessToken } from '@/service/request/token';
import { useUserStore } from '@/stores';
import { amountToRaw, compareAmounts, normalizeAmount, sumAmounts } from './amount';
import { isMissingOperationRecord } from './storage';
import { acquireOrderOperation, orderChangeBlocks, readOrderChangeReceipts } from './order-operation-state';
import { createWalletPay, fetchLatestWalletPay, fetchWalletPayChains, validateWalletPay } from '@/service/api/wallet-pay';
import { readPendingCheckouts, savePendingCheckout } from './checkout-progress';

export interface PaymentReceipt {
  orderGroupNo: string;
  attempt: string;
  orders: Array<{ id: string; amount: string }>;
  state: 'unknown' | 'confirmed' | 'verified';
  paidCount?: number;
  result?: Api.RealOrder.OrderGroupPayResult;
  currentResult?: Api.RealOrder.OrderGroupPayResult;
  retryable?: boolean;
  amountChanged?: boolean;
  history?: Array<Pick<PaymentReceipt, 'attempt' | 'orders' | 'paidCount' | 'result'>>;
}

const memory = new Map<string, PaymentReceipt[]>();
const ranks = { unknown: 0, confirmed: 1, verified: 2 };
const keyFor = (userId: string) => `bw_h5_group_payment_v1:${encodeURIComponent(userId)}`;
const validId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
const snapshot = (receipt: PaymentReceipt) => JSON.stringify(receipt.orders);

function readStored(userId: string): PaymentReceipt[] {
  if (!userId) throw new Error('请先登录并加载账户资料');
  const stored = uni.getStorageSync(keyFor(userId));
  if (isMissingOperationRecord(keyFor(userId), stored)) return [];
  try {
    if (!Array.isArray(stored) || stored.some(item => !item || typeof item.orderGroupNo !== 'string' || !item.orderGroupNo.trim()
      || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state)
      || (item.paidCount != null && (typeof item.paidCount !== 'number' || !Number.isSafeInteger(item.paidCount) || item.paidCount < 0))
      || (item.state === 'confirmed' && item.paidCount == null)
      || (item.retryable != null && typeof item.retryable !== 'boolean')
      || (item.retryable && !item.currentResult)
      || !Array.isArray(item.orders) || !item.orders.length
      || item.orders.some((order: PaymentReceipt['orders'][number]) => !order || typeof order.id !== 'string' || !order.id.trim()
        || typeof order.amount !== 'string' || normalizeAmount(order.amount) !== order.amount)
      || new Set(item.orders.map((order: PaymentReceipt['orders'][number]) => order.id)).size !== item.orders.length)
      || new Set(stored.map(item => item.orderGroupNo)).size !== stored.length) throw new Error();
    stored.forEach(item => {
      if (item.result) validatePayResult(item.result, item.orderGroupNo);
      if (item.currentResult) validatePayResult(item.currentResult, item.orderGroupNo);
      if (item.history != null && !Array.isArray(item.history)) throw new Error();
    });
    return stored;
  } catch { throw new Error('本机付款回执损坏，请先核对订单，不要重复付款'); }
}

/** 持久记录保证重进后仍可核对；内存保留写后存储失败时更强的成功回执。 */
export function readPaymentReceipts(userId: string): PaymentReceipt[] {
  const all = new Map(readStored(userId).map(item => [item.orderGroupNo, item]));
  for (const receipt of memory.get(userId) || []) {
    const saved = all.get(receipt.orderGroupNo);
    if (saved && (saved.attempt !== receipt.attempt || snapshot(saved) !== snapshot(receipt))) throw new Error('本机付款回执冲突，请先核对订单');
    if (!saved || ranks[receipt.state] >= ranks[saved.state]) all.set(receipt.orderGroupNo, receipt);
  }
  return JSON.parse(JSON.stringify([...all.values()]));
}

function saveReceipt(userId: string, receipt: PaymentReceipt, beforeSend = false) {
  const all = readPaymentReceipts(userId);
  const previous = all.find(item => item.orderGroupNo === receipt.orderGroupNo);
  if (!beforeSend && previous && previous.attempt !== receipt.attempt) return previous;
  const replacing = beforeSend && previous?.retryable && previous.attempt !== receipt.attempt;
  if (previous && !replacing && (previous.attempt !== receipt.attempt || snapshot(previous) !== snapshot(receipt))) throw new Error('已有其他付款记录，请先核对');
  if (previous && !replacing && ranks[previous.state] > ranks[receipt.state]) return previous;
  const next = [...all.filter(item => item.orderGroupNo !== receipt.orderGroupNo), receipt];
  if (!beforeSend) memory.set(userId, next);
  try {
    uni.setStorageSync(keyFor(userId), next);
    const saved = readStored(userId).find(item => item.orderGroupNo === receipt.orderGroupNo);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(receipt)) throw new Error('付款回执未保存');
    memory.set(userId, next);
  } catch {
    if (beforeSend) throw new Error('无法保存付款进度，已停止提交，请检查本机存储');
    // 请求已发出后不能因存储更新失败而丢掉回执；原持久 unknown 标记继续防重。
  }
  return receipt;
}

function saveKnownReceipt(userId: string, receipt: PaymentReceipt) {
  try { return saveReceipt(userId, receipt); } catch {
    const all = memory.get(userId) || [];
    const previous = all.find(item => item.orderGroupNo === receipt.orderGroupNo);
    if (previous && previous.attempt !== receipt.attempt) return previous;
    if (previous && ranks[previous.state] > ranks[receipt.state]) return previous;
    memory.set(userId, [...all.filter(item => item.orderGroupNo !== receipt.orderGroupNo), receipt]);
    return receipt;
  }
}

export function paymentReceiptMessage(receipt: PaymentReceipt) {
  if (receipt.amountChanged) return '订单金额已变化，请刷新并重新确认剩余付款金额';
  const result = receipt.result || receipt.currentResult;
  if (result) return `${receipt.result ? '本次付款' : '当前组状态'}：成功 ${result.paidCount} 笔，失败/未付 ${result.failedCount} 笔；剩余 U ${result.unpaidAmount}${receipt.retryable ? '，可重新确认剩余订单付款' : ''}`;
  if (receipt.state === 'verified') return '已核对：本次确认的订单均已付款';
  if (receipt.state === 'unknown') return '付款结果尚未确认，请核对订单，不要重复付款';
  return `付款请求已返回，本次付款 ${receipt.paidCount} 笔；订单状态待核对，请勿重复付款`;
}

export function validatePayResult(result: Api.RealOrder.OrderGroupPayResult, group: string) {
  if (!result || result.orderGroupNo !== group || !Array.isArray(result.items)
    || [result.totalCount, result.paidCount, result.failedCount].some(count => !Number.isSafeInteger(count) || count < 0)
    || result.totalCount !== result.items.length || result.paidCount + result.failedCount !== result.totalCount
    || new Set(result.items.map(item => String(item.orderId))).size !== result.items.length
    || result.items.some(item => !validId(item.orderId) || typeof item.success !== 'boolean' || !item.status)) throw new Error('付款结果响应不完整，请核对订单');
  normalizeAmount(result.paidAmount); normalizeAmount(result.unpaidAmount);
  result.items.forEach(item => normalizeAmount(item.amount));
  if (result.items.filter(item => item.success).length !== result.paidCount) throw new Error('付款结果笔数不一致');
  if (sumAmounts(result.items.filter(item => item.success).map(item => item.amount)) !== normalizeAmount(result.paidAmount)
    || result.items.some(item => item.success !== ['PAID', 'SHIPPED', 'COMPLETED', 'REFUND_REVIEW', 'REFUNDED'].includes(item.status))) throw new Error('付款金额或成功状态不一致');
  return result;
}

export function paymentFingerprint(orders: Api.RealOrder.OrderView[]) {
  return orders.map(order => `${order.id}:${normalizeAmount(order.totalAmount)}`).sort().join('|');
}

export function isOrderPaid(order: Api.RealOrder.OrderView) {
  return ['PAID', 'SHIPPED', 'COMPLETED', 'REFUND_REVIEW', 'REFUNDED'].includes(order.rawStatus);
}

/** 只负责确认和提交；已有回执时绝不再次付款，调用方单独核对详情。 */
export async function confirmOrderGroupPayment(orderGroupNo: string, customerId: string, payPassword: string, stillActive: () => boolean): Promise<PaymentReceipt | undefined> {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && customerId === useUserStore().realUserId;
  if (!customerId || !orderGroupNo || !current()) throw new Error('付款页面或账号已变化');
  const previous = readPaymentReceipts(customerId).find(item => item.orderGroupNo === orderGroupNo);
  if (previous && !previous.retryable) return previous;
  const release = acquireOrderOperation(customerId, undefined, orderGroupNo);
  let marker: PaymentReceipt | undefined;
  const validate = (orders: Api.RealOrder.OrderView[]) => {
    const changes = readOrderChangeReceipts(customerId);
    if (changes.some(item => item.orderGroupNo === orderGroupNo && item.state !== 'verified')
      || orders.some(order => orderChangeBlocks(order, changes))) throw new Error('该订单组存在待核对的取消或收货操作，请先核对原订单');
    if (!orders.length || orders.some(order => !validId(order.id) || order.orderGroupNo !== orderGroupNo
      || order.rawStatus !== 'CREATED' || orderRole(order, customerId) !== 'customer')
      || new Set(orders.map(order => String(order.id))).size !== orders.length) throw new Error('付款订单状态或归属已变化，请刷新核对');
    return sumAmounts(orders.map(order => order.totalAmount));
  };
  const assertNoActiveWallet = async () => {
    const pay = await fetchLatestWalletPay(orderGroupNo);
    if (!current()) return;
    if (pay && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(validateWalletPay(pay, orderGroupNo).status)) throw new Error('本组已有钱包支付单，请先查看原支付进度');
    if (!pay && hasOrderWalletAttempt(customerId, orderGroupNo)) throw new Error('原钱包支付创建结果未知，请先核对原支付单');
  };
  try {
    await assertNoActiveWallet();
    if (!current()) return;
    const orders = await fetchPendingOrderGroup(orderGroupNo, customerId, current);
    if (!current()) return;
    const total = validate(orders);
    const fingerprint = paymentFingerprint(orders);
    const confirmedOrders = orders.map(order => ({ id: String(order.id), amount: normalizeAmount(order.totalAmount) }));
    const result = await uni.showModal({
      title: `确认支付 ${orders.length} 笔订单？`,
      content: `${orders.map(order => `${order.productTitle} ×${order.quantity ?? '待确认'}：U ${order.totalAmount}`).join('\n')}\n本次共支付 U ${total}`,
      confirmText: '确认付款'
    });
    if (!result.confirm || !current()) return;
    const latest = await fetchPendingOrderGroup(orderGroupNo, customerId, current);
    if (!current()) return;
    validate(latest);
    if (paymentFingerprint(latest) !== fingerprint) throw new Error('订单金额或状态已变化，请重新确认付款');
    await assertNoActiveWallet();
    if (!current()) return;
    marker = { orderGroupNo, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, orders: confirmedOrders, state: 'unknown',
      history: previous ? [...(previous.history || []), { attempt: previous.attempt, orders: previous.orders, paidCount: previous.paidCount, result: previous.result }] : undefined };
    saveReceipt(customerId, marker, true);
    try {
      const result = validatePayResult(await payRealOrderGroup({ orderGroupNo, confirmedAmount: total, payPassword }), orderGroupNo);
      if (result.items.length !== marker.orders.length || result.items.some(item => !marker!.orders.some(order => order.id === String(item.orderId)
        && order.amount === normalizeAmount(item.amount)))) return marker;
      return saveKnownReceipt(customerId, { ...marker, state: 'confirmed', paidCount: result.paidCount, result });
    } catch (error) {
      if (error instanceof RequestError && String(error.code) === '-312') return saveKnownReceipt(customerId, { ...marker, amountChanged: true });
      // 逐单付款没有声明原子性；包括业务错误在内，发出后的异常不能证明没有付款。
      return marker;
    }
  } finally { release(); }
}

/** 只读核对精确的订单集合、买家、组号和金额；旧 CREATED/部分成功均不解除防重。 */
export async function reconcileOrderGroupPayment(orderGroupNo: string, customerId: string, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && customerId === useUserStore().realUserId;
  if (!current()) return;
  const receipt = readPaymentReceipts(customerId).find(item => item.orderGroupNo === orderGroupNo);
  if (!receipt) return receipt;
  try {
    const result = validatePayResult(await fetchOrderGroupPayResult(orderGroupNo), orderGroupNo);
    if (!current()) return receipt;
    const orders = await Promise.all(result.items.map(item => fetchOrderDetail(item.orderId)));
    if (!current()) return receipt;
    if (orders.some((order, index) => String(order.id) !== String(result.items[index].orderId) || order.orderGroupNo !== orderGroupNo
      || orderRole(order, customerId) !== 'customer' || order.rawStatus !== result.items[index].status
      || normalizeAmount(order.totalAmount) !== normalizeAmount(result.items[index].amount)
      || isOrderPaid(order) !== result.items[index].success)) return receipt;
    const original = receipt.orders.map(saved => orders.find(order => String(order.id) === saved.id));
    if (original.some(order => !order) || (receipt.paidCount != null && original.filter(order => isOrderPaid(order!)).length < receipt.paidCount)) return receipt;
    if (receipt.result?.items.some(item => item.success && !orders.some(order => String(order.id) === String(item.orderId) && isOrderPaid(order)))) return receipt;
    const pending = orders.filter(order => order.rawStatus === 'CREATED');
    if (sumAmounts(pending.map(order => order.totalAmount)) !== normalizeAmount(result.unpaidAmount)) return receipt;
    const verified = original.every((order, index) => isOrderPaid(order!) && normalizeAmount(order!.totalAmount) === receipt.orders[index].amount);
    return saveKnownReceipt(customerId, { ...receipt, currentResult: result, retryable: pending.length > 0,
      state: verified ? 'verified' : receipt.state });
  } catch { /* 回读失败不改变已知的提交结果。 */ }
  return receipt;
}

/** 核对整组剩余金额，列表/详情可在没有本机结算记录时发起钱包直付。 */
interface OrderWalletAttempt { chain: string; amount: string; idempotencyKey: string; payNo?: string }
const walletAttemptKey = (userId: string, group: string) => `bw_h5_order_wallet_attempt_v1:${encodeURIComponent(userId)}:${encodeURIComponent(group)}`;
function readWalletAttempt(userId: string, group: string): OrderWalletAttempt | undefined {
  const key = walletAttemptKey(userId, group), value = uni.getStorageSync(key);
  if (isMissingOperationRecord(key, value)) return;
  if (!value || typeof value !== 'object' || typeof value.idempotencyKey !== 'string' || !value.idempotencyKey
    || typeof value.chain !== 'string' || !value.chain || typeof value.amount !== 'string' || normalizeAmount(value.amount) !== value.amount
    || (value.payNo != null && (typeof value.payNo !== 'string' || !value.payNo))) throw new Error('原钱包付款记录损坏，请先核对支付单');
  return value;
}
export function hasOrderWalletAttempt(userId: string, group: string) {
  return !!readWalletAttempt(userId, group)
    || !!readPendingCheckouts().find(item => item.userId === userId && item.orderGroupNo === group)?.walletPayAttempt;
}
export async function createOrderWalletPayment(expected: Api.RealOrder.OrderView, chain: string, stillActive: () => boolean, checkedTerminalPayNo?: string) {
  const userId = useUserStore().realUserId, token = getAccessToken(), group = expected.orderGroupNo;
  const current = () => stillActive() && !!userId && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!userId || !group || !current()) throw new Error('付款页面或账号已变化');
  const release = acquireOrderOperation(userId, expected.id, group);
  try {
    const existing = await fetchLatestWalletPay(group);
    if (!current()) return;
    if (existing && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(validateWalletPay(existing, group).status)) return existing;
    const readGroup = async () => {
      const result = validatePayResult(await fetchOrderGroupPayResult(group), group);
      const details = await Promise.all(result.items.map(item => fetchOrderDetail(item.orderId, 'bought', userId)));
      if (!current()) throw new Error('付款页面或账号已变化');
      for (const item of result.items) {
        const order = details.find(detail => String(detail.id) === String(item.orderId));
        if (!order || order.orderGroupNo !== group || orderRole(order, userId) !== 'customer'
          || normalizeAmount(order.totalAmount) !== normalizeAmount(item.amount) || order.rawStatus !== item.status) throw new Error('订单组金额或状态已变化，请刷新核对');
      }
      const pending = details.filter(order => order.rawStatus === 'CREATED');
      if (!pending.some(order => String(order.id) === String(expected.id)) || !pending.length
        || sumAmounts(pending.map(order => order.totalAmount)) !== normalizeAmount(result.unpaidAmount)) throw new Error('待付款订单范围已变化，请刷新核对');
      const changes = readOrderChangeReceipts(userId);
      if (pending.some(order => orderChangeBlocks(order, changes)) || changes.some(item => item.orderGroupNo === group && item.state !== 'verified')) throw new Error('原订单操作结果待核对，暂不可付款');
      const receipt = readPaymentReceipts(userId).find(item => item.orderGroupNo === group);
      if (receipt && !receipt.retryable) throw new Error('原余额付款结果待核对，暂不可再次付款');
      return { amount: normalizeAmount(result.unpaidAmount), fingerprint: paymentFingerprint(pending), count: pending.length };
    };
    const terms = await readGroup();
    const selected = (await fetchWalletPayChains()).find(item => item.chain === chain && item.enabled);
    if (!current()) return;
    if (!selected || selected.minAmount != null && compareAmounts(terms.amount, selected.minAmount) < 0) throw new Error('当前链不可用或金额低于最低要求');
    const answer = await uni.showModal({ title: '确认钱包直付', content: `本组${terms.count}笔待付款订单，共${terms.amount} USDT。使用${selected.label || chain}网络，随后进入钱包核对并签名。`, confirmText: '继续付款' });
    if (!answer.confirm || !current()) return;
    const latest = await readGroup();
    if (latest.amount !== terms.amount || latest.fingerprint !== terms.fingerprint) throw new Error('订单组金额或状态已变化，请重新确认');
    const newest = await fetchLatestWalletPay(group);
    if (!current()) return;
    if (newest && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(validateWalletPay(newest, group).status)) return newest;
    const latestChain = (await fetchWalletPayChains()).find(item => item.chain === chain && item.enabled);
    if (!current()) return;
    if (!latestChain || JSON.stringify(latestChain) !== JSON.stringify(selected)) throw new Error('支付链配置已变化，请重新确认');
    const key = walletAttemptKey(userId, group);
    let attempt = readWalletAttempt(userId, group);
    const pending = readPendingCheckouts().find(item => item.userId === userId && item.orderGroupNo === group);
    if (newest && newest.payNo === checkedTerminalPayNo && ['CLOSED', 'FAILED'].includes(newest.status)) {
      if (attempt?.payNo && attempt.payNo !== newest.payNo || pending?.walletPayAttempt?.payNo && pending.walletPayAttempt.payNo !== newest.payNo) throw new Error('本机记录与最近支付单不同，请先核对原单');
      // 用户已核对同一终态支付单，才结束旧幂等尝试；未知创建结果保留原键重试。
      if (attempt && (!attempt.payNo || attempt.payNo === newest.payNo)) {
        uni.removeStorageSync(key);
        if (readWalletAttempt(userId, group)) throw new Error('原钱包付款记录清理失败，请先核对');
        attempt = undefined;
      }
      if (pending?.walletPayAttempt && (!pending.walletPayAttempt.payNo || pending.walletPayAttempt.payNo === newest.payNo)) {
        delete pending.walletPayAttempt; savePendingCheckout(pending);
      }
    } else if (newest) throw new Error('原支付单已变化，请重新核对');
    if (attempt && (attempt.chain !== chain || attempt.amount !== terms.amount)) throw new Error('原支付尝试的链或金额不同，请先核对原支付单');
    if (pending?.walletPayAttempt && pending.walletPayAttempt.chain !== chain) throw new Error('原结算记录使用其他链，请从结算页核对');
    if (!attempt) {
      attempt = { chain, amount: terms.amount, idempotencyKey: pending?.walletPayAttempt?.idempotencyKey || `wp-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      uni.setStorageSync(key, attempt);
      if (JSON.stringify(uni.getStorageSync(key)) !== JSON.stringify(attempt)) throw new Error('付款进度无法保存，已停止提交');
    }
    if (!current()) return;
    try {
      const result = validateWalletPay(await createWalletPay({ orderGroupNo: group, chain, confirmedAmount: terms.amount, idempotencyKey: attempt.idempotencyKey }), group);
      if (result.chain !== chain || result.network !== selected.network || result.tokenContract !== selected.tokenContract
        || result.decimals !== selected.decimals || normalizeAmount(result.payAmount) !== terms.amount
        || result.rawAmount !== amountToRaw(terms.amount, selected.decimals)) throw new Error('创建回执与确认的付款条件不一致，请核对原支付单');
      // 页面离开也保留原账号支付回执，不因此创建另一笔付款。
      attempt.payNo = result.payNo; uni.setStorageSync(key, attempt);
      if (pending && token === getAccessToken() && userId === useUserStore().realUserId) {
        pending.walletPayAttempt = { chain, idempotencyKey: attempt.idempotencyKey, payNo: result.payNo };
        savePendingCheckout(pending);
      }
      return result;
    } catch (error) {
      if (error instanceof RequestError && error.kind === 'business' && String(error.code) === '-305' && current()) {
        const active = await fetchLatestWalletPay(group);
        if (!current()) return;
        if (active && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(validateWalletPay(active, group).status)) return active;
      }
      if (error instanceof RequestError && (error.kind === 'config' || error.kind === 'business' && ['-300', '-301', '-302', '-309', '-312'].includes(String(error.code))) && !attempt.payNo) {
        uni.removeStorageSync(key);
        if (pending?.walletPayAttempt?.idempotencyKey === attempt.idempotencyKey && !pending.walletPayAttempt.payNo) {
          delete pending.walletPayAttempt; savePendingCheckout(pending);
        }
      }
      throw error;
    }
  } finally { release(); }
}
