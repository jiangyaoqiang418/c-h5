import { fetchKycDetail, submitKyc } from '@/service/api/kyc';
import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';

type Snapshot = Omit<Api.RealKyc.SubmitParams, 'idNo'> & { maskedIdNo: string };
export interface KycCreateReceipt {
  attempt: string;
  snapshot: Snapshot;
  before: { id: Api.RealKyc.Id; submittedAt?: Api.RealKyc.Id } | null;
  state: 'unknown' | 'confirmed' | 'verified';
  recordId?: Api.RealKyc.Id;
  submittedAt?: Api.RealKyc.Id;
  observed?: boolean;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const validId = (value: unknown) => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);
const keyFor = (userId: string) => `bw_h5_kyc_create_v1:${encodeURIComponent(userId)}`;
const memory = new Map<string, KycCreateReceipt>();
const running = new Set<string>();
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const origin = (r: KycCreateReceipt) => JSON.stringify([r.snapshot, r.before]);

export function kycVersion(record: Api.RealKyc.DetailVO | null) {
  return record ? JSON.stringify([String(record.id), record.status, record.submittedAt ?? null, record.reviewedAt ?? null, record.expireAt ?? null]) : 'none';
}
export function kycCanApply(record: Api.RealKyc.DetailVO | null) {
  if (!record) return true;
  if (!validId(record.id)) return false;
  if (record.status === 'REJECTED') return true;
  const expiry = Number(record.expireAt);
  return record.status === 'PASSED' && record.expireAt != null && String(record.expireAt).trim() !== ''
    && Number.isSafeInteger(expiry) && expiry > 0 && expiry <= Date.now();
}
function snapshotOf(request: Api.RealKyc.SubmitParams): Snapshot {
  // 证件号仅保存契约定义的脱敏形式；不保存原号码或任何临时签名地址。
  return { realName: request.realName, idType: request.idType, maskedIdNo: `${request.idNo.slice(0, 3)}***${request.idNo.slice(-4)}`,
    nationality: request.nationality, idCardFrontFileId: request.idCardFrontFileId,
    idCardBackFileId: request.idCardBackFileId, holdingPhotoFileId: request.holdingPhotoFileId };
}
function validateSnapshot(s: Snapshot) {
  if (!s || typeof s.realName !== 'string' || !s.realName.trim() || s.realName.length > 64
    || !['ID_CARD', 'PASSPORT'].includes(s.idType) || typeof s.maskedIdNo !== 'string' || !s.maskedIdNo.includes('***')
    || !validId(s.idCardFrontFileId) || (s.idType === 'ID_CARD' && !validId(s.idCardBackFileId))
    || (s.idCardBackFileId != null && !validId(s.idCardBackFileId)) || (s.idType === 'PASSPORT' && s.idCardBackFileId != null)
    || (s.holdingPhotoFileId != null && !validId(s.holdingPhotoFileId))
    || (s.nationality != null && (typeof s.nationality !== 'string' || s.nationality.length > 64))) throw new Error('认证原提交资料不完整，请先核对');
}
function readStored(userId: string): KycCreateReceipt | undefined {
  if (!userId) throw new Error('请先加载账户资料');
  const r = uni.getStorageSync(keyFor(userId));
  if (r == null || r === '') return;
  if (!r || typeof r.attempt !== 'string' || !r.attempt || !['unknown', 'confirmed', 'verified'].includes(r.state)
    || (r.before !== null && (!r.before || !validId(r.before.id) || (r.before.submittedAt != null && !validId(r.before.submittedAt))))
    || (r.recordId != null && !validId(r.recordId)) || (r.state !== 'unknown' && !validId(r.recordId))
    || (r.submittedAt != null && !validId(r.submittedAt)) || (r.observed != null && typeof r.observed !== 'boolean')) throw new Error('本机认证提交记录损坏，请先核对');
  validateSnapshot(r.snapshot);
  return r;
}
export function readKycCreateReceipt(userId: string) {
  const stored = readStored(userId), cached = memory.get(userId);
  if (stored && cached && (stored.attempt !== cached.attempt || origin(stored) !== origin(cached)
    || (stored.recordId != null && cached.recordId != null && String(stored.recordId) !== String(cached.recordId)))) throw new Error('认证提交记录冲突，请先核对');
  const receipt = !stored || (cached && rank[cached.state] > rank[stored.state]) ? cached : stored;
  return receipt ? clone(receipt) : undefined;
}
function save(userId: string, receipt: KycCreateReceipt, beforeSend = false) {
  if (!beforeSend && receipt.state !== 'unknown') {
    const cached = memory.get(userId);
    if (!cached || (cached.attempt === receipt.attempt && origin(cached) === origin(receipt)
      && (cached.recordId == null || String(cached.recordId) === String(receipt.recordId)) && rank[cached.state] <= rank[receipt.state])) memory.set(userId, clone(receipt));
  }
  const previous = readKycCreateReceipt(userId);
  if (beforeSend && previous) throw new Error('已有原认证提交，请先核对');
  if (previous && (previous.attempt !== receipt.attempt || origin(previous) !== origin(receipt)
    || (previous.recordId != null && receipt.recordId != null && String(previous.recordId) !== String(receipt.recordId)))) throw new Error('原认证提交已变化');
  if (previous && rank[previous.state] > rank[receipt.state]) return previous;
  try {
    uni.setStorageSync(keyFor(userId), clone(receipt));
    if (JSON.stringify(readStored(userId)) !== JSON.stringify(receipt)) throw new Error();
    memory.set(userId, clone(receipt));
  } catch { if (beforeSend) throw new Error('无法保存认证提交进度，本次未发送'); }
  return receipt;
}
function matches(record: Api.RealKyc.DetailVO, r: KycCreateReceipt) {
  const s = r.snapshot;
  return validId(record.id) && ['PENDING', 'PASSED', 'REJECTED'].includes(record.status)
    && record.realName === s.realName && record.idType === s.idType && record.idNo === s.maskedIdNo
    && (record.nationality ?? '') === (s.nationality ?? '')
    && String(record.idCardFrontFileId) === String(s.idCardFrontFileId)
    && String(record.idCardBackFileId ?? '') === String(s.idCardBackFileId ?? '')
    && String(record.holdingPhotoFileId ?? '') === String(s.holdingPhotoFileId ?? '');
}
function newSubmission(record: Api.RealKyc.DetailVO, r: KycCreateReceipt) {
  return !r.before || String(record.id) !== String(r.before.id)
    || (record.submittedAt != null && String(record.submittedAt) !== String(r.before.submittedAt ?? ''));
}
export async function reconcileKycCreation(stillActive: () => boolean) {
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => !!userId && !!token && userId === useUserStore().realUserId && token === getAccessToken() && stillActive();
  if (!userId || !current()) return;
  const receipt = readKycCreateReceipt(userId);
  if (!receipt || receipt.state === 'verified') return receipt;
  const record = await fetchKycDetail();
  if (!current() || !record) return receipt;
  if ((receipt.recordId != null && String(record.id) !== String(receipt.recordId)) || !matches(record, receipt)) throw new Error('最新认证与原提交信息不一致，尚未解除提交保护');
  if (!newSubmission(record, receipt)) return receipt;
  return save(userId, { ...receipt, recordId: record.id, submittedAt: record.submittedAt, state: 'verified', observed: receipt.observed || receipt.state === 'unknown' });
}

export async function submitKycWithReceipt(params: Api.RealKyc.SubmitParams, expectedVersion: string, stillActive: () => boolean) {
  const request = clone(params);
  if (typeof request.idNo !== 'string' || !request.idNo.trim() || request.idNo.length > 64) throw new Error('请填写 64 字以内证件号码');
  const snapshot = snapshotOf(request); validateSnapshot(snapshot);
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => !!userId && !!token && userId === useUserStore().realUserId && token === getAccessToken() && stillActive();
  if (!userId || !current()) throw new Error('认证页面或账号已变化');
  if (running.has(userId) || readKycCreateReceipt(userId)) throw new Error('已有认证提交，请先核对原记录');
  running.add(userId);
  let marker: KycCreateReceipt | undefined, sent = false;
  try {
    const confirm = await uni.showModal({ title: '确认提交认证', content: '提交后将进入平台审核，请确认姓名、证件号和影像资料准确。' });
    if (!confirm.confirm || !current()) return;
    await useUserStore().refreshProfile();
    if (!current()) return;
    const before = await fetchKycDetail();
    if (!current()) return;
    if (kycVersion(before) !== expectedVersion || !kycCanApply(before)
      || (!before && ['approved', 'pending'].includes(useUserStore().currentUser?.kycStatus || ''))) throw new Error('认证状态已变化，请刷新后操作');
    marker = { attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, snapshot,
      before: before ? { id: before.id, submittedAt: before.submittedAt } : null, state: 'unknown' };
    save(userId, marker, true);
    sent = true;
    const recordId = await submitKyc(request);
    if (!validId(recordId)) throw new Error('认证提交回执缺失，请核对原记录');
    return save(userId, { ...marker, recordId, state: 'confirmed' });
  } catch (error) {
    if (sent && marker && error instanceof RequestError && error.kind === 'config') {
      try {
        const receipt = readKycCreateReceipt(userId);
        if (receipt?.attempt === marker.attempt && receipt.state === 'unknown') {
          uni.removeStorageSync(keyFor(userId));
          if (readStored(userId)) throw new Error();
          memory.delete(userId);
        }
      } catch { /* 无法确认未发送记录已清理时继续防重。 */ }
    }
    throw error;
  } finally { running.delete(userId); }
}

/** 只有原提交已核对且被驳回/过期时，才显式开始下一次；不删除后台资料。 */
export async function startNextKyc(attempt: string, stillActive: () => boolean) {
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => !!userId && !!token && userId === useUserStore().realUserId && token === getAccessToken() && stillActive();
  if (!userId || !current() || running.has(userId)) return false;
  running.add(userId);
  try {
    const receipt = readKycCreateReceipt(userId);
    if (!receipt || receipt.attempt !== attempt || receipt.state !== 'verified') return false;
    const record = await fetchKycDetail();
    if (!current()) return false;
    if (!record || String(record.id) !== String(receipt.recordId) || !matches(record, receipt)
      || String(record.submittedAt ?? '') !== String(receipt.submittedAt ?? '') || !kycCanApply(record)) throw new Error('原认证尚未驳回或过期，请刷新核对');
    const latest = readKycCreateReceipt(userId);
    if (!latest || latest.attempt !== receipt.attempt || latest.state !== 'verified') return false;
    uni.removeStorageSync(keyFor(userId));
    if (readStored(userId)) throw new Error('原认证进度未能清理');
    memory.delete(userId);
    return true;
  } finally { running.delete(userId); }
}
export function kycCreateMessage(receipt: KycCreateReceipt) {
  if (receipt.state === 'unknown') return '认证提交结果未知，请核对原记录，不要重复提交';
  if (receipt.state === 'confirmed') return '认证已提交，原记录仍待核对';
  return receipt.observed ? '已观察到与原资料一致的认证记录，审核结果以最新状态为准' : '已核对原认证记录，审核结果以最新状态为准';
}
