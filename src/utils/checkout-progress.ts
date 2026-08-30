export interface PendingCheckout {
  fingerprint: string;
  idempotencyKey: string;
  orderGroupNo?: string;
  orderIds?: Api.RealOrder.LongId[];
  userId?: string;
  request?: Api.RealOrder.OrderCreateBatchParams;
  mode?: 'cart' | 'buy-now';
  contextId?: string;
  lines?: Array<{ key: string; qty: number }>;
}

const legacyKey = 'bw_h5_real_checkout_pending_v1';
const recordsKey = 'bw_h5_real_checkout_pending_v2';
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const validId = (value: unknown) => nonempty(value) || (typeof value === 'number' && Number.isSafeInteger(value));
const quantity = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const snapshot = (value: unknown) => JSON.stringify(value);

function validate(record: PendingCheckout) {
  if (!record || !nonempty(record.fingerprint) || !nonempty(record.idempotencyKey)
    || (record.userId != null && !nonempty(record.userId))
    || (record.orderGroupNo != null && !nonempty(record.orderGroupNo))
    || (record.orderIds != null && (!Array.isArray(record.orderIds) || !record.orderIds.length
      || record.orderIds.some(id => !validId(id)) || new Set(record.orderIds.map(String)).size !== record.orderIds.length))
    || (record.mode != null && !['cart', 'buy-now'].includes(record.mode))
    || (record.contextId != null && !nonempty(record.contextId))
    || (record.lines != null && (!Array.isArray(record.lines) || record.lines.some(line => !line || !nonempty(line.key) || !quantity(line.qty))
      || new Set(record.lines.map(line => line.key)).size !== record.lines.length))) throw new Error('本机结算进度不完整，请先核对订单，不要重新下单');
  const request = record.request;
  if (request && (!validId(request.addressId) || request.idempotencyKey !== record.idempotencyKey
    || !Array.isArray(request.items) || !request.items.length || request.items.length > 20
    || request.items.some(item => !item || !validId(item.productId) || (item.quantity != null && !quantity(item.quantity))
      || (item.sessionId != null && !validId(item.sessionId))))) throw new Error('原下单请求不完整，已停止恢复，请核对订单');
  return record;
}

function readCurrent(): PendingCheckout[] {
  const value = uni.getStorageSync(recordsKey);
  if (value == null || value === '') return [];
  if (!Array.isArray(value)) throw new Error('本机结算进度读取失败，已停止下单');
  const records = value.map(validate);
  if (new Set(records.map(record => record.idempotencyKey)).size !== records.length) throw new Error('本机结算进度冲突，请先核对订单');
  return records;
}

function readLegacy(): PendingCheckout | undefined {
  const value = uni.getStorageSync(legacyKey);
  if (value == null || value === '') return;
  const record = validate(value);
  const parts = record.fingerprint.split('|');
  return validate({ ...record, userId: record.userId || (parts[0] === 'buy-now' ? parts[2] : parts[0]) });
}

function sameOrigin(a: PendingCheckout, b: PendingCheckout) {
  return a.userId === b.userId && a.idempotencyKey === b.idempotencyKey && a.fingerprint === b.fingerprint
    && (!a.request || !b.request || snapshot(a.request) === snapshot(b.request))
    && (!a.orderGroupNo || !b.orderGroupNo || a.orderGroupNo === b.orderGroupNo)
    && (!a.orderIds || !b.orderIds || snapshot(a.orderIds) === snapshot(b.orderIds));
}

/** 读取失败不当作空记录；返回副本，避免调用方先修改内存对象造成虚假的落盘成功。 */
export function readPendingCheckouts(): PendingCheckout[] {
  const records = readCurrent();
  const legacy = readLegacy();
  if (legacy) {
    const current = records.find(record => record.idempotencyKey === legacy.idempotencyKey);
    if (current && (!sameOrigin(current, legacy) || (legacy.orderGroupNo && !current.orderGroupNo)
      || (legacy.orderIds && !current.orderIds))) throw new Error('新旧结算进度冲突，请先核对订单');
    if (!current) records.push(legacy);
  }
  return JSON.parse(snapshot(records));
}

function writeRecords(records: PendingCheckout[]) {
  records.forEach(validate);
  const expected = snapshot(records);
  uni.setStorageSync(recordsKey, JSON.parse(expected));
  if (snapshot(readCurrent()) !== expected) throw new Error('结算进度未完整保存，请检查本机存储后重试');
}

export function savePendingCheckout(pending: PendingCheckout) {
  validate(pending);
  const records = readPendingCheckouts();
  const previous = records.find(record => record.idempotencyKey === pending.idempotencyKey);
  if (previous && (!sameOrigin(previous, pending) || (previous.request && snapshot(previous.request) !== snapshot(pending.request))
    || previous.mode !== pending.mode || previous.contextId !== pending.contextId || snapshot(previous.lines) !== snapshot(pending.lines)
    || (previous.orderGroupNo && previous.orderGroupNo !== pending.orderGroupNo)
    || (previous.orderIds && snapshot(previous.orderIds) !== snapshot(pending.orderIds)))) throw new Error('原结算记录已变化，已停止覆盖');
  writeRecords([...records.filter(record => record.idempotencyKey !== pending.idempotencyKey), pending]);
}

export function assertPendingCheckout(pending: PendingCheckout) {
  const saved = readPendingCheckouts().find(record => record.idempotencyKey === pending.idempotencyKey);
  if (!saved || snapshot(saved) !== snapshot(pending)) throw new Error('本机结算进度已变化，请重新读取后核对');
}

/** 仅清理已核实的原记录；先迁移再移除旧版副本，任何失败均不得报告清理完成。 */
export function removePendingCheckout(pending: PendingCheckout) {
  assertPendingCheckout(pending);
  const records = readPendingCheckouts();
  const legacy = readLegacy();
  if (legacy?.idempotencyKey === pending.idempotencyKey) {
    writeRecords(records);
    uni.removeStorageSync(legacyKey);
    if (readLegacy()) throw new Error('旧版结算进度清理失败，请重试');
  }
  writeRecords(records.filter(record => record.idempotencyKey !== pending.idempotencyKey));
  if (readPendingCheckouts().some(record => record.idempotencyKey === pending.idempotencyKey)) throw new Error('结算进度清理未完成，请重试');
}
