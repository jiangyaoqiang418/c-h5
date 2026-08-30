<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onReachBottom, onShow } from '@dcloudio/uni-app';
import { usePagedList } from '@/utils/paged-list';
import { fetchFinanceOrderDetail, fetchFinanceOrders, redeemFinanceOrder } from '@/service/api/finance';
import LockupCard from '@/components/finance/lockup-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';
import { useNavigationGuards } from '@/utils/navigate';
import { RequestError } from '@/service/request';

const walletStore = useWalletStore();
const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const activeKey = ref<Api.RealFinance.OrderStatus>('HOLDING');
const redeemingId = ref<Api.RealFinance.Id>();
type RedemptionReceipt = { id: Api.RealFinance.Id; attempt: string; state: 'unknown' | 'confirmed' | 'verified' };
const receipts = ref(new Map<string, RedemptionReceipt>());
const recoveryFailed = ref(false);
const reading = ref(false);
const awaitingReadback = computed(() => [...receipts.value.values()].some(item => item.state !== 'verified'));
let retryReset = true;
let filterVersion = 0;
let readVersion = 0;
const page = usePageOperation(() => {
  readVersion++;
  reading.value = false;
  redeemingId.value = undefined;
  receipts.value = new Map();
  recoveryFailed.value = false;
  retryReset = true;
});

function storageKey() {
  if (!userStore.realUserId) throw new Error('账户资料尚未加载');
  return `bw_h5_redemption_receipts_v1:${String(userStore.realUserId)}`;
}

function storedReceipts(key: string): RedemptionReceipt[] {
  const stored = uni.getStorageSync(key);
  if (!stored) return [];
  if (!Array.isArray(stored) || stored.some(item => !item || !['string', 'number'].includes(typeof item.id)
    || !String(item.id).trim() || (typeof item.id === 'number' && !Number.isFinite(item.id))
    || typeof item.attempt !== 'string' || !item.attempt || !['unknown', 'confirmed', 'verified'].includes(item.state))) {
    throw new Error('本机赎回回执无法识别，请先核对记录；未发送新请求');
  }
  return stored;
}

function readReceipts() {
  try {
    const saved = storedReceipts(storageKey());
    const merged = new Map(receipts.value);
    saved.forEach(item => {
      const local = merged.get(String(item.id));
      if (!local || local.attempt !== item.attempt || local.state === 'unknown' || item.state === 'verified') merged.set(String(item.id), item);
    });
    receipts.value = merged;
    recoveryFailed.value = false;
  } catch (error) { recoveryFailed.value = true; throw error; }
}

function persistReceipt(key: string, receipt: RedemptionReceipt, remove = false) {
  const values = storedReceipts(key);
  const existing = values.find(item => String(item.id) === String(receipt.id));
  if (existing && existing.attempt !== receipt.attempt) throw new Error('已有另一笔赎回回执，请先刷新核对');
  // 成功记录不能被迟到的失败或未知状态覆盖。
  if (existing && ((remove && existing.state !== 'unknown') || (receipt.state === 'unknown' && existing.state !== 'unknown'))) return;
  const next = values.filter(item => String(item.id) !== String(receipt.id));
  if (!remove) next.push(receipt);
  uni.setStorageSync(key, next);
  const written = storedReceipts(key).find(item => String(item.id) === String(receipt.id));
  if (remove ? !!written : written?.attempt !== receipt.attempt || written.state !== receipt.state) throw new Error('无法保存赎回回执，请重试核对');
}

async function reconcileReceipts(current: () => boolean) {
  const key = storageKey();
  for (const receipt of [...receipts.value.values()]) {
    if (!current()) return;
    if (receipt.state === 'verified') continue;
    try {
      const order = await fetchFinanceOrderDetail(receipt.id);
      if (!current()) return;
      if (String(order.id) !== String(receipt.id) || !['REDEEMED', 'SETTLED', 'CANCELED'].includes(order.status)) continue;
      const verified: RedemptionReceipt = { ...receipt, state: 'verified' };
      persistReceipt(key, verified);
      receipts.value.set(String(receipt.id), verified);
    } catch { /* 详情或存储失败保留待回读标记，不能因列表缺席而重新开放赎回。 */ }
  }
}
const tabs: { key: Api.RealFinance.OrderStatus; label: string }[] = [{ key: 'HOLDING', label: '持仓中' }, { key: 'SETTLED', label: '已结算' }, { key: 'REDEEMED', label: '已赎回' }, { key: 'CANCELED', label: '已取消' }];
const { list, loading, loadFailed, hasMore, load: loadPage, invalidate } = usePagedList<Api.RealFinance.OrderVO>({
  key: item => item.id,
  preserveOnReset: true,
  fetch: async (pageNo, pageSize) => {
    const operation = page.capture();
    const status = activeKey.value;
    if (!operation.isCurrent() || !userStore.currentUser) throw new Error('请先登录查看持仓');
    const result = await fetchFinanceOrders({ pageNo, pageSize, status });
    if (!operation.isCurrent() || status !== activeKey.value) throw new Error('页面已切换');
    return result;
  }
});
async function load(reset = true) {
  if (!page.visible.value || reading.value || loading.value) return;
  const operation = page.capture();
  const version = filterVersion;
  const sequence = ++readVersion;
  const current = () => operation.isCurrent() && version === filterVersion && sequence === readVersion;
  reading.value = true;
  retryReset = reset;
  try {
    if (!await requireLogin('/pages/finance/my-lockups') || !current()) return;
    try { readReceipts(); } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '回执读取失败', icon: 'none' }); }
    await loadPage(reset);
    if (current() && redeemingId.value === undefined && !recoveryFailed.value) await reconcileReceipts(current);
  } catch (error) { if (current()) uni.showToast({ title: error instanceof Error ? error.message : '持仓读取失败', icon: 'none' }); }
  finally { if (sequence === readVersion) reading.value = false; }
}
onShow(() => load());
function invalidateRead() { readVersion++; reading.value = false; invalidate(); }
onHide(invalidateRead);
onReachBottom(() => { if (redeemingId.value === undefined && !loadFailed.value) void load(false); });
watch(activeKey, () => { filterVersion++; invalidateRead(); list.value = []; void load(); }, { flush: 'sync' });

function redemptionTerms(order: Api.RealFinance.OrderVO) {
  return JSON.stringify([String(order.productId), order.productName, String(order.principal), String(order.redeemableInterest), String(order.earlyRedeemFeeRate), order.canRedeem, order.status]);
}

function validAmounts(order: Api.RealFinance.OrderVO) {
  return [order.principal, order.redeemableInterest].every(value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) && Number(order.principal) > 0;
}
async function onRedeem(order: Api.RealFinance.OrderVO) {
  if (!page.visible.value || reading.value || loading.value || loadFailed.value || recoveryFailed.value || !userStore.currentUser || order.status !== 'HOLDING' || !order.canRedeem || receipts.value.has(String(order.id)) || redeemingId.value !== undefined
    || !list.value.some(item => String(item.id) === String(order.id))) return;
  const operation = page.capture();
  const version = filterVersion;
  const current = () => operation.isCurrent() && version === filterVersion;
  const orderId = order.id;
  redeemingId.value = orderId;
  let key = '';
  let marker: RedemptionReceipt | undefined;
  let sent = false;
  try {
    readReceipts();
    if (receipts.value.has(String(orderId))) return;
    const latest = await fetchFinanceOrderDetail(orderId);
    if (!current()) return;
    if (String(latest.id) !== String(orderId) || latest.status !== 'HOLDING' || !latest.canRedeem || !validAmounts(latest)) {
      uni.showToast({ title: '持仓状态已变化，请刷新后查看', icon: 'none' });
      return;
    }
    const interest = latest.redeemableInterest;
    const result = await uni.showModal({
      title: '提前赎回？',
      content: `赎回「${latest.productName}」本金 U ${latest.principal}，预计可得收益 U ${interest}。提前赎回可能影响实际收益，实际金额以后端处理结果为准。确认后将立即提交。`,
      confirmText: '确认赎回'
    });
    if (!result.confirm || !current()) return;
    const confirmed = await fetchFinanceOrderDetail(orderId);
    if (!current()) return;
    if (String(confirmed.id) !== String(orderId) || redemptionTerms(confirmed) !== redemptionTerms(latest) || !validAmounts(confirmed)) {
      uni.showToast({ title: '赎回条件或收益已变化，请刷新后重新确认', icon: 'none' });
      return;
    }
    readReceipts();
    if (receipts.value.has(String(orderId))) return;
    key = storageKey();
    marker = { id: orderId, attempt: `${Date.now()}-${Math.random().toString(36).slice(2)}`, state: 'unknown' };
    persistReceipt(key, marker);
    receipts.value.set(String(orderId), marker);
    sent = true;
    const receiptId = await redeemFinanceOrder(orderId);
    if (String(receiptId) !== String(orderId)) throw new Error('赎回回执缺失或不匹配，请核对记录');
    const receipt: RedemptionReceipt = { ...marker, state: 'confirmed' };
    try { persistReceipt(key, receipt); } catch { /* 原未知记录仍阻止重发，本页保留成功回执。 */ }
    if (!operation.sameSession()) return;
    receipts.value.set(String(orderId), receipt);
    if (!current()) return;
    uni.showToast({ title: '已提交赎回', icon: 'success' });
    await walletStore.refetch().catch(() => undefined);
  } catch (error) {
    if (sent && marker && error instanceof RequestError && (error.kind === 'business' || error.kind === 'config')) {
      try {
        persistReceipt(key, marker, true);
        if (operation.sameSession()) {
          receipts.value.delete(String(orderId));
          readReceipts();
        }
      } catch { /* 清理失败保留防重保护。 */ }
    }
    if (current()) uni.showToast({ title: sent && receipts.value.get(String(orderId))?.state === 'unknown' ? '赎回结果尚未确认，请刷新核对，勿重复提交' : error instanceof Error ? error.message : '提前赎回失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      redeemingId.value = undefined;
      if (page.visible.value) await load();
    }
  }
}
</script>

<template><view class="my-lockup-page yb-page yb-page--full-bleed"><view class="yb-sticky-tabs-frame"><wd-tabs v-model="activeKey"><wd-tab v-for="tab in tabs" :key="tab.key" :name="tab.key" :title="tab.label" /></wd-tabs></view><view class="list"><wd-button v-if="awaitingReadback || recoveryFailed" block plain :loading="loading" :disabled="redeemingId !== undefined" @click="load()">赎回回执待核对，点击刷新记录</wd-button><view v-if="loading && !list.length" class="loading"><wd-loading size="44rpx" /><text>正在加载持仓</text></view><view v-else-if="list.length"><LockupCard v-for="order in list" :key="order.id" :order="order" :redeeming="redeemingId === order.id" :redeem-disabled="redeemingId !== undefined || loading || loadFailed || recoveryFailed || receipts.has(String(order.id))" @redeem="onRedeem" /></view><EmptyState v-else-if="loadFailed" title="持仓记录加载失败" description="请稍后重试" /><EmptyState v-else-if="!userStore.currentUser" title="请先登录查看持仓" action-text="登录或重试" @action="load()" /><EmptyState v-else title="暂无持仓" /><wd-button v-if="userStore.currentUser && (hasMore || loadFailed)" block plain :loading="loading" :disabled="redeemingId !== undefined" @click="load(loadFailed ? retryReset : false)">{{ loadFailed ? '加载失败，点击重试' : '加载更多' }}</wd-button></view></view></template>
<style lang="scss" scoped>.my-lockup-page { min-height:100%; }.list { padding:24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }</style>
