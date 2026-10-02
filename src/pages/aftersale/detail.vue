<script setup lang="ts">
import ProductSummary from '@/components/common/product-summary.vue';
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { orderRole } from '@/service/api/order';
import { formatUsdt } from '@shared/utils/currency';
import { go, useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { cancelRefundWithReceipt, fetchRefundContext, readRefundCancelReceipts, reconcileRefundCancels, refundCancelMessage, type RefundCancelReceipt } from '@/utils/refund-cancel';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const { requireLogin } = useNavigationGuards();
const userStore = useUserStore();
const refund = ref<Api.RealOrder.OrderRefundDTO>();
const refundId = ref<Api.RealOrder.LongId>();
const loading = ref(false);
const loadFailed = ref(false);
const relatedOrder = ref<Api.RealOrder.OrderView>();
const operating = ref(false);
const cancelReceipt = ref<RefundCancelReceipt>();
const receiptFailed = ref(false);
let loadVersion = 0;
const page = usePageOperation(() => {
  loadVersion++;
  refund.value = undefined; relatedOrder.value = undefined;
  cancelReceipt.value = undefined; receiptFailed.value = false;
  loading.value = false; loadFailed.value = false; operating.value = false;
});
const canCancel = computed(() => page.visible.value && !loading.value && !loadFailed.value && !operating.value
  && !cancelReceipt.value && !receiptFailed.value && !!relatedOrder.value
  && orderRole(relatedOrder.value, userStore.realUserId) === 'customer' && refund.value?.status === 'APPLYING');
const statusLabel: Record<Api.RealOrder.RefundStatus, string> = {
  APPLYING: '待审核', AGREED: '已同意', REJECTED: '已驳回', CANCELED: '已撤销'
};
const status = computed(() => {
  if (refund.value?.status === 'APPLYING' && cancelReceipt.value && cancelReceipt.value.state !== 'unknown') {
    return cancelReceipt.value.state === 'confirmed' || cancelReceipt.value.terminalStatus === 'CANCELED'
      ? '撤销已确认，状态待同步' : '申请已结束，状态待同步';
  }
  return refund.value ? (refund.value.statusText || statusLabel[refund.value.status]) : '';
});
const statusDescription = computed(() => {
  if (!refund.value) return '';
  const descriptions: Record<Api.RealOrder.RefundStatus, string> = {
    APPLYING: '申请已提交，当前正在等待审核。',
    AGREED: '退款申请已同意，资金变化请结合订单与资金流水核对。',
    REJECTED: '申请已驳回，请先阅读审核说明。',
    CANCELED: '申请已撤销，当前订单状态请在关联订单中查看。'
  };
  return cancelReceipt.value ? refundCancelMessage(cancelReceipt.value) : descriptions[refund.value.status] || '请核对当前申请状态。';
});
function formatTime(value?: string | number) {
  if (value == null || value === '') return '';
  const date = /^\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '时间待确认' : date.toLocaleString();
}
function previewEvidence(current: string) {
  if (refund.value?.evidenceImages?.length) uni.previewImage({ current, urls: refund.value.evidenceImages });
}
function refreshReceipt() {
  if (!userStore.realUserId) return;
  try {
    const saved = readRefundCancelReceipts(userStore.realUserId).find(item => String(item.refundId) === String(refundId.value));
    if (!cancelReceipt.value || cancelReceipt.value.state === 'unknown' || saved?.state === 'verified') cancelReceipt.value = saved;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
async function reload() {
  if (!page.visible.value || operating.value || loading.value || refundId.value == null) return;
  const operation = page.capture();
  const version = ++loadVersion;
  const current = () => operation.isCurrent() && version === loadVersion;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.realUserId || !userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料读取失败，请重试');
      await requireLogin(`/pages/aftersale/detail?id=${encodeURIComponent(String(refundId.value))}`);
      return;
    }
    refreshReceipt();
    const context = await fetchRefundContext(refundId.value, userStore.realUserId, current);
    if (!current()) return;
    refund.value = context.refund;
    relatedOrder.value = context.order;
    if (cancelReceipt.value && !receiptFailed.value) {
      await reconcileRefundCancels(userStore.realUserId, current, refundId.value);
      if (current()) refreshReceipt();
    }
  } catch (error) {
    if (!current()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '退款详情读取失败', icon: 'none' });
  } finally {
    if (current()) loading.value = false;
  }
}
onLoad(query => { refundId.value = typeof query?.id === 'string' && query.id ? query.id : undefined; });
onShow(reload);
onHide(() => { loadVersion++; loading.value = false; });

async function cancel() {
  if (!canCancel.value || !refund.value) return;
  const operation = page.capture();
  operating.value = true;
  try {
    const receipt = await cancelRefundWithReceipt(refund.value, operation.isCurrent);
    if (receipt && operation.sameSession()) cancelReceipt.value = receipt;
    if (receipt && operation.isCurrent()) uni.showToast({ title: '申请已撤销', icon: 'success' });
  } catch (error) {
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: cancelReceipt.value ? refundCancelMessage(cancelReceipt.value) : error instanceof Error ? error.message : '撤销失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      operating.value = false;
      if (page.visible.value) await reload();
    }
  }
}
function openOrder() {
  if (page.visible.value && userStore.currentUser && relatedOrder.value) go(`/pages/order/detail?id=${encodeURIComponent(String(relatedOrder.value.id))}`);
}
</script>

<template>
  <view v-if="refund" class="as-detail yb-page">
    <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="operating" @click="reload">详情刷新失败，点击重试（当前为上次记录）</wd-button>
    <view class="hero">
      <view class="status-heading"><text class="status" :class="`status--${refund.status}`">{{ status }}</text><text class="type">仅退款</text></view>
      <text class="status-description">{{ statusDescription }}</text>
      <text class="code">退款单号 {{ refund.refundBizNo || refund.refundId }}</text>
    </view>

    <view v-if="refund.reviewRemark" class="section review-result">
      <text class="section-title">审核说明</text>
      <text class="review-remark">{{ refund.reviewRemark }}</text>
    </view>

    <view v-if="relatedOrder" class="product-context yb-card"><ProductSummary :title="relatedOrder.productTitle" :image="relatedOrder.productCover" :subtitle="relatedOrder.counterpartName" :quantity="relatedOrder.quantity" :reference="`订单 ${relatedOrder.orderNo || relatedOrder.code}`" /></view>
    <view class="section">
      <text class="section-title">退款信息</text>
      <view class="row"><text>关联订单</text><text class="mono">{{ refund.orderNo || refund.orderId }}</text></view>
      <view class="row"><text>退款金额</text><text class="amount">{{ refund.amount == null ? '—' : formatUsdt(refund.amount) }}</text></view>
      <view class="reason-block"><text class="reason-label">退款原因</text><text>{{ refund.reason || '未填写' }}</text></view>
      <view v-if="refund.appliedAt" class="row"><text>申请时间</text><text class="value">{{ formatTime(refund.appliedAt) }}</text></view>
      <view v-if="refund.reviewedAt" class="row"><text>审核时间</text><text class="value">{{ formatTime(refund.reviewedAt) }}</text></view>
      <view v-if="refund.canceledAt" class="row"><text>撤销时间</text><text class="value">{{ formatTime(refund.canceledAt) }}</text></view>
    </view>

    <view v-if="refund.evidenceImages?.length" class="section">
      <text class="section-title">凭证图片</text>
      <view class="evidence"><image v-for="url in refund.evidenceImages" :key="url" :src="url || UI_ASSETS.placeholders.evidence" mode="aspectFill" class="ev-img" @click="previewEvidence(url)" /></view>
    </view>

    <view class="section actions">
      <wd-button plain size="small" :disabled="operating" @click="openOrder">查看关联订单</wd-button>
      <wd-button v-if="canCancel" plain type="warning" size="small" :loading="operating" @click="cancel">撤销申请</wd-button>
    </view>
  </view>
  <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载仅退款详情</text></view>
  <EmptyState v-else-if="loadFailed" title="仅退款详情加载失败" action-text="重新加载" @action="reload" />
  <EmptyState v-else-if="refundId != null && !userStore.currentUser" title="请先登录查看退款详情" action-text="登录或重试" @action="reload" />
  <EmptyState v-else title="缺少退款单信息" description="请从售后列表进入详情" action-text="查看售后列表" @action="go('/pages/aftersale/list', true)" />
</template>

<style lang="scss" scoped>
.status-description { display: block; margin-top: 12rpx; color: var(--yb-muted); font-size: 26rpx; line-height: 1.6; }
.status-heading { display:flex; align-items:baseline; justify-content:space-between; gap:16rpx; }
.review-remark { display: block; color: var(--yb-ink); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 26rpx; line-height: 1.7; }
.row > text:first-child { flex: none; }
.row > text:last-child { min-width: 0; overflow-wrap: anywhere; }
.as-detail { min-height: 100%; padding:24rpx; }.hero, .section { background:#fff; padding:24rpx; border-radius:var(--yb-radius-lg); border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }.section { margin-top:20rpx; }.section + .hero { margin-top:20rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.status { display: block; color: #8b5300; font-size: 36rpx; font-weight: 700; }.status--AGREED { color: #08765e; } .status--REJECTED { color: #b42318; } .status--CANCELED { color: var(--yb-muted); } .type { color: var(--yb-muted); font-size: 24rpx; }.code { display: block; margin-top: 12rpx; color: var(--yb-muted); font-family: ui-monospace, monospace; font-size: 24rpx; overflow-wrap:anywhere; }
.section-title { display: block; margin-bottom: 18rpx; color: #1d2129; font-size: 26rpx; font-weight: 600; }.row { display: flex; justify-content: space-between; gap: 24rpx; margin-top: 14rpx; color: var(--yb-muted); font-size: 24rpx; }.value, .mono { max-width: 68%; color: #4e5969; text-align: right; }.mono { font-family: ui-monospace, monospace; }.amount { color: var(--yb-brand); font-family: var(--yb-font-body); font-size: 28rpx; font-weight: 700; }
.evidence { display: flex; flex-wrap: wrap; gap: 12rpx; }.ev-img { width: 160rpx; height: 160rpx; border-radius: 8rpx; }.section.actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:12rpx; padding:16rpx 0 calc(24rpx + env(safe-area-inset-bottom)); border:0; background:transparent; box-shadow:none; }
.product-context { margin-bottom:20rpx; margin-top:20rpx; }.reason-block { display:flex; flex-direction:column; gap:8rpx; margin-top:20rpx; font-size:26rpx; line-height:1.6; overflow-wrap:anywhere; }.reason-label { color:var(--yb-muted); font-size:24rpx; }
</style>
