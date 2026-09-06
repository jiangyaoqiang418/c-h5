import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useUserStore } from '@/stores/user';
import { createRecharge, createWithdraw, fetchRechargeByKey, fetchWithdrawByKey, fetchRechargeChains, fetchWalletOverview, type RechargeParams, type WithdrawParams } from '@/service/api/wallet';
import { fetchFinanceOrderByKey, fetchFinanceProductDetail, subscribeFinance } from '@/service/api/finance';
import { formatRate } from './format-bridge';
import { normalizeAmount } from './amount';
import { isMissingOperationRecord } from './storage';
import { go } from '@/utils/navigate';
import { usePageOperation } from './page-operation';

type Requests = { withdraw: WithdrawParams; recharge: RechargeParams; finance: Api.RealFinance.SubscribeParams };
type Kind = keyof Requests;
type Receipt = { version: 2; userId: string; kind: Kind; request: Requests[Kind] & { idempotencyKey: string }; recordId?: string | number; verified?: boolean };
const active = new Set<string>();
const memory = new Map<string, Receipt>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const validId = (value: unknown): value is string | number => typeof value === 'string' ? !!value.trim() : typeof value === 'number' && Number.isSafeInteger(value);

/** 原参数与键跨刷新保留；只有 by-key 明确返回 null 才能确认后重试原请求。 */
export function useSubmissionGuard<K extends Kind>(kind: K, historyUrl: string) {
  const userStore = useUserStore();
  const uncertain = ref(false);
  const running = ref(false);
  const submittedId = ref<string | number>();
  const verified = ref(false);
  const page = usePageOperation(() => { running.value = false; uncertain.value = false; submittedId.value = undefined; verified.value = false; });
  const message = computed(() => submittedId.value != null ? '申请已提交，回执已保留；请查看原记录。' : '上次提交结果待核对，请勿重复操作。网络超时不代表后台未受理。');
  const actionLabel = computed(() => verified.value ? '开始新的申请' : '核对并继续');
  function key() {
    if (!userStore.realUserId) throw new Error('请先登录并加载账户资料');
    return `bw_h5_submission_guard_v1:${String(userStore.realUserId)}:${kind}`;
  }
  function validateRequest(request: Requests[Kind]) {
    if (!request || normalizeAmount(request.amount) === '0') throw new Error('申请金额无效');
    if (kind === 'finance' ? !('productId' in request && validId(request.productId))
      : !('chain' in request && typeof request.chain === 'string' && request.chain.trim())) throw new Error('原申请参数不完整');
    if (kind === 'withdraw' && !('toAddress' in request && typeof request.toAddress === 'string' && request.toAddress.trim())) throw new Error('原申请地址不完整');
  }
  function read(recordKey: string): Receipt | 'legacy' | undefined {
    const stored = uni.getStorageSync(recordKey), cached = memory.get(recordKey);
    if (isMissingOperationRecord(recordKey, stored)) return cached ? clone(cached) : undefined;
    if (typeof stored === 'string') return 'legacy';
    const r = stored as Receipt;
    if (r.version !== 2 || r.kind !== kind || `bw_h5_submission_guard_v1:${r.userId}:${kind}` !== recordKey
      || !r.request || typeof r.request.idempotencyKey !== 'string' || !r.request.idempotencyKey || r.request.idempotencyKey.length > 64
      || (r.recordId != null && !validId(r.recordId)) || (r.verified != null && typeof r.verified !== 'boolean')
      || (r.verified && r.recordId == null)) throw new Error('本机申请记录损坏，请先查看原记录');
    validateRequest(r.request);
    if (cached && JSON.stringify(cached.request) !== JSON.stringify(r.request)) throw new Error('本机申请记录冲突，请先查看原记录');
    if (cached?.recordId != null && r.recordId != null && String(cached.recordId) !== String(r.recordId)) throw new Error('申请回执冲突，请先核对');
    return clone(cached?.verified || (cached?.recordId != null && r.recordId == null) ? cached : r);
  }
  function save(recordKey: string, r: Receipt, beforeSend = false) {
    const previous = read(recordKey);
    if (beforeSend ? !!previous : !previous || previous === 'legacy' || JSON.stringify(previous.request) !== JSON.stringify(r.request)) throw new Error('原申请已变化，请重新核对');
    if (previous && previous !== 'legacy' && previous.recordId != null && r.recordId != null && String(previous.recordId) !== String(r.recordId)) throw new Error('申请回执不一致');
    if (!beforeSend) memory.set(recordKey, clone(r));
    try {
      uni.setStorageSync(recordKey, clone(r));
      if (JSON.stringify(uni.getStorageSync(recordKey)) !== JSON.stringify(r)) throw new Error();
      memory.set(recordKey, clone(r));
    } catch { if (beforeSend) throw new Error('无法保存原申请，本次未提交'); }
  }
  function refresh() {
    submittedId.value = undefined; verified.value = false;
    if (!userStore.realUserId) { uncertain.value = false; return; }
    try {
      const r = read(key());
      submittedId.value = r && r !== 'legacy' ? r.recordId : undefined;
      verified.value = !!r && r !== 'legacy' && r.verified === true;
      uncertain.value = !!r && submittedId.value == null;
    } catch { uncertain.value = true; }
  }
  onShow(refresh);
  async function send(recordKey: string, r: Receipt) {
    const request = clone(r.request);
    const id = kind === 'withdraw' ? await createWithdraw(request as WithdrawParams)
      : kind === 'recharge' ? await createRecharge(request as RechargeParams) : await subscribeFinance(request as Api.RealFinance.SubscribeParams);
    if (!validId(id)) throw new Error('提交回执缺失，请核对原申请');
    save(recordKey, { ...r, recordId: id });
    return id;
  }
  async function run(request: Requests[K]): Promise<string | number> {
    const operation = page.capture();
    if (!operation.isCurrent()) throw new Error('请返回操作页面后重新确认');
    const recordKey = key();
    if (active.has(recordKey) || read(recordKey)) throw new Error('请先核对原申请；新业务需明确开始新的申请');
    validateRequest(request);
    const original: Requests[Kind] = clone(request);
    const r: Receipt = { version: 2, userId: String(userStore.realUserId), kind,
      request: { ...original, idempotencyKey: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}` } };
    save(recordKey, r, true);
    active.add(recordKey); running.value = true; refresh();
    try { return await send(recordKey, r); }
    finally { active.delete(recordKey); if (operation.sameSession()) { running.value = false; refresh(); } }
  }
  async function lookup(recordKey: string, r: Receipt, current: () => boolean) {
    const result = kind === 'withdraw' ? await fetchWithdrawByKey(r.request.idempotencyKey)
      : kind === 'recharge' ? await fetchRechargeByKey(r.request.idempotencyKey) : await fetchFinanceOrderByKey(r.request.idempotencyKey);
    if (!current()) throw new Error('页面或账号已变化，请返回后核对');
    if (result === null) {
      if (r.recordId != null) throw new Error('已有成功回执但回查为空，请查看原记录，不能重复申请');
      return null;
    }
    if (!result || !validId(result.id) || (r.recordId != null && String(r.recordId) !== String(result.id))) throw new Error('原申请回查不完整或不匹配');
    const statuses = kind === 'finance' ? ['HOLDING', 'REDEEMED', 'SETTLED', 'CANCELED']
      : kind === 'recharge' ? ['PENDING', 'CONFIRMED', 'CANCELED'] : ['REVIEWING', 'APPROVED', 'SUCCESS', 'REJECTED'];
    if (!statuses.includes(result.status)) throw new Error('原申请状态缺失或无法识别，请查看原记录');
    const matches = kind === 'finance'
      ? 'productId' in result && 'productId' in r.request && String(result.productId) === String(r.request.productId) && normalizeAmount(result.principal) === normalizeAmount(r.request.amount)
      : 'chain' in result && 'chain' in r.request && result.chain === r.request.chain && normalizeAmount(result.amount) === normalizeAmount(r.request.amount)
        && (kind !== 'withdraw' || ('toAddress' in result && 'toAddress' in r.request && result.toAddress === r.request.toAddress));
    if (!matches) throw new Error('原申请参数与回查记录不一致，已保留保护');
    save(recordKey, { ...r, recordId: result.id, verified: true });
    return result.id;
  }
  function navigate(id: string | number) {
    go(kind === 'finance' ? `${historyUrl}?id=${encodeURIComponent(String(id))}` : `/pages/wallet/${kind === 'withdraw' ? 'withdraw' : 'recharge'}-detail?id=${encodeURIComponent(String(id))}`);
  }
  async function retryTerms(r: Receipt, current: () => boolean) {
    const numeric = (value: unknown) => value != null && /^\d+(\.\d+)?$/.test(String(value).trim()) && Number.isFinite(Number(value)) ? Number(value) : undefined;
    const amount = Number(r.request.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('原申请金额无效');
    let terms: unknown[], summary: string;
    if (kind === 'finance' && 'productId' in r.request) {
      const product = await fetchFinanceProductDetail(r.request.productId);
      if (!current()) throw new Error('页面或账号已变化');
      const min = numeric(product?.minAmount), max = numeric(product?.maxAmount), quota = numeric(product?.remainingQuota), rate = numeric(product?.annualRate);
      if (!product || String(product.id) !== String(r.request.productId) || product.status !== 'ON_SALE'
        || min == null || amount < min || (product.maxAmount != null && (max == null || amount > max))
        || (product.remainingQuota != null && (quota == null || amount > quota))
        || rate == null || !Number.isSafeInteger(product.lockDays) || product.lockDays < 0) throw new Error('原产品的申购条件已不满足，请查看原记录');
      terms = [String(product.id), product.name, String(product.annualRate), product.lockDays, String(product.minAmount), product.maxAmount == null ? null : String(product.maxAmount), product.status];
      summary = `产品“${product.name}”，年化 ${formatRate(Number(product.annualRate))}，锁定 ${product.lockDays} 天`;
    } else if ('chain' in r.request) {
      summary = `${r.request.chain}${'toAddress' in r.request ? `，地址 ${r.request.toAddress}` : ''}`;
      terms = [r.request.chain];
      if (kind === 'recharge') {
        const chains = await fetchRechargeChains();
        if (!current()) throw new Error('页面或账号已变化');
        const chain = chains.find(item => item.chain === (r.request as RechargeParams).chain && item.enabled !== false);
        const min = numeric(chain?.minAmount);
        if (!chain || (chain.minAmount != null && (min == null || amount < min))) throw new Error('原充值链或最低金额条件已变化，请查看原记录');
        terms = [chain.chain, chain.label, chain.minAmount == null ? null : String(chain.minAmount)];
      }
    } else throw new Error('原申请参数不完整');
    if (kind !== 'recharge') {
      const wallet = await fetchWalletOverview();
      if (!current()) throw new Error('页面或账号已变化');
      const available = numeric(wallet.account.available);
      if (available == null || amount > available) throw new Error('当前可用余额不足以重试原申请');
    }
    return { fingerprint: JSON.stringify(terms), summary };
  }
  async function recover(continueOperation: boolean) {
    if (!page.visible.value || !userStore.realUserId || running.value) return;
    const operation = page.capture(), recordKey = key();
    if (active.has(recordKey)) return;
    active.add(recordKey); running.value = true;
    try {
      const r = read(recordKey);
      if (!r) return;
      if (r === 'legacy') {
        if (!continueOperation) go(historyUrl);
        else uni.showToast({ title: '旧记录没有幂等键，只能核对历史，不能作为原请求重试', icon: 'none' });
        return;
      }
      const id = await lookup(recordKey, r, operation.isCurrent);
      refresh();
      if (id != null) {
        if (!continueOperation || !r.verified) { navigate(id); return; }
        const answer = await uni.showModal({ title: '开始新的申请', content: '原申请已经核对。本次将作为一笔独立的新业务，不会取消或变更原记录。', confirmText: '新的申请' });
        if (!answer.confirm || !operation.isCurrent()) return;
        const latest = read(recordKey);
        if (!latest || latest === 'legacy' || latest.request.idempotencyKey !== r.request.idempotencyKey) return;
        uni.removeStorageSync(recordKey);
        if (!isMissingOperationRecord(recordKey, uni.getStorageSync(recordKey))) throw new Error('本机申请记录未能清理');
        memory.delete(recordKey);
      } else if (continueOperation) {
        const terms = await retryTerms(r, operation.isCurrent);
        const answer = await uni.showModal({ title: '重试原申请', content: `尚未查到原记录。确认按原参数 ${terms.summary}、U ${r.request.amount} 重试吗？使用原幂等键，不采用当前表单的新值。`, confirmText: '重试原申请' });
        if (!answer.confirm || !operation.isCurrent()) return;
        const latestTerms = await retryTerms(r, operation.isCurrent);
        if (latestTerms.fingerprint !== terms.fingerprint) throw new Error('原申请条件再次变化，请重新核对后确认');
        const latest = read(recordKey);
        if (!latest || latest === 'legacy' || latest.request.idempotencyKey !== r.request.idempotencyKey || latest.recordId != null) return;
        const originalId = await send(recordKey, r);
        if (operation.isCurrent()) navigate(originalId);
      } else uni.showToast({ title: '尚未查到原申请，可通过“核对并继续”确认后重试', icon: 'none' });
    } catch (error) {
      if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '原申请核对失败，请稍后重试', icon: 'none' });
    } finally { active.delete(recordKey); if (operation.sameSession()) { running.value = false; refresh(); } }
  }
  return { uncertain, running, submittedId, message, actionLabel, refresh, run, review: () => recover(false), acknowledge: () => recover(true) };
}
