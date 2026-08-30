import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { cancelPurchase, fetchPurchaseDetail } from '@/service/api/purchase';

export interface PurchaseCancelReceipt {
  demandId: string | number;
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
  terminalStatus?: 'CANCELED' | 'TAKEN' | 'VOID' | 'REJECTED';
}
const running = new Set<string>();
const keyFor = (userId: string) => `bw_h5_purchase_cancel_v1:${encodeURIComponent(userId)}`;
const validId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
const terminals = ['CANCELED', 'TAKEN', 'VOID', 'REJECTED'];

export function readPurchaseCancelReceipts(userId: string): PurchaseCancelReceipt[] {
  if (!userId) throw new Error('请先登录并加载账户资料');
  const stored = uni.getStorageSync(keyFor(userId));
  if (stored == null || stored === '') return [];
  if (!Array.isArray(stored) || stored.some(item => !item || !validId(item.demandId) || typeof item.attempt !== 'string' || !item.attempt
    || !['unknown', 'confirmed', 'verified'].includes(item.state) || (item.state === 'verified' && !terminals.includes(item.terminalStatus)))
    || new Set(stored.map(item => String(item.demandId))).size !== stored.length) throw new Error('本机求购撤销回执读取失败，请先核对记录');
  return stored;
}

function saveReceipt(userId: string, receipt: PurchaseCancelReceipt, remove = false) {
  const all = readPurchaseCancelReceipts(userId);
  const previous = all.find(item => String(item.demandId) === String(receipt.demandId));
  if (previous && previous.attempt !== receipt.attempt) throw new Error('已有其他求购撤销记录，请刷新核对');
  if (previous?.state === 'verified' || (previous?.state === 'confirmed' && (remove || receipt.state === 'unknown'))) return;
  const next = all.filter(item => String(item.demandId) !== String(receipt.demandId));
  if (!remove) next.push(receipt);
  uni.setStorageSync(keyFor(userId), next);
  const saved = readPurchaseCancelReceipts(userId).find(item => String(item.demandId) === String(receipt.demandId));
  if (remove ? !!saved : saved?.attempt !== receipt.attempt || saved?.state !== receipt.state
    || saved?.terminalStatus !== receipt.terminalStatus) throw new Error('无法保存求购撤销进度，请先核对记录');
}

/** 双入口共用确认锁和原求购回执，不根据列表缺席或映射后的 cancelled 推断撤销成功。 */
export async function cancelPurchaseWithReceipt(expected: Api.PurchaseRequest.PurchaseRequest, stillActive: () => boolean) {
  const user = useUserStore(), userId = user.realUserId, token = getAccessToken();
  const demandId = expected.id;
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === user.realUserId;
  if (!userId || !current() || !validId(demandId) || String(expected.customerId) !== userId
    || !['pending_audit', 'pushing'].includes(expected.status)) throw new Error('求购状态或归属已变化');
  const lock = `${keyFor(userId)}:${String(demandId)}`;
  if (running.has(lock) || readPurchaseCancelReceipts(userId).some(item => String(item.demandId) === String(demandId))) throw new Error('已有求购撤销操作，请先核对记录');
  running.add(lock);
  let marker: PurchaseCancelReceipt | undefined, sent = false;
  try {
    const result = await uni.showModal({ title: '撤销求购？' });
    if (!result.confirm || !current()) return;
    const latest = await fetchPurchaseDetail(demandId);
    if (!current()) return;
    if (String(latest.request.id) !== String(demandId) || String(latest.request.customerId) !== userId
      || !['PENDING_REVIEW', 'OPEN'].includes(latest.rawStatus)) throw new Error('求购状态或归属已变化，请刷新后操作');
    marker = { demandId, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
    saveReceipt(userId, marker);
    sent = true;
    const receiptId = await cancelPurchase(demandId);
    if (!validId(receiptId) || String(receiptId) !== String(demandId)) throw new Error('求购撤销回执缺失或不匹配，请核对记录');
    const receipt: PurchaseCancelReceipt = { ...marker, state: 'confirmed' };
    try { saveReceipt(userId, receipt); } catch { /* 保留本次成功及原持久未知记录，不能自动重发。 */ }
    return receipt;
  } catch (error) {
    if (sent && marker && error instanceof RequestError && (error.kind === 'business' || error.kind === 'config')) {
      try { saveReceipt(userId, marker, true); } catch { /* 无法清理时保守保留保护。 */ }
    }
    throw error;
  } finally { running.delete(lock); }
}

export async function reconcilePurchaseCancel(userId: string, demandId: string | number, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!current()) return;
  const receipt = readPurchaseCancelReceipts(userId).find(item => String(item.demandId) === String(demandId));
  if (!receipt || receipt.state === 'verified') return receipt;
  try {
    const latest = await fetchPurchaseDetail(demandId);
    if (!current() || String(latest.request.id) !== String(demandId) || String(latest.request.customerId) !== userId
      || !terminals.includes(latest.rawStatus)) return receipt;
    if (receipt.state === 'confirmed' && latest.rawStatus !== 'CANCELED') return receipt;
    const verified: PurchaseCancelReceipt = { ...receipt, state: 'verified', terminalStatus: latest.rawStatus as PurchaseCancelReceipt['terminalStatus'] };
    try { saveReceipt(userId, verified); } catch { /* 当前核对结果可保留，原防重记录不删除。 */ }
    return verified;
  } catch { return receipt; }
}

export function purchaseCancelMessage(receipt: PurchaseCancelReceipt) {
  if (receipt.state === 'unknown') return '撤销结果尚未确认，请核对原求购，不要重复提交';
  if (receipt.state === 'confirmed') return '撤销请求已成功，最新状态待同步';
  if (receipt.terminalStatus === 'CANCELED') return '已核对：求购已取消';
  const label = receipt.terminalStatus === 'TAKEN' ? '已接单' : receipt.terminalStatus === 'VOID' ? '已作废' : '已驳回';
  return `已核对：求购${label}，不代表本次撤销成功`;
}
