<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { enums } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import PushTierBadge from '@/components/purchase/push-tier-badge.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchPurchaseDetail } from '@/service/api/purchase';
import { go, useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import { claimPurchase, readClaimReceipts, reconcileClaimReceipts, type ClaimReceipt } from '@/utils/purchase-claim';
import { cancelPurchaseWithReceipt, readPurchaseCancelReceipts, reconcilePurchaseCancel, purchaseCancelMessage, type PurchaseCancelReceipt } from '@/utils/purchase-cancel';
import { getAccessToken } from '@/service/request/token';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const request = ref<Api.PurchaseRequest.PurchaseRequest>();
const id = ref<string>();
const logs = ref<Api.PurchaseRequest.PushLog[]>([]);
const loading = ref(true);
const loadFailed = ref(false);
const operating = ref(false);
const confirmedAction = ref<'claim'>();
const claimReceipt = ref<ClaimReceipt>();
const claimReceiptFailed = ref(false);
const cancelReceipt = ref<PurchaseCancelReceipt>();
const cancelReceiptFailed = ref(false);
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  request.value = undefined;
  logs.value = [];
  loading.value = false;
  loadFailed.value = true;
  operating.value = false;
  confirmedAction.value = undefined;
  claimReceipt.value = undefined;
  claimReceiptFailed.value = false;
  cancelReceipt.value = undefined;
  cancelReceiptFailed.value = false;
});

onLoad(query => { id.value = query?.id ? String(query.id) : undefined; });

const statusMeta = computed(() => (request.value ? enums.PURCHASE_STATUS_META[request.value.status] : undefined));
const isMy = computed(() => !!userStore.realUserId && userStore.realUserId === String(request.value?.customerId ?? ''));
const canCancel = computed(() => page.visible.value && !loading.value && !loadFailed.value && !operating.value && isMy.value
  && !!request.value && ['pending_audit', 'pushing'].includes(request.value.status) && !cancelReceipt.value && !cancelReceiptFailed.value);
const canClaim = computed(() => {
  if (!request.value || !userStore.currentUser || claimReceipt.value || claimReceiptFailed.value) return false;
  return !isMy.value && request.value.status === 'pushing' && userStore.currentUser.isBuyer && userStore.isBuyerActive && userStore.currentUser.kycStatus === 'approved';
});

async function reload() {
  if (!page.visible.value || operating.value) return;
  if (!id.value) { loading.value = false; return; }
  const operation = page.capture();
  const sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      await requireLogin(`/pages/purchase/detail?id=${encodeURIComponent(id.value)}`); return;
    }
    refreshClaimReceipt();
    refreshCancelReceipt();
    const r = await fetchPurchaseDetail(id.value, userStore.realUserId);
    if (!valid()) return;
    if (String(r.request.id) !== id.value) throw new Error('求购详情与请求 ID 不匹配');
    request.value = r.request;
    logs.value = r.pushLogs;
    if (confirmedAction.value === 'claim' && r.request.status !== 'pushing') {
      confirmedAction.value = undefined;
    }
    if (claimReceipt.value?.state === 'unknown' && !claimReceiptFailed.value) {
      await reconcileClaimReceipts(userStore.realUserId || '', valid);
      if (valid()) refreshClaimReceipt();
    }
    if (valid() && isMy.value && cancelReceipt.value && !cancelReceiptFailed.value) {
      const checked = await reconcilePurchaseCancel(userStore.realUserId!, id.value, valid);
      if (valid() && checked && cancelReceipt.value.state !== 'verified'
        && (cancelReceipt.value.state === 'unknown' || checked.state !== 'unknown')) cancelReceipt.value = checked;
    }
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: confirmedAction.value ? '操作已成功，状态刷新失败，请重新加载' : error instanceof Error ? error.message : '求购详情加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}
onShow(() => { if (!operating.value) return reload(); });
onHide(() => { loadSequence++; loading.value = false; });

function refreshCancelReceipt() {
  try {
    const saved = readPurchaseCancelReceipts(userStore.realUserId || '').find(item => String(item.demandId) === id.value);
    if (!cancelReceipt.value || cancelReceipt.value.state === 'unknown' || saved?.state === 'verified'
      || (cancelReceipt.value.state === 'confirmed' && saved?.state === 'confirmed')) cancelReceipt.value = saved;
    cancelReceiptFailed.value = false;
  } catch { cancelReceiptFailed.value = true; }
}

function refreshClaimReceipt() {
  try {
    const saved = readClaimReceipts(userStore.realUserId || '').find(item => String(item.demandId) === id.value);
    if (claimReceipt.value?.state !== 'confirmed' || saved?.state === 'confirmed') claimReceipt.value = saved;
    claimReceiptFailed.value = false;
  } catch { claimReceiptFailed.value = true; }
}

async function claim() {
  if (!page.visible.value || loading.value || loadFailed.value || confirmedAction.value || !request.value || !canClaim.value || operating.value) return;
  const operation = page.capture();
  operating.value = true;
  try {
    const receipt = await claimPurchase(request.value, operation.isCurrent);
    if (!operation.sameSession()) return;
    claimReceipt.value = receipt;
    confirmedAction.value = 'claim';
    if (operation.isCurrent()) uni.showToast({ title: '接单成功', icon: 'success' });
  } catch (error) {
    if (!operation.sameSession()) return;
    refreshClaimReceipt();
    if (operation.isCurrent()) uni.showToast({ title: claimReceipt.value?.state === 'unknown' ? '接单结果尚未确认，请刷新核对，不要重复提交' : error instanceof Error ? error.message : '接单失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      operating.value = false;
      if (page.visible.value) await reload();
    }
  }
}

async function cancel() {
  if (!canCancel.value || !request.value) return;
  const operation = page.capture();
  operating.value = true;
  try {
    const receipt = await cancelPurchaseWithReceipt(request.value, operation.isCurrent);
    if (receipt && operation.sameSession()) cancelReceipt.value = receipt;
    if (receipt && operation.isCurrent()) uni.showToast({ title: purchaseCancelMessage(receipt), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshCancelReceipt();
    if (operation.isCurrent()) uni.showToast({ title: cancelReceipt.value ? purchaseCancelMessage(cancelReceipt.value) : error instanceof Error ? error.message : '撤销失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) { operating.value = false; if (page.visible.value) await reload(); }
  }
}
</script>

<template>
  <view v-if="request" class="detail-page yb-page">
    <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="operating" @click="reload">状态刷新失败，点击重试</wd-button>
    <view class="hero">
      <wd-tag v-if="statusMeta" plain round size="medium">{{ statusMeta.label }}</wd-tag>
      <text class="code">{{ request.code }}</text>
      <text class="title">{{ request.productTitle }}</text>
      <view class="cat"><wd-icon name="goods" size="14px" /><text>{{ request.categoryPath }}</text></view>
    </view>

    <view class="meta">
      <view class="meta-cell">
        <text class="lbl">预算</text>
        <text class="val budget">U {{ formatAmount(request.budgetAmount) }}</text>
      </view>
      <view class="meta-cell">
        <text class="lbl">期望发货</text>
        <text class="val">{{ request.expectedDays }} 天</text>
      </view>
      <view class="meta-cell">
        <text class="lbl">海外</text>
        <text class="val">{{ request.overseasCustoms ? '是' : '否' }}</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">求购说明</text>
      <text class="appeal">{{ request.appeal }}</text>
    </view>

    <view v-if="request.auditNote" class="section review-section">
      <text class="section-title">审核意见</text>
      <text class="appeal">{{ request.auditNote }}</text>
    </view>

    <view v-if="request.status === 'pushing' && (request.currentPushLevel || request.pushedToBuyerIds.length)" class="section">
      <text class="section-title">推送轨迹</text>
      <view class="push-row">
        <PushTierBadge v-if="request.currentPushLevel" :level="request.currentPushLevel" />
        <text class="push-hint">已推送 {{ request.pushedToBuyerIds?.length || 0 }} 位买手</text>
      </view>
    </view>

    <view v-if="logs.length" class="section">
      <text class="section-title">推送日志</text>
      <view v-for="log in logs" :key="log.id" class="log-row">
        <PushTierBadge :level="log.pushLevel" />
        <text class="log-text">{{ log.buyerIds.length }} 位 · {{ new Date(log.pushedAt).toLocaleString() }}</text>
      </view>
    </view>

    <view class="bottom-bar">
      <wd-button v-if="canClaim" type="primary" block :loading="operating" :disabled="operating || loading || loadFailed || !!confirmedAction" @click="claim">我接此单</wd-button>
      <wd-button v-if="isMy && ['pending_audit', 'pushing'].includes(request.status)" type="error" plain :disabled="!canCancel" @click="cancel">撤销</wd-button>
    </view>
  </view>
  <view v-else-if="loading" class="section">正在加载求购详情…</view>
  <EmptyState v-else-if="loadFailed" title="求购详情加载失败" description="请重新加载后继续" action-text="重新加载" @action="reload" />
  <EmptyState v-else-if="!id" title="缺少求购信息" description="请从求购列表进入详情" action-text="查看我的求购" @action="go('/pages/purchase/my-list', true)" />
  <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看求购" action-text="登录或重试" @action="reload" />
  <EmptyState v-else title="求购暂不可读取" action-text="重新加载" @action="reload" />
</template>

<style lang="scss" scoped>
.detail-page { min-height:100%; padding:20rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); }
.hero {
  background: #fff;
  padding: 32rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.code {
  display: block;
  font-family: ui-monospace, monospace;
  font-size: 22rpx;
  color: #86909c;
  margin: 12rpx 0;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
}
.cat {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 8rpx;
}
.meta {
  background: #fff;
  margin-top: 20rpx;
  display: flex;
  padding: 24rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.meta-cell {
  flex: 1;
  text-align: center;
}
.lbl {
  display: block;
  font-size: 22rpx;
  color: #86909c;
}
.val {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  margin-top: 4rpx;
}
.val.budget {
  font-size: 36rpx;
  color: #f53f3f;
  font-family: ui-monospace, monospace;
}
.section {
  background: #fff;
  margin-top: 20rpx;
  padding: 24rpx 32rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.section-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.appeal {
  font-size: 24rpx;
  color: #4e5969;
  line-height: 1.6;
}
.push-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
}
.push-hint {
  font-size: 22rpx;
  color: #86909c;
}
.log-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
  padding: 12rpx 0;
}
.log-text {
  font-size: 22rpx;
  color: #86909c;
}
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--yb-border);
  display: flex;
  gap: 12rpx;
}
</style>
