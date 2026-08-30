<script setup lang="ts">
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
    <view v-if="cancelReceipt || receiptFailed" class="section">
      <text>{{ receiptFailed ? '本机撤销回执读取失败，暂不能撤销；仍可刷新查看详情' : refundCancelMessage(cancelReceipt) }}</text>
      <wd-button block plain :loading="loading" :disabled="operating" @click="reload">刷新核对</wd-button>
    </view>
    <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="operating" @click="reload">详情刷新失败，点击重试（当前为上次记录）</wd-button>
    <view class="hero">
      <text class="status">{{ status }}</text>
      <text class="type">仅退款</text>
      <text class="code">退款单号 {{ refund.refundBizNo || refund.refundId }}</text>
    </view>

    <view class="section">
      <text class="section-title">退款信息</text>
      <view class="row"><text>关联订单</text><text class="mono">{{ refund.orderNo || refund.orderId }}</text></view>
      <view class="row"><text>退款金额</text><text class="amount">{{ refund.amount == null ? '—' : formatUsdt(refund.amount) }}</text></view>
      <view class="row"><text>退款原因</text><text class="value">{{ refund.reason || '未填写' }}</text></view>
    </view>

    <view v-if="refund.evidenceImages?.length" class="section">
      <text class="section-title">凭证图片</text>
      <view class="evidence"><image v-for="url in refund.evidenceImages" :key="url" :src="url || UI_ASSETS.placeholders.evidence" mode="aspectFill" class="ev-img" /></view>
    </view>

    <view v-if="refund.reviewRemark" class="section">
      <text class="section-title">审核说明</text>
      <text class="value">{{ refund.reviewRemark }}</text>
    </view>

    <view class="section actions">
      <wd-button block plain :disabled="operating" @click="openOrder">查看关联订单</wd-button>
      <wd-button v-if="canCancel" block plain type="warning" class="mt" :loading="operating" @click="cancel">撤销申请</wd-button>
    </view>
  </view>
  <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载仅退款详情</text></view>
  <EmptyState v-else-if="loadFailed" title="仅退款详情加载失败" action-text="重新加载" @action="reload" />
  <EmptyState v-else-if="refundId != null && !userStore.currentUser" title="请先登录查看退款详情" action-text="登录或重试" @action="reload" />
  <EmptyState v-else title="缺少退款单信息" description="请从售后列表进入详情" action-text="查看售后列表" @action="go('/pages/aftersale/list', true)" />
</template>

<style lang="scss" scoped>
.as-detail { min-height: 100%; padding:24rpx; }.hero, .section { background:#fff; padding:24rpx; border-radius:var(--yb-radius-lg); border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }.section { margin-top:20rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.status { display: block; color: #ff7d00; font-size: 36rpx; font-weight: 700; }.type { display: block; margin-top: 8rpx; color: #1d2129; font-size: 28rpx; }.code { display: block; margin-top: 12rpx; color: #86909c; font-family: ui-monospace, monospace; font-size: 22rpx; }
.section-title { display: block; margin-bottom: 18rpx; color: #1d2129; font-size: 26rpx; font-weight: 600; }.row { display: flex; justify-content: space-between; gap: 24rpx; margin-top: 14rpx; color: #86909c; font-size: 24rpx; }.value, .mono { max-width: 68%; color: #4e5969; text-align: right; }.mono { font-family: ui-monospace, monospace; }.amount { color: #f53f3f; font-family: ui-monospace, monospace; font-size: 28rpx; font-weight: 700; }
.evidence { display: flex; flex-wrap: wrap; gap: 12rpx; }.ev-img { width: 160rpx; height: 160rpx; border-radius: 8rpx; }.actions { padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); }.mt { margin-top: 12rpx; }
</style>
