export interface LogisticsUpdateReceipt {
  orderId: Api.RealOrder.LongId;
  kind: 'track' | 'exception';
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
  id?: Api.RealOrder.LongId;
  beforeException?: string;
  description?: string;
  occurredAt?: Api.RealOrder.LongId;
  status?: Api.RealOrder.LogisticsStatus;
  location?: string;
  exceptionNode?: boolean;
  exception?: string;
}

const memory = new Map<string, LogisticsUpdateReceipt[]>();
const keyFor = (userId: string) => `bw_h5_order_logistics_v1:${encodeURIComponent(userId)}`;
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const key = (item: LogisticsUpdateReceipt) => `${String(item.orderId)}:${item.kind}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function readStored(userId: string): LogisticsUpdateReceipt[] {
  if (!userId) throw new Error('请先登录并读取账户资料');
  const records = uni.getStorageSync(keyFor(userId));
  if (records == null || records === '') return [];
  if (!Array.isArray(records) || records.some(item => !item || !validId(item.orderId) || !['track', 'exception'].includes(item.kind)
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state)
    || (item.id != null && !validId(item.id)) || (item.kind === 'track' && (!item.description || !item.status || item.occurredAt == null))
    || (item.kind === 'exception' && !item.exception)) || new Set(records.map(key)).size !== records.length) {
    throw new Error('本机物流操作记录损坏，请先核对订单');
  }
  return records;
}

export function readLogisticsUpdateReceipts(userId: string) {
  const all = new Map(readStored(userId).map(item => [key(item), item]));
  for (const cached of memory.get(userId) || []) {
    const stored = all.get(key(cached));
    if (stored && stored.attempt !== cached.attempt) throw new Error('物流操作记录冲突，请先核对订单');
    if (!stored || rank[cached.state] > rank[stored.state]) all.set(key(cached), cached);
  }
  return clone([...all.values()]);
}

function save(userId: string, receipt: LogisticsUpdateReceipt, beforeSend = false) {
  const records = readLogisticsUpdateReceipts(userId);
  const previous = records.find(item => key(item) === key(receipt));
  if (previous && previous.attempt !== receipt.attempt) throw new Error('原物流操作尚未核对，请刷新订单');
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  const next = [...records.filter(item => key(item) !== key(receipt)), receipt];
  if (!beforeSend) memory.set(userId, clone(next));
  try {
    uni.setStorageSync(keyFor(userId), clone(next));
    memory.set(userId, clone(next));
  } catch { if (beforeSend) throw new Error('无法保存物流操作进度，本次未提交'); }
  return receipt;
}

export function beginLogisticsUpdate(userId: string, receipt: Omit<LogisticsUpdateReceipt, 'attempt' | 'state'>) {
  return save(userId, { ...receipt, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' }, true);
}
export function retainLogisticsUpdate(userId: string, receipt: LogisticsUpdateReceipt) { return save(userId, receipt); }
export function removeRejectedLogisticsUpdate(userId: string, receipt: LogisticsUpdateReceipt) {
  const records = readLogisticsUpdateReceipts(userId);
  const next = records.filter(item => !(key(item) === key(receipt) && item.attempt === receipt.attempt && item.state === 'unknown'));
  uni.setStorageSync(keyFor(userId), clone(next)); memory.set(userId, clone(next));
}
export function matchesLogisticsUpdate(logistics: Api.RealOrder.LogisticsDTO, receipt: LogisticsUpdateReceipt) {
  if (String(logistics.orderId) !== String(receipt.orderId)) return false;
  if (receipt.kind === 'track') return logistics.tracks.some(track => receipt.id != null
    ? String(track.trackId) === String(receipt.id)
    : String(track.occurredAt) === String(receipt.occurredAt) && track.description === receipt.description && track.status === receipt.status
      && (track.location || '') === (receipt.location || '') && !!track.exceptionNode === !!receipt.exceptionNode);
  return logistics.logisticsException === receipt.exception && (!receipt.beforeException || receipt.beforeException !== receipt.exception);
}
