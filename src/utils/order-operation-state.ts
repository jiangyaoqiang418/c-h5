export interface OrderChangeReceipt {
  orderId: string | number;
  orderGroupNo?: string;
  action: 'cancel' | 'confirm';
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
  observedStatus?: Api.RealOrder.OrderStatus;
}

const keyFor = (userId: string) => `bw_h5_order_change_v1:${encodeURIComponent(userId)}`;
const memory = new Map<string, OrderChangeReceipt[]>();
const locks = new Set<string>();
const rank = { unknown: 0, confirmed: 1, verified: 2 };
export const validOrderId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
const receiptKey = (receipt: OrderChangeReceipt) => `${receipt.action}:${String(receipt.orderId)}`;
export const orderChangeTarget = (action: OrderChangeReceipt['action']) => action === 'cancel' ? 'CANCELED' : 'COMPLETED';
export const orderChangeBefore = (action: OrderChangeReceipt['action']) => action === 'cancel' ? 'CREATED' : 'SHIPPED';

function readStored(userId: string): OrderChangeReceipt[] {
  if (!userId) throw new Error('请先登录并加载账号资料');
  const value = uni.getStorageSync(keyFor(userId));
  if (value == null || value === '') return [];
  const statuses = ['CREATED', 'PAID', 'SHIPPED', 'REFUND_REVIEW', 'REFUNDED', 'COMPLETED', 'CANCELED'];
  if (!Array.isArray(value) || value.some(item => !item || !validOrderId(item.orderId) || !['cancel', 'confirm'].includes(item.action)
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state)
    || (item.orderGroupNo != null && (typeof item.orderGroupNo !== 'string' || !item.orderGroupNo.trim()))
    || (item.state === 'verified' && (!statuses.includes(item.observedStatus) || item.observedStatus === orderChangeBefore(item.action))))
    || new Set(value.map(receiptKey)).size !== value.length) throw new Error('订单操作回执读取失败，请先核对记录');
  return value;
}

export function readOrderChangeReceipts(userId: string): OrderChangeReceipt[] {
  const all = new Map(readStored(userId).map(item => [receiptKey(item), item]));
  for (const item of memory.get(userId) || []) {
    const stored = all.get(receiptKey(item));
    if (stored && (stored.attempt !== item.attempt || stored.orderGroupNo !== item.orderGroupNo)) throw new Error('订单操作回执冲突，请核对记录');
    if (!stored || rank[item.state] > rank[stored.state]) all.set(receiptKey(item), item);
  }
  return [...all.values()].map(item => ({ ...item }));
}

/** 提交前必须落盘并读回；提交后保存失败仍保留更强的内存回执和原持久 unknown。 */
export function saveOrderChangeReceipt(userId: string, receipt: OrderChangeReceipt, beforeSend = false): OrderChangeReceipt {
  const all = readOrderChangeReceipts(userId);
  const previous = all.find(item => receiptKey(item) === receiptKey(receipt));
  if (previous && (previous.attempt !== receipt.attempt || previous.orderGroupNo !== receipt.orderGroupNo)) throw new Error('已有其他订单操作，请先核对');
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  const next = [...all.filter(item => receiptKey(item) !== receiptKey(receipt)), receipt];
  if (!beforeSend) memory.set(userId, next);
  try {
    uni.setStorageSync(keyFor(userId), next);
    const saved = readStored(userId).find(item => receiptKey(item) === receiptKey(receipt));
    if (!saved || saved.attempt !== receipt.attempt || saved.state !== receipt.state || saved.observedStatus !== receipt.observedStatus
      || saved.orderGroupNo !== receipt.orderGroupNo) throw new Error('订单操作回执未保存');
    memory.set(userId, next);
  } catch {
    if (beforeSend) throw new Error('无法保存订单操作进度，已停止提交，请检查本机存储');
  }
  return receipt;
}

export function retainOrderChangeReceipt(userId: string, receipt: OrderChangeReceipt) {
  try { return saveOrderChangeReceipt(userId, receipt); } catch {
    const all = memory.get(userId) || [];
    const previous = all.find(item => receiptKey(item) === receiptKey(receipt));
    if (previous && rank[previous.state] > rank[receipt.state]) return previous;
    memory.set(userId, [...all.filter(item => receiptKey(item) !== receiptKey(receipt)), receipt]);
    return receipt;
  }
}

export function removeRejectedOrderChange(userId: string, receipt: OrderChangeReceipt) {
  const all = readOrderChangeReceipts(userId);
  const saved = all.find(item => receiptKey(item) === receiptKey(receipt));
  if (!saved || saved.attempt !== receipt.attempt || saved.state !== 'unknown') return;
  const next = all.filter(item => receiptKey(item) !== receiptKey(receipt));
  uni.setStorageSync(keyFor(userId), next);
  if (readStored(userId).some(item => receiptKey(item) === receiptKey(receipt))) throw new Error('订单操作回执未清理');
  memory.set(userId, next);
}

export function orderChangeBlocks(order: { id: string | number; rawStatus: Api.RealOrder.OrderStatus }, receipts: OrderChangeReceipt[]) {
  return receipts.some(item => String(item.orderId) === String(order.id) && (item.state !== 'verified'
    || order.rawStatus === orderChangeBefore(item.action)
    || (item.observedStatus === orderChangeTarget(item.action) && order.rawStatus !== item.observedStatus)));
}

/** 付款与取消/收货共用订单组锁；没有组号时仍按原订单加锁。仅保护当前应用实例。 */
export function acquireOrderOperation(userId: string, orderId?: string | number, orderGroupNo?: string) {
  const prefix = encodeURIComponent(userId);
  const keys = [...(orderId == null ? [] : [`${prefix}:order:${String(orderId)}`]), ...(orderGroupNo ? [`${prefix}:group:${orderGroupNo}`] : [])];
  if (!userId || !keys.length || keys.some(key => locks.has(key))) throw new Error('该订单或订单组正在处理，请勿重复操作');
  keys.forEach(key => locks.add(key));
  return () => keys.forEach(key => locks.delete(key));
}
