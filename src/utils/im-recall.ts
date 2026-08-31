export interface ImRecallReceipt {
  conversationId: Api.RealNotify.Id;
  messageId: Api.RealNotify.Id;
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
}

const memory = new Map<string, ImRecallReceipt[]>();
const keyFor = (userId: string) => `bw_h5_im_recall_v1:${encodeURIComponent(userId)}`;
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function readStored(userId: string): ImRecallReceipt[] {
  if (!userId) throw new Error('请先登录并读取账户资料');
  const records = uni.getStorageSync(keyFor(userId));
  if (records == null || records === '') return [];
  if (!Array.isArray(records) || records.some(item => !item || !validId(item.conversationId) || !validId(item.messageId)
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state))
    || new Set(records.map(item => `${String(item.conversationId)}:${String(item.messageId)}`)).size !== records.length) {
    throw new Error('本机撤回记录损坏，请先刷新消息核对');
  }
  return records;
}

export function readImRecallReceipts(userId: string) {
  const records = new Map(readStored(userId).map(item => [`${String(item.conversationId)}:${String(item.messageId)}`, item]));
  for (const cached of memory.get(userId) || []) {
    const key = `${String(cached.conversationId)}:${String(cached.messageId)}`;
    const stored = records.get(key);
    if (!stored || (stored.attempt === cached.attempt && rank[cached.state] > rank[stored.state])) records.set(key, cached);
    else if (stored.attempt !== cached.attempt) throw new Error('撤回记录冲突，请先刷新消息核对');
  }
  return clone([...records.values()]);
}

function save(userId: string, receipt: ImRecallReceipt, beforeSend = false) {
  const records = readImRecallReceipts(userId);
  const key = `${String(receipt.conversationId)}:${String(receipt.messageId)}`;
  const previous = records.find(item => `${String(item.conversationId)}:${String(item.messageId)}` === key);
  if (previous && previous.attempt !== receipt.attempt) throw new Error('该消息已有撤回记录，请先刷新核对');
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  const next = [...records.filter(item => `${String(item.conversationId)}:${String(item.messageId)}` !== key), receipt];
  if (!beforeSend) memory.set(userId, clone(next));
  try {
    uni.setStorageSync(keyFor(userId), clone(next));
    memory.set(userId, clone(next));
  } catch {
    if (beforeSend) throw new Error('无法保存撤回进度，本次未提交');
  }
  return receipt;
}

export function beginImRecall(userId: string, conversationId: Api.RealNotify.Id, messageId: Api.RealNotify.Id) {
  return save(userId, { conversationId, messageId, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' }, true);
}

export function retainImRecall(userId: string, receipt: ImRecallReceipt) {
  return save(userId, receipt);
}

export function reconcileImRecall(userId: string, conversationId: Api.RealNotify.Id, messageId: Api.RealNotify.Id) {
  const receipt = readImRecallReceipts(userId).find(item => String(item.conversationId) === String(conversationId) && String(item.messageId) === String(messageId));
  return receipt ? retainImRecall(userId, { ...receipt, state: 'verified' }) : undefined;
}

export function removeRejectedImRecall(userId: string, receipt: ImRecallReceipt) {
  const records = readImRecallReceipts(userId);
  const next = records.filter(item => !(String(item.conversationId) === String(receipt.conversationId)
    && String(item.messageId) === String(receipt.messageId) && item.attempt === receipt.attempt && item.state === 'unknown'));
  uni.setStorageSync(keyFor(userId), clone(next));
  memory.set(userId, clone(next));
}
