import { createAddress, deleteAddress, fetchAddressDetail, fetchMyAddresses, setDefaultAddress, type AddressForm, type AddressRecord } from '@/service/api/address';
import { getAccessToken } from '@/service/request/token';
import { RequestError } from '@/service/request';
import { useUserStore } from '@/stores';

export interface AddressReceipt {
  attempt: string;
  action: 'create' | 'default' | 'delete';
  state: 'unknown' | 'confirmed' | 'verified';
  id?: Api.RealAddress.LongId;
  form?: AddressForm;
  beforeIds?: string[];
  observed?: boolean;
  wasDefault?: boolean;
}
const memory = new Map<string, AddressReceipt>();
const running = new Set<string>();
const rank = { unknown: 0, confirmed: 1, verified: 2 };
const keyFor = (userId: string) => `bw_h5_address_operation_v1:${encodeURIComponent(userId)}`;
const validId = (id: unknown) => typeof id === 'string' ? !!id.trim() : typeof id === 'number' && Number.isSafeInteger(id);
const formKeys = ['receiverName', 'receiverPhone', 'province', 'city', 'district', 'detail'] as const;
const sameForm = (a: AddressForm, b: AddressRecord) => b.country === '中国' && formKeys.every(key => a[key] === b[key]);
const sameAddress = (a: AddressRecord, b: AddressRecord) => String(a.id) === String(b.id) && a.country === b.country
  && formKeys.every(key => a[key] === b[key]) && a.isDefault === b.isDefault;

export function validateAddressList(records: AddressRecord[]) {
  if (!Array.isArray(records) || records.length > 20 || records.some(record => !record || !validId(record.id)
    || typeof record.isDefault !== 'boolean') || new Set(records.map(record => String(record.id))).size !== records.length
    || records.filter(record => record.isDefault).length > 1) throw new Error('地址列表不完整或默认状态冲突，请重新读取');
  return records;
}

function readStored(userId: string): AddressReceipt | undefined {
  if (!userId) throw new Error('请先登录并加载账号资料');
  const value = uni.getStorageSync(keyFor(userId));
  if (value == null || value === '') return;
  if (!value || typeof value.attempt !== 'string' || !value.attempt || !['create', 'default', 'delete'].includes(value.action)
    || !['unknown', 'confirmed', 'verified'].includes(value.state) || (value.id != null && !validId(value.id))
    || (value.observed != null && typeof value.observed !== 'boolean') || (value.action === 'delete' && typeof value.wasDefault !== 'boolean')
    || (value.action !== 'create' && !validId(value.id)) || (value.state !== 'unknown' && !validId(value.id))
    || (value.action === 'create' && (!value.form || formKeys.some(key => typeof value.form[key] !== 'string')
      || typeof value.form.isDefault !== 'boolean' || !Array.isArray(value.beforeIds) || value.beforeIds.length > 20
      || value.beforeIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
      || new Set(value.beforeIds).size !== value.beforeIds.length))) throw new Error('本机地址操作记录读取失败，请先核对，不要重复提交');
  return value;
}

export function readAddressReceipt(userId: string): AddressReceipt | undefined {
  const stored = readStored(userId), cached = memory.get(userId);
  if (stored && cached && stored.attempt !== cached.attempt && cached.state !== 'verified') throw new Error('地址操作记录冲突，请先核对');
  if (stored && cached && stored.attempt === cached.attempt && (stored.action !== cached.action
    || (stored.id != null && cached.id != null && String(stored.id) !== String(cached.id))
    || JSON.stringify(stored.form) !== JSON.stringify(cached.form) || JSON.stringify(stored.beforeIds) !== JSON.stringify(cached.beforeIds)
    || stored.wasDefault !== cached.wasDefault)) throw new Error('地址操作快照冲突，请先核对');
  const receipt = cached && (!stored || (stored.attempt === cached.attempt && rank[cached.state] > rank[stored.state])) ? cached : stored;
  return receipt ? JSON.parse(JSON.stringify(receipt)) : undefined;
}

function save(userId: string, receipt: AddressReceipt, beforeSend = false) {
  const previous = readAddressReceipt(userId);
  if (previous && previous.attempt !== receipt.attempt && previous.state !== 'verified') throw new Error('已有地址操作结果待核对');
  if (previous?.attempt === receipt.attempt && rank[previous.state] > rank[receipt.state]) return previous;
  if (!beforeSend) memory.set(userId, receipt);
  try {
    const expected = JSON.stringify(receipt);
    uni.setStorageSync(keyFor(userId), JSON.parse(expected));
    if (JSON.stringify(readStored(userId)) !== expected) throw new Error();
    memory.set(userId, receipt);
  } catch { if (beforeSend) throw new Error('无法保存地址操作进度，本次未提交'); }
  return receipt;
}

function retain(userId: string, receipt: AddressReceipt) {
  try { return save(userId, receipt); } catch {
    const previous = memory.get(userId);
    if (previous?.attempt === receipt.attempt && rank[previous.state] > rank[receipt.state]) return previous;
    memory.set(userId, receipt);
    return receipt;
  }
}

/** 调用方须传入同会话刚读取的完整地址列表；缺席仅确认当前状态，不冒充未知请求成功。 */
export function reconcileAddressReceipt(userId: string, records: AddressRecord[]) {
  validateAddressList(records);
  const receipt = readAddressReceipt(userId);
  if (!receipt || receipt.state === 'verified') return receipt;
  let id = receipt.id;
  if (receipt.action === 'create') {
    const matches = records.filter(record => !receipt.beforeIds!.includes(String(record.id)) && sameForm(receipt.form!, record)
      && (!(receipt.form!.isDefault || !receipt.beforeIds!.length) || record.isDefault));
    if (receipt.state === 'confirmed') {
      if (!matches.some(record => String(record.id) === String(id))) return receipt;
    } else {
      if (matches.length !== 1) return receipt;
      id = matches[0].id;
    }
  } else if (receipt.action === 'default') {
    if (!records.some(record => String(record.id) === String(id) && record.isDefault)) return receipt;
  } else if (records.some(record => String(record.id) === String(id))
    || (receipt.wasDefault && records.length && records.filter(record => record.isDefault).length !== 1)) return receipt;
  return retain(userId, { ...receipt, id, state: 'verified', observed: receipt.state === 'unknown' });
}

export async function runAddressOperation(action: AddressReceipt['action'], input: AddressForm | AddressRecord, stillActive: () => boolean) {
  input = { ...input };
  const userId = useUserStore().realUserId, token = getAccessToken();
  const current = () => stillActive() && !!token && token === getAccessToken() && userId === useUserStore().realUserId;
  if (!userId || !current()) throw new Error('地址页面或账号已变化');
  if (running.has(userId) || (readAddressReceipt(userId)?.state || 'verified') !== 'verified') throw new Error('上次地址操作结果待核对，请勿重复提交');
  running.add(userId);
  const marker: AddressReceipt = { attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, action, state: 'unknown' };
  let sent = false;
  try {
    const records = validateAddressList(await fetchMyAddresses());
    if (!current()) return;
    if (action === 'create') {
      if (records.length >= 20) throw new Error('最多保存 20 条地址，请先整理已有地址');
      const form = input as AddressForm;
      marker.form = { ...form };
      marker.beforeIds = records.map(record => String(record.id));
    } else {
      const expected = input as AddressRecord;
      if (!validId(expected.id) || !records.some(record => sameAddress(expected, record))) throw new Error('原地址或默认状态已变化，请刷新后操作');
      const latest = await fetchAddressDetail(expected.id);
      if (!current()) return;
      if (!sameAddress(expected, latest)) throw new Error('原地址已变化，请刷新后操作');
      marker.id = expected.id;
      if (action === 'delete') marker.wasDefault = latest.isDefault;
      if (action === 'default' && latest.isDefault) return;
    }
    save(userId, marker, true);
    sent = true;
    if (action === 'create') {
      const id = await createAddress(marker.form!);
      if (!validId(id) || marker.beforeIds!.includes(String(id))) throw new Error('新增地址回执缺失或指向旧地址，请先核对');
      return retain(userId, { ...marker, id, state: 'confirmed' });
    }
    if (action === 'default') await setDefaultAddress(marker.id!);
    else await deleteAddress(marker.id!);
    return retain(userId, { ...marker, state: 'confirmed' });
  } catch (error) {
    if (sent && error instanceof RequestError && error.kind === 'config') {
      try {
        if (readAddressReceipt(userId)?.attempt === marker.attempt) {
          uni.removeStorageSync(keyFor(userId));
          if (!readStored(userId)) memory.delete(userId);
        }
      } catch { /* 无法确认未发送标记已移除时继续保留保护。 */ }
    }
    throw error;
  } finally { running.delete(userId); }
}

export function addressReceiptMessage(receipt: AddressReceipt) {
  if (receipt.state === 'unknown') return '上次地址操作结果未知，请刷新核对，本机已阻止重复提交';
  if (receipt.state === 'confirmed') return '地址操作请求已成功，最新地址状态待核对';
  if (receipt.observed) return receipt.action === 'create' ? '已找到与上次提交一致的新地址，不会重复新增'
    : receipt.action === 'default' ? '已核对目标地址当前为默认，不代表原请求回执已确认' : '已核对原地址不在当前完整列表，不代表原删除回执已确认';
  return receipt.action === 'create' ? '已核对：新地址已添加' : receipt.action === 'default' ? '已核对：默认地址已更新' : '已核对：原地址已删除';
}
