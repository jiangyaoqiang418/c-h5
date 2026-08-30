import { cancelRecharge, fetchRechargeDetail } from '@/service/api/wallet';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';
import { normalizeAmount } from './amount';

export interface RechargeCancelReceipt {
  id: string | number;
  chain: string;
  amount: string;
  attempt: string;
  state: 'unknown' | 'confirmed' | 'verified';
  terminalStatus?: 'CANCELED' | 'CONFIRMED';
}
const memory = new Map<string, RechargeCancelReceipt[]>();
const running = new Set<string>();
const keyFor = (userId: string) => `bw_h5_recharge_cancel_v1:${encodeURIComponent(userId)}`;
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const validId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
const sameRecord = (a: Pick<RechargeCancelReceipt, 'id' | 'chain' | 'amount'>, b: Api.RealWallet.RechargeVO | RechargeCancelReceipt) =>
  String(a.id) === String(b.id) && a.chain === b.chain && a.amount === normalizeAmount(b.amount);

function readStored(userId: string): RechargeCancelReceipt[] {
  if (!userId) throw new Error('请先登录并加载账号资料');
  const stored = uni.getStorageSync(keyFor(userId));
  if (stored == null || stored === '') return [];
  if (!Array.isArray(stored) || stored.some(item => !item || !validId(item.id) || typeof item.chain !== 'string' || !item.chain.trim()
    || typeof item.amount !== 'string' || normalizeAmount(item.amount) !== item.amount || !item.attempt || typeof item.attempt !== 'string'
    || !['unknown', 'confirmed', 'verified'].includes(item.state)
    || (item.state === 'verified' && !['CANCELED', 'CONFIRMED'].includes(item.terminalStatus)))
    || new Set(stored.map(item => String(item.id))).size !== stored.length) throw new Error('充值取消回执读取失败，请先核对记录');
  return stored;
}

export function readRechargeCancelReceipts(userId: string) {
  const all = new Map(readStored(userId).map(item => [String(item.id), item]));
  for (const item of memory.get(userId) || []) {
    const stored = all.get(String(item.id));
    if (stored && (stored.attempt !== item.attempt || !sameRecord(stored, item))) throw new Error('充值取消回执冲突，请先核对记录');
    if (!stored || rank[item.state] > rank[stored.state]) all.set(String(item.id), item);
  }
  return [...all.values()].map(item => ({ ...item }));
}

function save(userId: string, receipt: RechargeCancelReceipt, beforeSend = false) {
  const all = readRechargeCancelReceipts(userId);
  const previous = all.find(item => String(item.id) === String(receipt.id));
  if (previous && (previous.attempt !== receipt.attempt || !sameRecord(previous, receipt))) throw new Error('已有其他充值取消记录');
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  const next = [...all.filter(item => String(item.id) !== String(receipt.id)), receipt];
  if (!beforeSend) memory.set(userId, next);
  try {
    uni.setStorageSync(keyFor(userId), next);
    const saved = readStored(userId).find(item => String(item.id) === String(receipt.id));
    if (!saved || saved.attempt !== receipt.attempt || saved.state !== receipt.state || !sameRecord(receipt, saved)
      || saved.terminalStatus !== receipt.terminalStatus) throw new Error();
    memory.set(userId, next);
  } catch { if (beforeSend) throw new Error('无法保存充值取消进度，本次未提交'); }
  return receipt;
}

function retain(userId: string, receipt: RechargeCancelReceipt) {
  try { return save(userId, receipt); } catch {
    const all = memory.get(userId) || [];
    const previous = all.find(item => String(item.id) === String(receipt.id));
    if (previous && rank[previous.state] > rank[receipt.state]) return previous;
    memory.set(userId, [...all.filter(item => String(item.id) !== String(receipt.id)), receipt]);
    return receipt;
  }
}

export async function cancelRechargeWithReceipt(expected: Api.RealWallet.RechargeVO, stillActive: () => boolean) {
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!userId || !current() || !validId(expected.id) || expected.status !== 'PENDING' || expected.txHash || !expected.chain) throw new Error('充值状态已变化，请核对后操作');
  const lock = `${keyFor(userId)}:${String(expected.id)}`;
  if (running.has(lock) || readRechargeCancelReceipts(userId).some(item => String(item.id) === String(expected.id))) throw new Error('已有充值取消结果，请先核对，不要重复操作');
  const marker: RechargeCancelReceipt = { id: expected.id, chain: expected.chain, amount: normalizeAmount(expected.amount), attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
  running.add(lock);
  let sent = false;
  try {
    const answer = await uni.showModal({ title: '取消充值申报？', content: '取消后仅作废本次申报；已发生的链上转账仍可能自动到账。' });
    if (!answer.confirm || !current()) return;
    const latest = await fetchRechargeDetail(expected.id);
    if (!current()) return;
    if (!sameRecord(marker, latest) || latest.status !== 'PENDING' || latest.txHash) throw new Error('充值记录或到账状态已变化，请刷新核对');
    save(userId, marker, true);
    sent = true;
    const id = await cancelRecharge(expected.id);
    if (!validId(id) || String(id) !== String(expected.id)) throw new Error('取消申报回执缺失或不匹配，请核对原记录');
    return retain(userId, { ...marker, state: 'confirmed' });
  } catch (error) {
    if (sent && error instanceof RequestError && error.kind === 'config') {
      try {
        const records = readRechargeCancelReceipts(userId);
        if (records.some(item => String(item.id) === String(marker.id) && item.attempt === marker.attempt && item.state === 'unknown')) {
          const next = records.filter(item => String(item.id) !== String(marker.id));
          uni.setStorageSync(keyFor(userId), next);
          if (!readStored(userId).some(item => String(item.id) === String(marker.id))) memory.set(userId, next);
        }
      } catch { /* 保留保护，禁止无依据重发。 */ }
    }
    throw error;
  } finally { running.delete(lock); }
}

export async function reconcileRechargeCancel(userId: string, id: string | number, stillActive: () => boolean) {
  const token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!current()) return;
  const receipt = readRechargeCancelReceipts(userId).find(item => String(item.id) === String(id));
  if (!receipt || receipt.state === 'verified') return receipt;
  try {
    const detail = await fetchRechargeDetail(id);
    if (!current() || !sameRecord(receipt, detail) || !['CANCELED', 'CONFIRMED'].includes(detail.status)
      || (receipt.state === 'confirmed' && detail.status !== 'CANCELED')) return receipt;
    return retain(userId, { ...receipt, state: 'verified', terminalStatus: detail.status as 'CANCELED' | 'CONFIRMED' });
  } catch { return receipt; }
}

export function rechargeCancelMessage(receipt: RechargeCancelReceipt) {
  if (receipt.state === 'unknown') return '取消结果尚未确认，本机已阻止重复取消，请核对原申报';
  if (receipt.state === 'confirmed') return '取消请求已成功，申报最新状态待核对';
  return receipt.terminalStatus === 'CANCELED' ? '已核对：本次申报已取消；后续链上到账仍可能自动入账' : '已核对：本次申报已到账，不代表取消成功';
}
